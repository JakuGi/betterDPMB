"use client";

import { useMemo, useSyncExternalStore } from "react";
import { DEFAULT_LANG, getLang, setCurrentLang, translate, translatePlural, type I18nKey, type Lang, type Vars } from "../i18n";

/** Miesto pre vyhľadávanie: zastávka (uzol) alebo súradnice. */
export type Place =
  | { kind: "group"; id: string; name: string }
  | { kind: "coord"; lat: number; lon: number; name: string }
  | { kind: "here"; name: string };

export interface FavStop {
  id: string;
  name: string;
  /** Na úvodnej stránke ukázať len tieto linky (prázdne = všetky). */
  lines: string[];
}

export interface FavRoute {
  id: string;
  from: Place;
  to: Place;
  label?: string;
}

export interface FavLine {
  id: string;
  name: string;
  type: number;
}

/** Pravidelný spoj – napr. „ranná 25-ka o 7:42 z Osovej“. */
export interface FavTrip {
  id: string;
  groupId: string;
  stopName: string;
  routeName: string;
  headsign: string;
  /** HH:MM plánovaného odchodu */
  time: string;
}

export interface Settings {
  wheelchair: boolean;
  maxTransfers: number;
  onlyMhd: boolean;
  /** Povoliť presuny pešo medzi rôznymi zastávkami. */
  walking: boolean;
  lang: Lang;
}

export interface HistoryEntry {
  id: string;
  from: Place;
  to: Place;
  /** kedy bolo naposledy hľadané (epoch ms) */
  at: number;
  /** odkiaľ vyhľadávanie pochádza – „map“ = záložka Trasa */
  source?: "search" | "map";
}

export interface StoreData {
  version: 1;
  stops: FavStop[];
  routes: FavRoute[];
  lines: FavLine[];
  trips: FavTrip[];
  recent: Place[];
  history: HistoryEntry[];
  home: Place | null;
  work: Place | null;
  settings: Settings;
}

const KEY = "lepsieDPMB:v1";

const EMPTY: StoreData = {
  version: 1,
  stops: [],
  routes: [],
  lines: [],
  trips: [],
  recent: [],
  history: [],
  home: null,
  work: null,
  settings: { wheelchair: false, maxTransfers: 4, onlyMhd: true, walking: true, lang: DEFAULT_LANG },
};

const HISTORY_MAX = 30;

let state: StoreData = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = migrate(JSON.parse(raw));
  } catch {
    /* poškodené alebo nedostupné úložisko – začneme nanovo */
  }
  setCurrentLang(state.settings.lang);
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    try {
      state = e.newValue ? migrate(JSON.parse(e.newValue)) : EMPTY;
    } catch {
      state = EMPTY;
    }
    setCurrentLang(state.settings.lang);
    listeners.forEach((l) => l());
  });
}

export function migrate(x: Partial<StoreData>): StoreData {
  return {
    ...EMPTY,
    ...x,
    settings: { ...EMPTY.settings, ...(x.settings ?? {}) },
    version: 1,
  };
}

export function getStore(): StoreData {
  load();
  return state;
}

export function setStore(update: (s: StoreData) => StoreData) {
  load();
  state = update(state);
  setCurrentLang(state.settings.lang);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* plné / zablokované úložisko */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  load();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useStore(): StoreData {
  return useSyncExternalStore(subscribe, getStore, () => EMPTY);
}

/** Preklady v aktuálnom jazyku. */
export function useT() {
  const lang = useStore().settings.lang;
  return useMemo(
    () => ({
      lang,
      t: (key: I18nKey, vars?: Vars) => translate(lang, key, vars),
      tn: (base: "transfers" | "stops", n: number, vars?: Vars) => translatePlural(lang, base, n, vars),
    }),
    [lang],
  );
}

// ---------- akcie ----------

export const uid = () => Math.random().toString(36).slice(2, 10);

export function toggleFavStop(id: string, name: string) {
  setStore((s) =>
    s.stops.some((x) => x.id === id)
      ? { ...s, stops: s.stops.filter((x) => x.id !== id) }
      : { ...s, stops: [...s.stops, { id, name, lines: [] }] },
  );
}

export function setFavStopLines(id: string, lines: string[]) {
  setStore((s) => ({ ...s, stops: s.stops.map((x) => (x.id === id ? { ...x, lines } : x)) }));
}

export function toggleFavLine(line: FavLine) {
  setStore((s) =>
    s.lines.some((x) => x.id === line.id)
      ? { ...s, lines: s.lines.filter((x) => x.id !== line.id) }
      : { ...s, lines: [...s.lines, line] },
  );
}

export function placeKey(p: Place): string {
  if (p.kind === "group") return p.id;
  if (p.kind === "coord") return `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
  return "here";
}

export function findFavRoute(s: StoreData, from: Place, to: Place) {
  return s.routes.find((r) => placeKey(r.from) === placeKey(from) && placeKey(r.to) === placeKey(to));
}

export function toggleFavRoute(from: Place, to: Place) {
  setStore((s) => {
    const ex = findFavRoute(s, from, to);
    if (ex) return { ...s, routes: s.routes.filter((r) => r !== ex) };
    return { ...s, routes: [...s.routes, { id: uid(), from, to }] };
  });
}

export function addRecent(p: Place) {
  if (p.kind === "here") return;
  setStore((s) => ({
    ...s,
    recent: [p, ...s.recent.filter((r) => placeKey(r) !== placeKey(p))].slice(0, 8),
  }));
}

const historyKey = (from: Place, to: Place, source: "search" | "map" = "search") => `${source}:${placeKey(from)}>${placeKey(to)}`;

/** Zapíše vyhľadávanie do histórie (rovnakú dvojicu v rovnakom režime presunie navrch; Spojenia a Trasa sa vedú zvlášť). */
export function addHistory(from: Place, to: Place, source: "search" | "map" = "search") {
  const key = historyKey(from, to, source);
  setStore((s) => {
    const prev = s.history.find((h) => historyKey(h.from, h.to, h.source) === key);
    const entry: HistoryEntry = { id: prev?.id ?? uid(), from, to, at: Date.now(), source };
    return { ...s, history: [entry, ...s.history.filter((h) => h !== prev)].slice(0, HISTORY_MAX) };
  });
}

export function removeHistory(id: string) {
  setStore((s) => ({ ...s, history: s.history.filter((h) => h.id !== id) }));
}

export function clearHistory() {
  setStore((s) => ({ ...s, history: [] }));
}

export function moveItem<K extends "stops" | "routes" | "trips" | "lines">(key: K, index: number, dir: -1 | 1) {
  setStore((s) => {
    const arr = [...s[key]] as StoreData[K];
    const j = index + dir;
    if (j < 0 || j >= arr.length) return s;
    [arr[index], arr[j]] = [arr[j], arr[index]];
    return { ...s, [key]: arr };
  });
}

export function removeItem<K extends "stops" | "routes" | "trips" | "lines">(key: K, index: number) {
  setStore((s) => ({ ...s, [key]: s[key].filter((_, i) => i !== index) }));
}

export function addFavTrip(t: Omit<FavTrip, "id">) {
  setStore((s) => {
    if (s.trips.some((x) => x.groupId === t.groupId && x.routeName === t.routeName && x.headsign === t.headsign && x.time === t.time)) return s;
    return { ...s, trips: [...s.trips, { ...t, id: uid() }] };
  });
}

export function updateSettings(patch: Partial<Settings>) {
  setStore((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

// ---------- prenos medzi zariadeniami ----------

export function exportCode(s: StoreData): string {
  const json = JSON.stringify({ ...s, recent: [], history: [] });
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function importCode(code: string): StoreData {
  const b64 = code.trim().replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return migrate(JSON.parse(new TextDecoder().decode(bytes)));
}

// ---------- URL parametre miesta ----------

/** Miesto → parameter pre /api/plan a URL (napr. „U1472|Osová“, „49.2,16.6|Domov“). */
export function placeToParam(p: Place, here?: { lat: number; lon: number } | null): string | null {
  if (p.kind === "group") return `${p.id}|${p.name}`;
  if (p.kind === "coord") return `${p.lat.toFixed(5)},${p.lon.toFixed(5)}|${p.name}`;
  if (here) return `${here.lat.toFixed(5)},${here.lon.toFixed(5)}|${translate(getLang(), "myLocation")}`;
  return null;
}

export function paramToPlace(v: string | null): Place | null {
  if (!v) return null;
  const [val, name = ""] = v.split("|");
  if (val === "here") return { kind: "here", name: translate(getLang(), "myLocation") };
  const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(val);
  if (m) return { kind: "coord", lat: Number(m[1]), lon: Number(m[2]), name: name || translate(getLang(), "placeOnMap") };
  return { kind: "group", id: val, name: name || val };
}
