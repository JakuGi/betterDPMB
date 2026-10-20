import "server-only";
import type { JourneyDTO, LegDTO, LegPlace, PlaceParam, PlanResponse, RideLegDTO } from "../api-types";
import { delayAt } from "./queries";
import { getRealtime } from "./realtime";
import { addDays, nowSec, pragueDate, serviceDayStart } from "./time";
import { DROPOFF_NONE, PICKUP_NONE, distanceM, getTimetable, routeInfo, walkSeconds, type Timetable } from "./timetable";

/**
 * Vyhľadávanie spojení algoritmom RAPTOR (Delling, Pajor, Werneck 2012).
 * Kolo k = najlepšie príchody s k jazdami; výsledkom je Pareto množina (čas príchodu × počet prestupov).
 */

const MAX_ROUNDS = 6; // max. 5 prestupov
const CHANGE_BUFFER = 60; // rezerva na prestup v tej istej zastávke
const ACCESS_RADIUS_M = 900;

interface Access {
  stop: number;
  walk: number;
}

interface Day {
  date: number;
  base: number;
  active: Uint8Array;
}

interface TripRef {
  trip: number;
  row: number;
  day: number;
}

interface Labels {
  arr: Float64Array[];
  type: Int8Array[]; // 0 nič, 1 štart, 2 jazda, 3 chôdza
  trip: Int32Array[];
  day: Int8Array[];
  boardPos: Int32Array[];
  alightPos: Int32Array[];
  from: Int32Array[];
}

interface Options {
  wheelchair: boolean;
  maxTransfers: number;
  /** false = presuny pešo len medzi stanovišťami tej istej zastávky */
  walking: boolean;
}

function resolveAccess(tt: Timetable, place: PlaceParam): Access[] {
  if (place.kind === "group") {
    const g = tt.groupIndex.get(place.id);
    if (g === undefined) return [];
    return tt.groups.stops[g].map((stop) => ({ stop, walk: 0 }));
  }
  const cands: Access[] = [];
  const all: { stop: number; d: number }[] = [];
  for (let s = 0; s < tt.stops.id.length; s++) {
    const d = distanceM(place.lat, place.lon, tt.stops.lat[s], tt.stops.lon[s]);
    if (d <= ACCESS_RADIUS_M) cands.push({ stop: s, walk: walkSeconds(d) });
    else if (d < 3000) all.push({ stop: s, d });
  }
  if (cands.length < 3) {
    all.sort((a, b) => a.d - b.d);
    for (const x of all.slice(0, 6 - cands.length)) cands.push({ stop: x.stop, walk: walkSeconds(x.d) });
  }
  return cands;
}

function runRaptor(tt: Timetable, sources: Access[], targets: Access[], T: number, days: Day[], opts: Options) {
  const nStops = tt.stops.id.length;
  const K = Math.min(MAX_ROUNDS, opts.maxTransfers + 1);
  const L: Labels = { arr: [], type: [], trip: [], day: [], boardPos: [], alightPos: [], from: [] };
  for (let k = 0; k <= K; k++) {
    L.arr.push(new Float64Array(nStops).fill(Infinity));
    L.type.push(new Int8Array(nStops));
    L.trip.push(new Int32Array(nStops));
    L.day.push(new Int8Array(nStops));
    L.boardPos.push(new Int32Array(nStops));
    L.alightPos.push(new Int32Array(nStops));
    L.from.push(new Int32Array(nStops));
  }
  const best = new Float64Array(nStops).fill(Infinity);
  const targetWalk = new Map(targets.map((t) => [t.stop, t.walk]));
  let marked = new Uint8Array(nStops);
  let markedList: number[] = [];

  for (const { stop, walk } of sources) {
    const t = T + walk;
    if (t < L.arr[0][stop]) {
      L.arr[0][stop] = t;
      best[stop] = t;
      L.type[0][stop] = 1;
      L.from[0][stop] = walk;
      if (!marked[stop]) {
        marked[stop] = 1;
        markedList.push(stop);
      }
    }
  }

  const targetBound = () => {
    let b = Infinity;
    for (const [s, w] of targetWalk) b = Math.min(b, best[s] + w);
    return b;
  };

  const patFirst = new Int32Array(tt.patterns.length).fill(-1);
  const results: { k: number; stop: number; arr: number }[] = [];
  let bestResult = Infinity;

  for (let k = 1; k <= K; k++) {
    // vzory, ktorých sa dotkli zmenené zastávky
    const queue: number[] = [];
    for (const s of markedList) {
      const sp = tt.stopPatterns[s];
      for (let i = 0; i < sp.length; i += 2) {
        const p = sp[i];
        const pos = sp[i + 1];
        if (patFirst[p] === -1) {
          queue.push(p);
          patFirst[p] = pos;
        } else if (pos < patFirst[p]) patFirst[p] = pos;
      }
    }
    for (const s of markedList) marked[s] = 0;
    markedList = [];
    const nextMarked = new Uint8Array(nStops);
    const nextList: number[] = [];
    const prevArr = L.arr[k - 1];
    const prevType = L.type[k - 1];
    const arrK = L.arr[k];
    let bound = targetBound();

    for (const p of queue) {
      const start = patFirst[p];
      patFirst[p] = -1;
      const pat = tt.patterns[p];
      const n = pat.stops.length;
      let cur: TripRef | null = null;
      let boardPos = -1;

      for (let pos = start; pos < n; pos++) {
        const s = pat.stops[pos];
        const flag = pat.flags[pos];
        if (cur && !DROPOFF_NONE(flag)) {
          const a = days[cur.day].base + pat.times[(cur.row * n + pos) * 2];
          if (a < best[s] && a < bound) {
            arrK[s] = a;
            best[s] = a;
            L.type[k][s] = 2;
            L.trip[k][s] = cur.trip;
            L.day[k][s] = cur.day;
            L.boardPos[k][s] = boardPos;
            L.alightPos[k][s] = pos;
            L.from[k][s] = pat.stops[boardPos];
            if (!nextMarked[s]) {
              nextMarked[s] = 1;
              nextList.push(s);
            }
            if (targetWalk.has(s)) bound = targetBound();
          }
        }
        if (prevArr[s] === Infinity || PICKUP_NONE(flag) || pos === n - 1) continue;
        const ready = prevArr[s] + (prevType[s] === 2 ? CHANGE_BUFFER : 0);
        if (cur && days[cur.day].base + pat.times[(cur.row * n + pos) * 2 + 1] <= ready) continue;
        const et = earliestTrip(tt, pat, pos, ready, days, opts);
        if (!et) continue;
        if (
          !cur ||
          days[et.day].base + pat.times[(et.row * n + pos) * 2 + 1] < days[cur.day].base + pat.times[(cur.row * n + pos) * 2 + 1]
        ) {
          cur = et;
          boardPos = pos;
        }
      }
    }

    // pešie presuny zo zastávok, kam sme v tomto kole dorazili jazdou
    for (const s of [...nextList]) {
      const fp = tt.footpaths[s];
      for (let i = 0; i < fp.length; i += 2) {
        const t = fp[i];
        if (!opts.walking && tt.stops.group[t] !== tt.stops.group[s]) continue;
        const a = arrK[s] + fp[i + 1];
        if (a < best[t] && a < bound) {
          arrK[t] = a;
          best[t] = a;
          L.type[k][t] = 3;
          L.from[k][t] = s;
          if (!nextMarked[t]) {
            nextMarked[t] = 1;
            nextList.push(t);
          }
          if (targetWalk.has(t)) bound = targetBound();
        }
      }
    }

    // výsledky tohto kola
    let roundBest: { stop: number; arr: number } | null = null;
    for (const [s, w] of targetWalk) {
      const a = arrK[s] + w;
      if (a < (roundBest?.arr ?? Infinity)) roundBest = { stop: s, arr: a };
    }
    if (roundBest && roundBest.arr < bestResult) {
      bestResult = roundBest.arr;
      results.push({ k, ...roundBest });
    }

    marked = nextMarked;
    markedList = nextList;
    if (!markedList.length) break;
  }

  return { L, results, targetWalk };
}

function earliestTrip(
  tt: Timetable,
  pat: Timetable["patterns"][number],
  pos: number,
  t: number,
  days: Day[],
  opts: Options,
): TripRef | null {
  const n = pat.stops.length;
  const rows = pat.trips.length;
  let bestRef: TripRef | null = null;
  let bestDep = Infinity;
  for (let d = 0; d < days.length; d++) {
    const { base, active } = days[d];
    const raw = t - base;
    // binárne hľadanie – spoje sú zoradené podľa odchodu (predpokladáme, že sa nepredbiehajú)
    let lo = 0;
    let hi = rows;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pat.times[(mid * n + pos) * 2 + 1] < raw) lo = mid + 1;
      else hi = mid;
    }
    for (let row = lo; row < rows; row++) {
      const dep = base + pat.times[(row * n + pos) * 2 + 1];
      if (dep >= bestDep) break;
      if (dep < t) continue;
      const trip = pat.trips[row];
      if (!active[tt.trips.service[trip]]) continue;
      if (opts.wheelchair && tt.trips.wheelchair[trip] !== 1) continue;
      bestRef = { trip, row, day: d };
      bestDep = dep;
      break;
    }
  }
  return bestRef;
}

function stopPlace(tt: Timetable, s: number): LegPlace {
  return {
    name: tt.stops.name[s],
    groupId: tt.groups.id[tt.stops.group[s]],
    stopId: tt.stops.id[s],
    platform: tt.stops.platform[s],
    lat: tt.stops.lat[s],
    lon: tt.stops.lon[s],
  };
}

function coordPlace(place: PlaceParam & { kind: "coord" }): LegPlace {
  return { name: place.label || "Moja poloha", groupId: null, stopId: null, platform: null, lat: place.lat, lon: place.lon };
}

function reconstruct(
  tt: Timetable,
  res: ReturnType<typeof runRaptor>,
  r: { k: number; stop: number; arr: number },
  days: Day[],
  from: PlaceParam,
  to: PlaceParam,
): LegDTO[] {
  const { L } = res;
  const legs: LegDTO[] = [];
  let k = r.k;
  let s = r.stop;
  for (let guard = 0; guard < 40; guard++) {
    const type = L.type[k][s];
    if (type === 1) {
      const walk = L.from[k][s];
      if (from.kind === "coord" && walk > 0) {
        const p = stopPlace(tt, s);
        legs.unshift({
          type: "walk",
          from: coordPlace(from),
          to: p,
          dep: L.arr[k][s] - walk,
          arr: L.arr[k][s],
          distance: Math.round(distanceM(from.lat, from.lon, p.lat, p.lon)),
        });
      }
      break;
    }
    if (type === 3) {
      const f = L.from[k][s];
      legs.unshift({
        type: "walk",
        from: stopPlace(tt, f),
        to: stopPlace(tt, s),
        dep: L.arr[k][f],
        arr: L.arr[k][s],
        distance: Math.round(distanceM(tt.stops.lat[f], tt.stops.lon[f], tt.stops.lat[s], tt.stops.lon[s])),
      });
      s = f;
      continue;
    }
    if (type === 2) {
      const trip = L.trip[k][s];
      const day = days[L.day[k][s]];
      const pat = tt.patterns[tt.trips.pattern[trip]];
      const n = pat.stops.length;
      const row = tt.trips.row[trip];
      const bp = L.boardPos[k][s];
      const ap = L.alightPos[k][s];
      const stops: RideLegDTO["stops"] = [];
      for (let pos = bp; pos <= ap; pos++) {
        const st = pat.stops[pos];
        stops.push({
          name: tt.stops.name[st],
          groupId: tt.groups.id[tt.stops.group[st]],
          time: day.base + pat.times[(row * n + pos) * 2 + (pos === bp ? 1 : 0)],
          lat: tt.stops.lat[st],
          lon: tt.stops.lon[st],
        });
      }
      legs.unshift({
        type: "ride",
        tripId: tt.trips.id[trip],
        date: day.date,
        route: routeInfo(tt, pat.route),
        headsign: tt.trips.headsign[trip],
        from: stopPlace(tt, pat.stops[bp]),
        to: stopPlace(tt, pat.stops[ap]),
        dep: day.base + pat.times[(row * n + bp) * 2 + 1],
        arr: day.base + pat.times[(row * n + ap) * 2],
        stops,
        delay: null,
        vehicle: null,
        wheelchair: tt.trips.wheelchair[trip] === 1,
      });
      s = pat.stops[bp];
      k--;
      continue;
    }
    break;
  }

  const lastWalk = res.targetWalk.get(r.stop) ?? 0;
  if (to.kind === "coord" && lastWalk > 0 && legs.length) {
    const p = stopPlace(tt, r.stop);
    const last = legs[legs.length - 1];
    legs.push({
      type: "walk",
      from: p,
      to: coordPlace(to),
      dep: last.arr,
      arr: last.arr + lastWalk,
      distance: Math.round(distanceM(p.lat, p.lon, to.lat, to.lon)),
    });
  }

  // Chôdzu na začiatku posunieme tesne pred prvý odjazd.
  const firstRide = legs.findIndex((l) => l.type === "ride");
  if (firstRide > 0) {
    let t = legs[firstRide].dep;
    for (let i = firstRide - 1; i >= 0; i--) {
      const dur = legs[i].arr - legs[i].dep;
      legs[i] = { ...legs[i], arr: t, dep: t - dur };
      t -= dur;
    }
  }
  return legs;
}

function placeName(tt: Timetable, p: PlaceParam): string {
  if (p.kind === "group") {
    const g = tt.groupIndex.get(p.id);
    return g === undefined ? p.id : tt.groups.name[g];
  }
  return p.label || "Moja poloha";
}

export async function plan(
  from: PlaceParam,
  to: PlaceParam,
  T: number,
  opts: Partial<Options> & { count?: number } = {},
): Promise<PlanResponse> {
  const tt = getTimetable();
  const options: Options = { wheelchair: !!opts.wheelchair, maxTransfers: opts.maxTransfers ?? 4, walking: opts.walking ?? true };
  const count = opts.count ?? 5;
  const sources = resolveAccess(tt, from);
  const targets = resolveAccess(tt, to);
  const response: PlanResponse = { journeys: [], from: placeName(tt, from), to: placeName(tt, to), searchTime: T };
  if (!sources.length || !targets.length) return response;

  const d0 = pragueDate(T);
  const days: Day[] = [addDays(d0, -1), d0, addDays(d0, 1)].map((date) => ({
    date,
    base: serviceDayStart(date),
    active: tt.activeServices(date),
  }));

  const found = new Map<string, JourneyDTO>();
  let t = T;
  for (let iter = 0; iter < 10 && found.size < count + 2; iter++) {
    const res = runRaptor(tt, sources, targets, t, days, options);
    if (!res.results.length) break;
    let nextT = Infinity;
    for (const r of res.results) {
      const legs = reconstruct(tt, res, r, days, from, to);
      const rides = legs.filter((l): l is RideLegDTO => l.type === "ride");
      if (!rides.length) continue;
      const key = rides.map((l) => `${l.tripId}@${l.date}:${l.from.stopId}>${l.to.stopId}`).join("|");
      const journey: JourneyDTO = {
        id: key,
        dep: legs[0].dep,
        arr: legs[legs.length - 1].arr,
        transfers: rides.length - 1,
        walk: legs.filter((l) => l.type === "walk").reduce((a, l) => a + (l.arr - l.dep), 0),
        legs,
      };
      if (!found.has(key)) found.set(key, journey);
      nextT = Math.min(nextT, rides[0].dep - (rides[0].from.stopId ? sources.find((s) => tt.stops.id[s.stop] === rides[0].from.stopId)?.walk ?? 0 : 0));
    }
    if (!Number.isFinite(nextT)) break;
    t = Math.max(t + 60, nextT + 60);
  }

  // odstránime dominované spojenia (neskorší odchod, skorší príchod, menej prestupov)
  const list = [...found.values()];
  const kept = list.filter(
    (a) =>
      !list.some(
        (b) =>
          b !== a &&
          b.dep >= a.dep &&
          b.arr <= a.arr &&
          b.transfers <= a.transfers &&
          (b.dep > a.dep || b.arr < a.arr || b.transfers < a.transfers),
      ),
  );
  kept.sort((a, b) => a.dep - b.dep || a.arr - b.arr);
  response.journeys = kept.slice(0, count);

  // online meškania spojov, ktoré práve jazdia
  if (Math.abs(T - nowSec()) < 3 * 3600) {
    const rt = await getRealtime();
    for (const j of response.journeys) {
      for (const leg of j.legs) {
        if (leg.type !== "ride") continue;
        const trip = tt.tripIndex.get(leg.tripId)!;
        const v = rt.byTrip.get(trip);
        const pat = tt.patterns[tt.trips.pattern[trip]];
        const bp = pat.stops.indexOf(tt.stopIndex.get(leg.from.stopId!)!);
        const d = delayAt(v, leg.date, bp);
        if (d && d.delay != null) {
          leg.delay = d.delay;
          leg.vehicle = v!.label;
        }
      }
    }
  }
  return response;
}
