"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RouteDTO, StopGroupDTO } from "../api-types";
import { distanceM, normalize } from "./format";
import { getLang, translate } from "../i18n";

/** Načíta JSON a podľa potreby ho pravidelne obnovuje (pozastaví sa, keď je karta skrytá). */
export function usePolling<T>(url: string | null, intervalMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;

  const load = useCallback(async () => {
    const u = urlRef.current;
    if (!u) return;
    setLoading(true);
    try {
      const res = await fetch(u, { cache: "no-store" });
      const json = await res.json();
      if (urlRef.current !== u) return;
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setData(json as T);
      setError(null);
      setUpdatedAt(Date.now());
    } catch (e) {
      if (urlRef.current === u) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (urlRef.current === u) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setData(null);
    setError(null);
    if (!url) return;
    load();
    if (!intervalMs) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, intervalMs);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [url, intervalMs, load]);

  return { data, error, loading, updatedAt, reload: load };
}

/** Aktuálny čas v sekundách, obnovuje sa každých `ms`. */
export function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

// ---------- zoznam zastávok (načíta sa raz) ----------

interface IndexedGroup extends StopGroupDTO {
  norm: string;
  words: string[];
}

let stopsPromise: Promise<IndexedGroup[]> | null = null;
let stopsCache: IndexedGroup[] | null = null;

function loadStops() {
  stopsPromise ??= fetch("/api/stops")
    .then((r) => r.json())
    .then((list: StopGroupDTO[]) => {
      stopsCache = list.map((g) => {
        const norm = normalize(g.name);
        return { ...g, norm, words: norm.split(/[\s,.\-–/()]+/).filter(Boolean) };
      });
      return stopsCache;
    })
    .catch((e) => {
      stopsPromise = null;
      throw e;
    });
  return stopsPromise;
}

export function useStops() {
  const [stops, setStops] = useState<IndexedGroup[] | null>(stopsCache);
  useEffect(() => {
    if (!stopsCache) loadStops().then(setStops).catch(() => {});
  }, []);
  return stops;
}

const isBrno = (g: StopGroupDTO) => g.zone === "100" || g.zone === "101";

/** Brnianske hovorové názvy zastávok. */
const ALIASES: Record<string, string> = {
  mendlak: "Mendlovo náměstí",
  hlavas: "Hlavní nádraží",
  hlavak: "Hlavní nádraží",
  malinak: "Malinovského náměstí",
  moravak: "Moravské náměstí",
  silingrak: "Šilingrovo náměstí",
  zvonarka: "ÚAN Zvonařka",
  krenovka: "Křenová",
  stara: "Stará osada",
  kravak: "Kraví hora",
  bystrc: "Ečerova",
  lisen: "Jírova",
  spilas: "Šilingrovo náměstí",
};

export function searchStops(stops: IndexedGroup[], query: string, limit = 8): IndexedGroup[] {
  const q = normalize(query).trim();
  if (!q) return [];
  const tokens = q.split(/[\s,.\-–/()]+/).filter(Boolean);
  const scored: { g: IndexedGroup; score: number }[] = [];
  const alias = Object.entries(ALIASES).find(([k]) => k.startsWith(q) && q.length >= 4);
  if (alias) {
    const g = stops.find((x) => x.name === alias[1]);
    if (g) scored.push({ g, score: 1000 });
  }
  for (const g of stops) {
    if (alias && g.name === alias[1]) continue;
    let ok = true;
    let score = 0;
    for (const t of tokens) {
      const w = g.words.findIndex((w) => w.startsWith(t));
      if (w === -1) {
        if (!g.norm.includes(t)) {
          ok = false;
          break;
        }
        score += 1;
      } else score += w === 0 ? 6 : 3;
    }
    if (!ok) continue;
    if (g.norm === q) score += 30;
    else if (g.norm.startsWith(q)) score += 10;
    if (isBrno(g)) score += 12;
    score += Math.min(g.lines.length, 20) * 0.2;
    scored.push({ g, score });
  }
  scored.sort((a, b) => b.score - a.score || a.g.name.localeCompare(b.g.name, "cs"));
  return scored.slice(0, limit).map((x) => x.g);
}

export function nearestStops(stops: StopGroupDTO[], lat: number, lon: number, limit = 10, maxM = 1500) {
  return stops
    .map((g) => ({ g, d: distanceM(lat, lon, g.lat, g.lon) }))
    .filter((x) => x.d <= maxM)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit);
}

// ---------- linky ----------

let routesPromise: Promise<RouteDTO[]> | null = null;
export function useRoutes() {
  const [routes, setRoutes] = useState<RouteDTO[] | null>(null);
  useEffect(() => {
    routesPromise ??= fetch("/api/lines").then((r) => r.json());
    routesPromise.then(setRoutes).catch(() => (routesPromise = null));
  }, []);
  return routes;
}

// ---------- poloha ----------

export type GeoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; lat: number; lon: number; accuracy: number }
  | { status: "error"; message: string };

export function getPosition(): Promise<{ lat: number; lon: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error(translate(getLang(), "geoUnsupported")));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) =>
        reject(
          new Error(
            translate(getLang(), e.code === e.PERMISSION_DENIED ? "geoDenied" : e.code === e.TIMEOUT ? "geoTimeout" : "locFailed"),
          ),
        ),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  });
}

export function useGeolocation(auto = false) {
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });
  const request = useCallback(async () => {
    setGeo({ status: "loading" });
    try {
      const p = await getPosition();
      setGeo({ status: "ok", ...p });
      return p;
    } catch (e) {
      setGeo({ status: "error", message: e instanceof Error ? e.message : String(e) });
      return null;
    }
  }, []);
  useEffect(() => {
    if (auto) request();
  }, [auto, request]);
  return { geo, request };
}
