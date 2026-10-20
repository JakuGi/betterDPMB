import "server-only";
import type {
  AlertDTO,
  DepartureDTO,
  DeparturesResponse,
  LineDTO,
  StopGroupDTO,
  TripDetailDTO,
  VehicleDTO,
  VehiclesResponse,
} from "../api-types";
import { getRealtime, type LiveAlert, type LiveVehicle } from "./realtime";
import { addDays, nowSec, pragueDate, serviceDayStart } from "./time";
import { DROPOFF_NONE, PICKUP_NONE, getTimetable, routeInfo, type Timetable } from "./timetable";

// ---------- pomocné prevody ----------

export function alertDTO(tt: Timetable, a: LiveAlert): AlertDTO {
  return {
    id: a.id,
    header: a.header,
    description: a.description,
    url: a.url,
    effect: a.effect,
    lines: a.routes.map((r) => tt.routes.short[r]),
    stops: [...new Set(a.stops.map((s) => tt.groups.id[tt.stops.group[s]]))],
    start: a.start,
    end: a.end,
  };
}

export function vehicleDTO(tt: Timetable, v: LiveVehicle): VehicleDTO {
  let nextStop: string | null = null;
  if (v.stop >= 0) nextStop = tt.stops.name[v.stop];
  return {
    id: v.id,
    label: v.label,
    tripId: v.tripId,
    date: v.date,
    route: v.route >= 0 ? routeInfo(tt, v.route) : null,
    headsign: v.trip >= 0 ? tt.trips.headsign[v.trip] : "",
    lat: v.lat,
    lon: v.lon,
    bearing: v.bearing,
    delay: v.delay,
    stopped: v.stopped,
    nextStop,
    wheelchair: v.trip >= 0 ? tt.trips.wheelchair[v.trip] === 1 : false,
    ts: v.ts,
  };
}

// ---------- zoznam zastávok ----------

let groupsCache: StopGroupDTO[] | null = null;

export function stopGroups(): StopGroupDTO[] {
  if (groupsCache) return groupsCache;
  const tt = getTimetable();
  const collator = new Intl.Collator("cs", { numeric: true });
  groupsCache = tt.groups.id.map((id, g) => {
    const routes = tt.groups.routes[g];
    return {
      id,
      name: tt.groups.name[g],
      lat: tt.groups.lat[g],
      lon: tt.groups.lon[g],
      zone: tt.groups.zone[g],
      lines: [...new Set(routes.map((r) => tt.routes.short[r]))].sort(collator.compare),
      types: [...new Set(routes.map((r) => tt.routes.type[r]))],
    };
  });
  return groupsCache;
}

// ---------- odchody ----------

/** Odhad meškania pre zastávku na pozícii `pos`. undefined = vozidlo už zastávku prešlo. */
export function delayAt(v: LiveVehicle | undefined, date: number, pos: number): { delay: number | null; atStop: boolean } | undefined {
  if (!v || v.date !== date || v.delay == null || v.pos < 0) return { delay: null, atStop: false };
  if (v.pos > pos) return undefined;
  if (v.pos === pos && v.stopped) return { delay: v.delay, atStop: true };
  // Na nasledujúcich zastávkach vozidlo spravidla nejde skôr, než má.
  return { delay: Math.max(0, v.delay), atStop: false };
}

export async function departures(groupId: string, at: number | null, limit: number): Promise<DeparturesResponse | null> {
  const tt = getTimetable();
  const g = tt.groupIndex.get(groupId);
  if (g === undefined) return null;
  const now = nowSec();
  const T = at ?? now;
  const live = Math.abs(T - now) < 3600;
  const rt = live ? await getRealtime() : null;

  const windowBack = 60 * 60;
  const windowFwd = 6 * 3600;
  const today = pragueDate(T);
  const dates = [addDays(today, -1), today, addDays(today, 1)];
  const out: (DepartureDTO & { est: number })[] = [];

  for (const s of tt.groups.stops[g]) {
    const sp = tt.stopPatterns[s];
    for (let k = 0; k < sp.length; k += 2) {
      const p = sp[k];
      const pos = sp[k + 1];
      const pat = tt.patterns[p];
      const n = pat.stops.length;
      if (pos === n - 1) continue; // konečná – žiadny odchod
      const flag = pat.flags[pos];
      if (PICKUP_NONE(flag)) continue;
      for (const date of dates) {
        const base = serviceDayStart(date);
        const active = tt.activeServices(date);
        for (let row = 0; row < pat.trips.length; row++) {
          const sched = base + pat.times[(row * n + pos) * 2 + 1];
          if (sched < T - windowBack) continue;
          if (sched > T + windowFwd) break;
          const trip = pat.trips[row];
          if (!active[tt.trips.service[trip]]) continue;
          const v = rt?.byTrip.get(trip);
          const d = delayAt(v, date, pos);
          if (!d) continue;
          const est = sched + (d.delay ?? 0);
          if (d.delay == null ? sched < T - 30 : est < T - 30 && !d.atStop) continue;
          out.push({
            tripId: tt.trips.id[trip],
            date,
            route: routeInfo(tt, pat.route),
            headsign: tt.trips.headsign[trip],
            stopId: tt.stops.id[s],
            platform: tt.stops.platform[s],
            scheduled: sched,
            delay: d.delay,
            atStop: d.atStop,
            vehicle: v && d.delay != null ? v.label : null,
            wheelchair: tt.trips.wheelchair[trip] === 1,
            onRequest: (flag >> 2) >= 2 || (flag & 3) >= 2,
            est,
          });
        }
      }
    }
  }

  out.sort((a, b) => a.est - b.est || a.scheduled - b.scheduled);
  const stopsInGroup = new Set(tt.groups.stops[g]);
  const routesHere = new Set(tt.groups.routes[g]);
  const alerts = (rt?.alerts ?? [])
    .filter((a) => a.stops.some((s) => stopsInGroup.has(s)) || a.routes.some((r) => routesHere.has(r)))
    .map((a) => alertDTO(tt, a));

  return {
    group: { id: groupId, name: tt.groups.name[g], lat: tt.groups.lat[g], lon: tt.groups.lon[g], zone: tt.groups.zone[g] },
    platforms: tt.groups.stops[g].map((s) => ({ id: tt.stops.id[s], platform: tt.stops.platform[s], lat: tt.stops.lat[s], lon: tt.stops.lon[s] })),
    departures: out.slice(0, limit).map(({ est: _est, ...d }) => d),
    alerts,
    now,
    realtimeOk: !!rt && !rt.error,
  };
}

// ---------- vozidlá ----------

export async function vehicles(): Promise<VehiclesResponse> {
  const tt = getTimetable();
  const rt = await getRealtime();
  return {
    vehicles: rt.vehicles.map((v) => vehicleDTO(tt, v)),
    feedTimestamp: rt.feedTimestamp,
    error: rt.error,
  };
}

// ---------- detail spoja ----------

export async function tripDetail(tripId: string, dateParam: number | null): Promise<TripDetailDTO | null> {
  const tt = getTimetable();
  const trip = tt.tripIndex.get(tripId);
  if (trip === undefined) return null;
  const rt = await getRealtime();
  const v = rt.byTrip.get(trip);
  const pat = tt.patterns[tt.trips.pattern[trip]];
  const n = pat.stops.length;
  const row = tt.trips.row[trip];

  let date = dateParam;
  if (date == null) {
    // najbližší deň, kedy spoj jazdí
    date = v?.date ?? null;
    if (date == null) {
      const today = pragueDate(nowSec());
      for (let i = 0; i < 8 && date == null; i++) {
        const d = addDays(today, i);
        if (tt.activeServices(d)[tt.trips.service[trip]]) date = d;
      }
      date ??= today;
    }
  }
  const base = serviceDayStart(date);
  const vehicleOnThisDay = v && v.date === date ? v : undefined;

  const stops = Array.from({ length: n }, (_, pos) => {
    const s = pat.stops[pos];
    const flag = pat.flags[pos];
    return {
      stopId: tt.stops.id[s],
      groupId: tt.groups.id[tt.stops.group[s]],
      name: tt.stops.name[s],
      platform: tt.stops.platform[s],
      lat: tt.stops.lat[s],
      lon: tt.stops.lon[s],
      arr: base + pat.times[(row * n + pos) * 2],
      dep: base + pat.times[(row * n + pos) * 2 + 1],
      onRequest: (flag >> 2) >= 2 || (flag & 3) >= 2,
      noBoarding: PICKUP_NONE(flag),
      noAlighting: DROPOFF_NONE(flag),
    };
  });

  return {
    tripId,
    date,
    route: routeInfo(tt, pat.route),
    headsign: tt.trips.headsign[trip],
    wheelchair: tt.trips.wheelchair[trip] === 1,
    stops,
    vehicle: vehicleOnThisDay ? vehicleDTO(tt, vehicleOnThisDay) : null,
    currentIndex: vehicleOnThisDay && vehicleOnThisDay.pos >= 0 ? vehicleOnThisDay.pos : null,
    alerts: rt.alerts.filter((a) => a.routes.includes(pat.route)).map((a) => alertDTO(tt, a)),
  };
}

// ---------- linka ----------

export async function lineDetail(routeId: string): Promise<LineDTO | null> {
  const tt = getTimetable();
  const r = tt.routeIndex.get(routeId);
  if (r === undefined) return null;
  const rt = await getRealtime();

  // Pre každý smer vyberieme vzor s najviac spojmi.
  const byDir = new Map<string, { p: number; trips: number }>();
  tt.patterns.forEach((pat, p) => {
    if (pat.route !== r) return;
    const key = `${tt.trips.direction[pat.trips[0]]}`;
    const cur = byDir.get(key);
    if (!cur || pat.trips.length > cur.trips) byDir.set(key, { p, trips: pat.trips.length });
  });
  const directions = [...byDir.values()]
    .sort((a, b) => b.trips - a.trips)
    .map(({ p }) => {
      const pat = tt.patterns[p];
      let total = 0;
      tt.patterns.forEach((q) => {
        if (q.route === r && tt.trips.direction[q.trips[0]] === tt.trips.direction[pat.trips[0]]) total += q.trips.length;
      });
      return {
        headsign: tt.trips.headsign[pat.trips[0]],
        stops: Array.from(pat.stops, (s) => ({
          groupId: tt.groups.id[tt.stops.group[s]],
          name: tt.stops.name[s],
          lat: tt.stops.lat[s],
          lon: tt.stops.lon[s],
        })),
        trips: total,
      };
    });

  return {
    route: routeInfo(tt, r),
    directions,
    vehicles: rt.vehicles.filter((v) => v.route === r).map((v) => vehicleDTO(tt, v)),
    alerts: rt.alerts.filter((a) => a.routes.includes(r)).map((a) => alertDTO(tt, a)),
  };
}

export function allRoutes() {
  const tt = getTimetable();
  return tt.routes.id.map((_, r) => routeInfo(tt, r));
}

export async function alerts(): Promise<AlertDTO[]> {
  const tt = getTimetable();
  const rt = await getRealtime();
  return rt.alerts.map((a) => alertDTO(tt, a));
}
