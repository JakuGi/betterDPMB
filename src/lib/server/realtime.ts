import "server-only";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { distanceM, getTimetable, type Timetable } from "./timetable";
import { addDays, nowSec, pragueDate, serviceDayStart } from "./time";

const RT_URL = process.env.GTFS_RT_URL ?? "https://kordis-jmk.cz/gtfs/gtfsReal.dat";
const CACHE_MS = 10_000;
const MAX_AGE_S = 15 * 60;
const EARLY_LIMIT_S = 8 * 60;

const { transit_realtime } = GtfsRealtimeBindings;

export interface LiveVehicle {
  /** ID vozidla z feedu */
  id: string;
  /** Evidenčné číslo(a) vozidla */
  label: string;
  tripId: string;
  /** Index spoja v cestovnom poriadku, -1 ak spoj nepoznáme */
  trip: number;
  /** Deň prevádzky spoja (YYYYMMDD) */
  date: number | null;
  route: number;
  lat: number;
  lon: number;
  bearing: number | null;
  speed: number | null;
  stopped: boolean;
  /** Index zastávky (cieľová / aktuálna) */
  stop: number;
  /** Pozícia v rámci vzoru spoja */
  pos: number;
  ts: number;
  /** Meškanie v sekundách (záporné = náskok), null ak sa nedá určiť */
  delay: number | null;
}

export interface LiveAlert {
  id: string;
  header: string;
  description: string;
  url: string | null;
  effect: string;
  cause: string;
  routes: number[];
  stops: number[];
  start: number | null;
  end: number | null;
}

interface Snapshot {
  fetchedAt: number;
  feedTimestamp: number;
  vehicles: LiveVehicle[];
  byTrip: Map<number, LiveVehicle>;
  alerts: LiveAlert[];
  error: string | null;
}

const g = globalThis as unknown as { __rt?: Snapshot; __rtInflight?: Promise<Snapshot> | null };

/** RT feed má zastávky s nulami navyše: U01472Z02 → U1472Z2 */
function normStopId(id: string): string {
  const m = /^U0*(\d+)Z0*(\d+)$/.exec(id);
  return m ? `U${m[1]}Z${m[2]}` : id;
}

function text(t: { translation?: { text?: string | null; language?: string | null }[] | null } | null | undefined): string {
  const tr = t?.translation ?? [];
  return (tr.find((x) => x.language?.startsWith("cs")) ?? tr[0])?.text ?? "";
}

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return Number(String(v));
}

/** Nájde deň prevádzky a pozíciu vo vzore, ktoré najlepšie sedia na čas vozidla. */
function locate(tt: Timetable, trip: number, stop: number, ts: number) {
  const pat = tt.patterns[tt.trips.pattern[trip]];
  const n = pat.stops.length;
  const row = tt.trips.row[trip];
  const today = pragueDate(ts);
  let best: { date: number; pos: number; diff: number } | null = null;
  for (const date of [today, addDays(today, -1), addDays(today, 1)]) {
    if (!tt.activeServices(date)[tt.trips.service[trip]]) continue;
    const base = serviceDayStart(date);
    for (let pos = 0; pos < n; pos++) {
      if (stop >= 0 && pat.stops[pos] !== stop) continue;
      if (stop < 0 && pos > 0) break; // bez zastávky vieme určiť len deň podľa začiatku spoja
      const sched = base + pat.times[(row * n + pos) * 2];
      const diff = Math.abs(ts - sched);
      if (!best || diff < best.diff) best = { date, pos, diff };
    }
  }
  if (!best || best.diff > 6 * 3600) return null;
  return stop < 0 ? { ...best, pos: -1 } : best;
}

function computeDelay(tt: Timetable, v: LiveVehicle): number | null {
  if (v.trip < 0 || v.date == null || v.pos < 0) return null;
  const pat = tt.patterns[tt.trips.pattern[v.trip]];
  const n = pat.stops.length;
  const row = tt.trips.row[v.trip];
  const base = serviceDayStart(v.date);
  const arr = (p: number) => base + pat.times[(row * n + p) * 2];
  const dep = (p: number) => base + pat.times[(row * n + p) * 2 + 1];

  if (v.stopped) {
    // Stojí na konečnej po príchode – spoj už skončil, meškanie nevieme.
    if (v.pos === n - 1 && v.ts > arr(v.pos) + 120) return null;
    if (v.ts < arr(v.pos)) return v.ts - arr(v.pos);
    if (v.ts <= dep(v.pos)) return 0;
    return v.ts - dep(v.pos);
  }
  if (v.pos === 0) return Math.max(0, v.ts - dep(0));
  const prev = pat.stops[v.pos - 1];
  const next = pat.stops[v.pos];
  const dPrev = distanceM(tt.stops.lat[prev], tt.stops.lon[prev], v.lat, v.lon);
  const dNext = distanceM(v.lat, v.lon, tt.stops.lat[next], tt.stops.lon[next]);
  const f = dPrev + dNext > 0 ? Math.min(1, dPrev / (dPrev + dNext)) : 0;
  const sched = dep(v.pos - 1) + f * (arr(v.pos) - dep(v.pos - 1));
  return Math.round(v.ts - sched);
}

async function fetchSnapshot(prev: Snapshot | undefined): Promise<Snapshot> {
  const tt = getTimetable();
  try {
    const res = await fetch(RT_URL, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const feed = transit_realtime.FeedMessage.decode(buf);
    const now = nowSec();

    const alerts: LiveAlert[] = [];
    // Feed posiela to isté vozidlo viackrát – s ID spojov pre rôzne varianty kalendára
    // (napr. školský / prázdninový). Necháme kandidáta, ktorý dnes jazdí a časovo sedí najlepšie.
    const candidates = new Map<string, { v: LiveVehicle; diff: number }>();

    for (const e of feed.entity) {
      const vp = e.vehicle;
      if (vp?.position) {
        const ts = num(vp.timestamp) || num(feed.header.timestamp);
        if (now - ts > MAX_AGE_S) continue;
        const tripId = vp.trip?.tripId ?? "";
        const trip = tt.tripIndex.get(tripId) ?? -1;
        const stop = vp.stopId ? (tt.stopIndex.get(normStopId(vp.stopId)) ?? -1) : -1;
        const loc = trip >= 0 ? locate(tt, trip, stop, ts) : null;
        const label = vp.vehicle?.label || vp.vehicle?.id || e.id;

        const v: LiveVehicle = {
          id: vp.vehicle?.id || e.id,
          label,
          tripId,
          trip,
          date: loc?.date ?? null,
          route: trip >= 0 ? tt.patterns[tt.trips.pattern[trip]].route : -1,
          lat: vp.position.latitude,
          lon: vp.position.longitude,
          bearing: vp.position.bearing ?? null,
          speed: vp.position.speed ?? null,
          stopped: vp.currentStatus === transit_realtime.VehiclePosition.VehicleStopStatus.STOPPED_AT,
          stop,
          pos: loc?.pos ?? -1,
          ts,
          delay: null,
        };
        v.delay = computeDelay(tt, v);
        // Výrazný „náskok“ znamená, že vozidlo má spoj len predpriradený (ešte dokončuje predošlý).
        if (v.delay != null && (v.delay < -EARLY_LIMIT_S || v.delay > 180 * 60)) v.delay = null;
        const diff = loc ? loc.diff : Infinity;
        const prev = candidates.get(label);
        if (!prev || diff < prev.diff) candidates.set(label, { v, diff });
      }

      const al = e.alert;
      if (al) {
        const routes = new Set<number>();
        const stops = new Set<number>();
        for (const ie of al.informedEntity ?? []) {
          if (ie.routeId) {
            const r = tt.routeIndex.get(ie.routeId) ?? tt.routeIndex.get(`L${ie.routeId}D99`);
            if (r !== undefined) routes.add(r);
          }
          if (ie.stopId) {
            const s = tt.stopIndex.get(normStopId(ie.stopId));
            if (s !== undefined) stops.add(s);
          }
        }
        const period = al.activePeriod?.[0];
        alerts.push({
          id: e.id,
          header: text(al.headerText),
          description: text(al.descriptionText).trim(),
          url: text(al.url) || null,
          effect: String(al.effect ?? ""),
          cause: String(al.cause ?? ""),
          routes: [...routes],
          stops: [...stops],
          start: period?.start ? num(period.start) : null,
          end: period?.end ? num(period.end) : null,
        });
      }
    }

    const vehicles: LiveVehicle[] = [];
    const byTrip = new Map<number, LiveVehicle>();
    for (const { v } of candidates.values()) {
      // Spriahnuté vozidlá (dve električky na jednom spoji) zlúčime do jedného záznamu.
      const existing = v.trip >= 0 && v.date != null ? byTrip.get(v.trip) : undefined;
      if (existing) {
        existing.label += `+${v.label}`;
        continue;
      }
      vehicles.push(v);
      if (v.trip >= 0 && v.date != null) byTrip.set(v.trip, v);
    }

    return {
      fetchedAt: Date.now(),
      feedTimestamp: num(feed.header.timestamp),
      vehicles,
      byTrip,
      alerts,
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("GTFS-RT:", msg);
    if (prev) return { ...prev, fetchedAt: Date.now(), error: msg };
    return { fetchedAt: Date.now(), feedTimestamp: 0, vehicles: [], byTrip: new Map(), alerts: [], error: msg };
  }
}

export async function getRealtime(): Promise<Snapshot> {
  const cur = g.__rt;
  if (cur && Date.now() - cur.fetchedAt < CACHE_MS) return cur;
  if (!g.__rtInflight) {
    g.__rtInflight = fetchSnapshot(cur).then((s) => {
      g.__rt = s;
      g.__rtInflight = null;
      return s;
    });
  }
  // Ak máme staršie dáta, nečakáme na sieť dlhšie než treba.
  return g.__rtInflight;
}
