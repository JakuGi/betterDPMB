import type { RouteDTO } from "../api-types";
import { LOCALES, getLang, translate, type I18nKey } from "../i18n";

const timeFmt = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" });
const dateFmts = new Map<string, Intl.DateTimeFormat>();

export const fmtTime = (epoch: number) => timeFmt.format(new Date(epoch * 1000));
export const fmtDate = (epoch: number) => {
  const loc = LOCALES[getLang()];
  let f = dateFmts.get(loc);
  if (!f) dateFmts.set(loc, (f = new Intl.DateTimeFormat(loc, { timeZone: "Europe/Prague", weekday: "short", day: "numeric", month: "numeric" })));
  return f.format(new Date(epoch * 1000));
};

/** Čas „HH:MM:SS“ pre zobrazenie aktualizácie. */
export const fmtClock = (ms: number) => new Date(ms).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function fmtDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** „teraz“, „3 min“, „14:05“ */
export function fmtCountdown(epoch: number, now: number): string {
  const diff = Math.round((epoch - now) / 60);
  if (diff <= 0) return translate(getLang(), "now");
  if (diff < 60) return `${diff} min`;
  return fmtTime(epoch);
}

export function fmtDelay(delay: number | null): string {
  if (delay == null) return "";
  const m = Math.round(delay / 60);
  if (m === 0) return translate(getLang(), "onTime");
  return m > 0 ? `+${m}` : `${m}`;
}

export function delayLevel(delay: number | null): "none" | "ok" | "minor" | "major" | "early" {
  if (delay == null) return "none";
  const m = delay / 60;
  if (m < -0.75) return "early";
  if (m < 1.5) return "ok";
  if (m < 5) return "minor";
  return "major";
}

export function routeTypeLabel(type: number): string {
  return [0, 2, 3, 4, 11].includes(type) ? translate(getLang(), `type_${type}` as I18nKey) : "";
}

export function isNight(route: Pick<RouteDTO, "name">) {
  return /^N\d/.test(route.name);
}

/** Je linka súčasťou MHD Brno (nie regionálna / vlak)? */
export function isBrnoMhd(route: Pick<RouteDTO, "name" | "type">) {
  if (route.type === 2) return false;
  return /^(\d{1,2}|N\d{2}|x\d{1,2}|E\d{2}|P\d|š\d{2}|LOĎ)$/.test(route.name);
}

const TYPE_COLORS: Record<number, string> = {
  0: "#E30613",
  11: "#00A04A",
  3: "#0071BC",
  2: "#4B5563",
  4: "#00224B",
};

export function routeColors(route: Pick<RouteDTO, "name" | "type" | "color" | "textColor">): { bg: string; fg: string } {
  if (route.color) return { bg: `#${route.color}`, fg: route.textColor ? `#${route.textColor}` : "#fff" };
  if (isNight(route)) return { bg: "#1F2937", fg: "#fff" };
  return { bg: TYPE_COLORS[route.type] ?? "#4B5563", fg: "#fff" };
}

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function fmtDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}
