import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { RawTimetable } from "../timetable-format";
import { weekday } from "./time";

export interface Pattern {
  route: number;
  stops: Int32Array;
  /** pickup*4 + dropoff (0 bežne, 1 nie, 2/3 na znamenie) */
  flags: Uint8Array;
  /** Indexy spojov v poradí riadkov `times`. */
  trips: Int32Array;
  /** times[(row * n + pos) * 2] = príchod, +1 = odchod; sekundy od začiatku dňa prevádzky. */
  times: Int32Array;
}

export interface Timetable {
  generatedAt: string;
  feedLastModified: string | null;
  stops: {
    id: string[];
    name: string[];
    lat: Float64Array;
    lon: Float64Array;
    zone: string[];
    platform: string[];
    wheelchair: Uint8Array;
    group: Int32Array;
  };
  stopIndex: Map<string, number>;
  groups: {
    id: string[];
    name: string[];
    lat: Float64Array;
    lon: Float64Array;
    zone: string[];
    stops: number[][];
    /** Linky obsluhujúce uzol (indexy do routes). */
    routes: number[][];
  };
  groupIndex: Map<string, number>;
  routes: RawTimetable["routes"];
  routeIndex: Map<string, number>;
  patterns: Pattern[];
  trips: {
    id: string[];
    pattern: Int32Array;
    row: Int32Array;
    service: Int32Array;
    headsign: string[];
    wheelchair: Uint8Array;
    direction: Uint8Array;
  };
  tripIndex: Map<string, number>;
  /** Pre každú zastávku dvojice [pattern, pozícia, …]. */
  stopPatterns: Int32Array[];
  /** Pre každú zastávku dvojice [cieľová zastávka, sekundy chôdze, …]. */
  footpaths: Int32Array[];
  services: RawTimetable["services"];
  activeServices(date: number): Uint8Array;
}

export const PICKUP_NONE = (flag: number) => flag >> 2 === 1;
export const DROPOFF_NONE = (flag: number) => (flag & 3) === 1;

const WALK_RADIUS_M = 450;
const WALK_SPEED_MS = 1.25;
const WALK_DETOUR = 1.3;

export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function walkSeconds(distM: number): number {
  return Math.max(30, Math.round((distM * WALK_DETOUR) / WALK_SPEED_MS));
}

function load(): Timetable {
  const file = path.join(process.cwd(), "data", "timetable.json");
  if (!fs.existsSync(file)) {
    throw new Error("Chýba data/timetable.json – spusti `npm run data`.");
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as RawTimetable;

  const nStops = raw.stops.id.length;
  const stopIndex = new Map(raw.stops.id.map((id, i) => [id, i]));
  const groupIndex = new Map(raw.groups.id.map((id, i) => [id, i]));
  const routeIndex = new Map(raw.routes.id.map((id, i) => [id, i]));

  const groupStops: number[][] = raw.groups.id.map(() => []);
  raw.stops.group.forEach((g, s) => groupStops[g].push(s));

  const nTrips = raw.trips.id.length;
  const tripRow = new Int32Array(nTrips);
  const patterns: Pattern[] = raw.patterns.route.map((route, p) => {
    const stops = Int32Array.from(raw.patterns.stops[p]);
    const trips = Int32Array.from(raw.patterns.trips[p]);
    const enc = raw.patterns.times[p];
    const times = new Int32Array(enc.length);
    const perTrip = stops.length * 2;
    for (let row = 0; row < trips.length; row++) {
      tripRow[trips[row]] = row;
      let acc = 0;
      for (let k = row * perTrip, end = k + perTrip; k < end; k++) {
        acc += enc[k];
        times[k] = acc;
      }
    }
    return { route, stops, flags: Uint8Array.from(raw.patterns.flags[p]), trips, times };
  });

  // zastávka → vzory
  const spTmp: number[][] = Array.from({ length: nStops }, () => []);
  const groupRouteSets: Set<number>[] = raw.groups.id.map(() => new Set());
  patterns.forEach((pat, p) => {
    pat.stops.forEach((s, pos) => {
      spTmp[s].push(p, pos);
      groupRouteSets[raw.stops.group[s]].add(pat.route);
    });
  });
  const stopPatterns = spTmp.map((a) => Int32Array.from(a));

  // pešie prestupy – mriežka ~500 m
  const lat = Float64Array.from(raw.stops.lat);
  const lon = Float64Array.from(raw.stops.lon);
  const cell = 0.005;
  const grid = new Map<string, number[]>();
  for (let s = 0; s < nStops; s++) {
    const k = `${Math.floor(lat[s] / cell)}:${Math.floor(lon[s] / (cell * 1.5))}`;
    let a = grid.get(k);
    if (!a) grid.set(k, (a = []));
    a.push(s);
  }
  const footpaths: Int32Array[] = new Array(nStops);
  for (let s = 0; s < nStops; s++) {
    const gy = Math.floor(lat[s] / cell);
    const gx = Math.floor(lon[s] / (cell * 1.5));
    const out: number[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const a = grid.get(`${gy + dy}:${gx + dx}`);
        if (!a) continue;
        for (const t of a) {
          if (t === s) continue;
          const d = distanceM(lat[s], lon[s], lat[t], lon[t]);
          const sameGroup = raw.stops.group[s] === raw.stops.group[t];
          if (d <= WALK_RADIUS_M || (sameGroup && d < 1500)) {
            out.push(t, sameGroup ? Math.max(60, walkSeconds(d)) : walkSeconds(d) + 60);
          }
        }
      }
    footpaths[s] = Int32Array.from(out);
  }

  const services = raw.services;
  const activeCache = new Map<number, Uint8Array>();
  const activeServices = (date: number) => {
    let a = activeCache.get(date);
    if (!a) {
      a = new Uint8Array(services.id.length);
      const wd = 1 << weekday(date);
      for (let i = 0; i < a.length; i++) {
        let on = (services.days[i] & wd) !== 0 && date >= services.start[i] && date <= services.end[i];
        if (services.added[i].includes(date)) on = true;
        if (services.removed[i].includes(date)) on = false;
        a[i] = on ? 1 : 0;
      }
      if (activeCache.size > 20) activeCache.clear();
      activeCache.set(date, a);
    }
    return a;
  };

  return {
    generatedAt: raw.generatedAt,
    feedLastModified: raw.feedLastModified,
    stops: {
      id: raw.stops.id,
      name: raw.stops.name,
      lat,
      lon,
      zone: raw.stops.zone,
      platform: raw.stops.platform,
      wheelchair: Uint8Array.from(raw.stops.wheelchair),
      group: Int32Array.from(raw.stops.group),
    },
    stopIndex,
    groups: {
      id: raw.groups.id,
      name: raw.groups.name,
      lat: Float64Array.from(raw.groups.lat),
      lon: Float64Array.from(raw.groups.lon),
      zone: raw.groups.zone,
      stops: groupStops,
      routes: groupRouteSets.map((s) => [...s]),
    },
    groupIndex,
    routes: raw.routes,
    routeIndex,
    patterns,
    trips: {
      id: raw.trips.id,
      pattern: Int32Array.from(raw.trips.pattern),
      row: tripRow,
      service: Int32Array.from(raw.trips.service),
      headsign: raw.trips.headsign,
      wheelchair: Uint8Array.from(raw.trips.wheelchair),
      direction: Uint8Array.from(raw.trips.direction),
    },
    tripIndex: new Map(raw.trips.id.map((id, i) => [id, i])),
    stopPatterns,
    footpaths,
    services,
    activeServices,
  };
}

// V dev režime prežije HMR, na Verceli sa načíta raz na inštanciu.
const g = globalThis as unknown as { __timetable?: Timetable };

export function getTimetable(): Timetable {
  if (!g.__timetable) g.__timetable = load();
  return g.__timetable;
}

/** Informácie o linke vhodné pre klienta. */
export function routeInfo(tt: Timetable, r: number) {
  return {
    id: tt.routes.id[r],
    name: tt.routes.short[r],
    long: tt.routes.long[r],
    type: tt.routes.type[r],
    color: tt.routes.color[r] || null,
    textColor: tt.routes.textColor[r] || null,
  };
}
export type RouteInfo = ReturnType<typeof routeInfo>;

export function tripTime(tt: Timetable, trip: number, pos: number, dep: boolean): number {
  const p = tt.patterns[tt.trips.pattern[trip]];
  return p.times[(tt.trips.row[trip] * p.stops.length + pos) * 2 + (dep ? 1 : 0)];
}
