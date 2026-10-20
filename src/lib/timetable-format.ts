// Formát predspracovaného cestovného poriadku (data/timetable.json).
// Generuje ho scripts/build-gtfs.ts, číta src/lib/server/timetable.ts.

export interface RawTimetable {
  version: 1;
  generatedAt: string;
  feedLastModified: string | null;
  stops: {
    id: string[];
    name: string[];
    lat: number[];
    lon: number[];
    zone: string[];
    /** Označenie nástupišťa (platform_code alebo číslo stanovišťa „Zx“). */
    platform: string[];
    wheelchair: number[];
    group: number[];
  };
  groups: {
    /** Číslo uzla IDS JMK, napr. „U1472“. */
    id: string[];
    name: string[];
    lat: number[];
    lon: number[];
    zone: string[];
  };
  routes: {
    id: string[];
    short: string[];
    long: string[];
    type: number[];
    color: string[];
    textColor: string[];
  };
  services: {
    id: string[];
    /** Bitová maska dní: bit0 = pondelok … bit6 = nedeľa. */
    days: number[];
    start: number[];
    end: number[];
    added: number[][];
    removed: number[][];
  };
  patterns: {
    route: number[];
    stops: number[][];
    /** Pre každú zastávku: 0 = bežne, 1 = nie je, 3 = na znamenie (kombinované pickup*4 + dropoff). */
    flags: number[][];
    /** Indexy spojov zoradené podľa odchodu z prvej zastávky. */
    trips: number[][];
    /** Pre každý spoj delta-kódované časy [arr0, dep0, arr1, dep1, …] v sekundách od polnoci. */
    times: number[][];
  };
  trips: {
    id: string[];
    pattern: number[];
    service: number[];
    headsign: string[];
    wheelchair: number[];
    direction: number[];
  };
}

export const ROUTE_TYPE = {
  TRAM: 0,
  METRO: 1,
  RAIL: 2,
  BUS: 3,
  FERRY: 4,
  TROLLEYBUS: 11,
} as const;
