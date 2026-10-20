// Časové pomôcky – všetko v pásme Europe/Prague bez ohľadu na pásmo servera (Vercel beží v UTC).

const TZ = "Europe/Prague";

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function pragueParts(epochSec: number) {
  const p: Record<string, number> = {};
  for (const x of partsFmt.formatToParts(new Date(epochSec * 1000))) {
    if (x.type !== "literal") p[x.type] = Number(x.value);
  }
  return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}

/** Posun pásma Prahy oproti UTC v sekundách v danom okamihu. */
function offsetAt(epochSec: number): number {
  const p = pragueParts(epochSec);
  return (Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) / 1000) - epochSec;
}

/** Dátum ako číslo YYYYMMDD v Prahe. */
export function pragueDate(epochSec: number): number {
  const p = pragueParts(epochSec);
  return p.y * 10000 + p.m * 100 + p.d;
}

/** Referenčný čas dňa prevádzky podľa GTFS („poludnie mínus 12 h“) – epoch sekundy. */
const dayStartCache = new Map<number, number>();
export function serviceDayStart(date: number): number {
  let v = dayStartCache.get(date);
  if (v === undefined) {
    const y = Math.floor(date / 10000);
    const m = Math.floor(date / 100) % 100;
    const d = date % 100;
    const noonUtc = Date.UTC(y, m - 1, d, 12) / 1000;
    const noonLocal = noonUtc - offsetAt(noonUtc);
    v = noonLocal - 12 * 3600;
    dayStartCache.set(date, v);
  }
  return v;
}

export function addDays(date: number, n: number): number {
  const y = Math.floor(date / 10000);
  const m = Math.floor(date / 100) % 100;
  const d = date % 100;
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
}

/** 0 = pondelok … 6 = nedeľa */
export function weekday(date: number): number {
  const y = Math.floor(date / 10000);
  const m = Math.floor(date / 100) % 100;
  const d = date % 100;
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Prevod lokálneho dátumu + času (napr. z formulára) na epoch sekundy. */
export function pragueLocalToEpoch(date: number, hhmm: string): number {
  const [h, mi] = hhmm.split(":").map(Number);
  // serviceDayStart je o 12 h skôr ako poludnie, takže pri zmenách času to sedí aj pre bežné hodiny.
  const y = Math.floor(date / 10000);
  const m = Math.floor(date / 100) % 100;
  const d = date % 100;
  const guess = Date.UTC(y, m - 1, d, h, mi) / 1000;
  return guess - offsetAt(guess);
}

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}
