/**
 * Stiahne GTFS IDS JMK (KORDIS) a predspracuje ho do data/timetable.json.
 *
 *   npm run data               – vždy stiahne čerstvé dáta
 *   npm run data:if-missing    – len ak súbor ešte neexistuje (spúšťa sa pred `npm run dev`)
 *
 * Zdroj sa dá zmeniť premennou GTFS_URL, alebo GTFS_FILE (lokálny .zip).
 */
import AdmZip from "adm-zip";
import fs from "node:fs";
import path from "node:path";
import type { RawTimetable } from "../src/lib/timetable-format";

const GTFS_URL = process.env.GTFS_URL ?? "https://kordis-jmk.cz/gtfs/gtfs.zip";
const OUT_DIR = path.join(process.cwd(), "data");
const OUT = path.join(OUT_DIR, "timetable.json");

// ---------- CSV ----------

function* csvRows(text: string): Generator<string[]> {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = text.length;
  while (i < n) {
    const row: string[] = [];
    for (;;) {
      let field = "";
      if (text[i] === '"') {
        i++;
        for (;;) {
          const q = text.indexOf('"', i);
          if (q === -1) {
            field += text.slice(i);
            i = n;
            break;
          }
          field += text.slice(i, q);
          i = q + 1;
          if (text[i] === '"') {
            field += '"';
            i++;
          } else break;
        }
      } else {
        let j = i;
        while (j < n) {
          const c = text.charCodeAt(j);
          if (c === 44 || c === 10 || c === 13) break;
          j++;
        }
        field = text.slice(i, j);
        i = j;
      }
      row.push(field);
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "\r") i++;
      if (text[i] === "\n") i++;
      break;
    }
    if (row.length > 1 || row[0] !== "") yield row;
  }
}

function readTable(zip: AdmZip, name: string): { header: Record<string, number>; rows: Generator<string[]> } {
  const entry = zip.getEntry(name);
  if (!entry) throw new Error(`V GTFS chýba ${name}`);
  const it = csvRows(entry.getData().toString("utf8"));
  const first = it.next();
  const header: Record<string, number> = {};
  (first.value as string[]).forEach((h, idx) => (header[h.trim()] = idx));
  return { header, rows: it };
}

function parseTime(t: string): number {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

// ---------- main ----------

async function loadZip(): Promise<{ zip: AdmZip; lastModified: string | null }> {
  if (process.env.GTFS_FILE) {
    return { zip: new AdmZip(process.env.GTFS_FILE), lastModified: null };
  }
  console.log(`Sťahujem ${GTFS_URL} …`);
  const res = await fetch(GTFS_URL);
  if (!res.ok) throw new Error(`GTFS: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`  ${(buf.length / 1e6).toFixed(1)} MB`);
  return { zip: new AdmZip(buf), lastModified: res.headers.get("last-modified") };
}

async function main() {
  if (process.argv.includes("--if-missing") && fs.existsSync(OUT)) {
    console.log("data/timetable.json existuje – preskakujem (aktualizácia: npm run data)");
    return;
  }
  const t0 = Date.now();
  const { zip, lastModified } = await loadZip();

  // --- routes ---
  const routes: RawTimetable["routes"] = { id: [], short: [], long: [], type: [], color: [], textColor: [] };
  const routeIdx = new Map<string, number>();
  {
    const { header: h, rows } = readTable(zip, "routes.txt");
    for (const r of rows) {
      let type = Number(r[h.route_type]);
      if (type === 800) type = 11; // rozšírený typ trolejbus → štandardný
      if (type >= 100 && type < 200) type = 2;
      if (type >= 700 && type < 800) type = 3;
      if (type >= 900 && type < 1000) type = 0;
      routeIdx.set(r[h.route_id], routes.id.length);
      routes.id.push(r[h.route_id]);
      routes.short.push(r[h.route_short_name] ?? "");
      routes.long.push(r[h.route_long_name] ?? "");
      routes.type.push(type);
      routes.color.push((r[h.route_color] || "").toUpperCase());
      routes.textColor.push((r[h.route_text_color] || "").toUpperCase());
    }
  }

  // --- calendar ---
  const services: RawTimetable["services"] = { id: [], days: [], start: [], end: [], added: [], removed: [] };
  const serviceIdx = new Map<string, number>();
  const ensureService = (id: string) => {
    let idx = serviceIdx.get(id);
    if (idx === undefined) {
      idx = services.id.length;
      serviceIdx.set(id, idx);
      services.id.push(id);
      services.days.push(0);
      services.start.push(0);
      services.end.push(0);
      services.added.push([]);
      services.removed.push([]);
    }
    return idx;
  };
  if (zip.getEntry("calendar.txt")) {
    const { header: h, rows } = readTable(zip, "calendar.txt");
    const dayCols = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    for (const r of rows) {
      const idx = ensureService(r[h.service_id]);
      let mask = 0;
      dayCols.forEach((d, bit) => {
        if (r[h[d]] === "1") mask |= 1 << bit;
      });
      services.days[idx] = mask;
      services.start[idx] = Number(r[h.start_date]);
      services.end[idx] = Number(r[h.end_date]);
    }
  }
  if (zip.getEntry("calendar_dates.txt")) {
    const { header: h, rows } = readTable(zip, "calendar_dates.txt");
    for (const r of rows) {
      const idx = ensureService(r[h.service_id]);
      const date = Number(r[h.date]);
      if (r[h.exception_type] === "1") services.added[idx].push(date);
      else services.removed[idx].push(date);
    }
  }

  // --- trips ---
  const tripsRaw = new Map<string, { route: number; service: number; headsign: string; wheelchair: number; direction: number }>();
  {
    const { header: h, rows } = readTable(zip, "trips.txt");
    for (const r of rows) {
      const route = routeIdx.get(r[h.route_id]);
      if (route === undefined) continue;
      tripsRaw.set(r[h.trip_id], {
        route,
        service: ensureService(r[h.service_id]),
        headsign: r[h.trip_headsign] ?? "",
        wheelchair: Number(r[h.wheelchair_accessible] || 0),
        direction: Number(r[h.direction_id] || 0),
      });
    }
  }

  // --- stop_times ---
  type ST = { seq: number; stop: string; arr: number; dep: number; flag: number };
  const stopTimes = new Map<string, ST[]>();
  {
    const { header: h, rows } = readTable(zip, "stop_times.txt");
    for (const r of rows) {
      const tripId = r[h.trip_id];
      if (!tripsRaw.has(tripId)) continue;
      const arrS = r[h.arrival_time] || r[h.departure_time];
      const depS = r[h.departure_time] || r[h.arrival_time];
      if (!arrS) continue;
      const pickup = Number(r[h.pickup_type] || 0);
      const dropoff = Number(r[h.drop_off_type] || 0);
      let list = stopTimes.get(tripId);
      if (!list) stopTimes.set(tripId, (list = []));
      list.push({ seq: Number(r[h.stop_sequence]), stop: r[h.stop_id], arr: parseTime(arrS), dep: parseTime(depS), flag: pickup * 4 + dropoff });
    }
  }

  // --- stops (len obsluhované) ---
  const usedStops = new Set<string>();
  for (const list of stopTimes.values()) for (const st of list) usedStops.add(st.stop);

  const stops: RawTimetable["stops"] = { id: [], name: [], lat: [], lon: [], zone: [], platform: [], wheelchair: [], group: [] };
  const groups: RawTimetable["groups"] = { id: [], name: [], lat: [], lon: [], zone: [] };
  const stopIdx = new Map<string, number>();
  {
    const { header: h, rows } = readTable(zip, "stops.txt");
    const groupIdx = new Map<string, number>();
    const groupNames: Map<string, number>[] = [];
    const groupSum: { lat: number; lon: number; n: number }[] = [];
    for (const r of rows) {
      const id = r[h.stop_id];
      if (!usedStops.has(id)) continue;
      const lt = r[h.location_type];
      if (lt && lt !== "0") continue;
      const m = /^(U\d+)Z(\d+)$/.exec(id);
      const gKey = m ? m[1] : id;
      let g = groupIdx.get(gKey);
      if (g === undefined) {
        g = groups.id.length;
        groupIdx.set(gKey, g);
        groups.id.push(gKey);
        groups.name.push("");
        groups.lat.push(0);
        groups.lon.push(0);
        groups.zone.push(r[h.zone_id] ?? "");
        groupNames.push(new Map());
        groupSum.push({ lat: 0, lon: 0, n: 0 });
      }
      const lat = Number(r[h.stop_lat]);
      const lon = Number(r[h.stop_lon]);
      const name = r[h.stop_name];
      groupNames[g].set(name, (groupNames[g].get(name) ?? 0) + 1);
      groupSum[g].lat += lat;
      groupSum[g].lon += lon;
      groupSum[g].n++;

      stopIdx.set(id, stops.id.length);
      stops.id.push(id);
      stops.name.push(name);
      stops.lat.push(Math.round(lat * 1e6) / 1e6);
      stops.lon.push(Math.round(lon * 1e6) / 1e6);
      stops.zone.push(r[h.zone_id] ?? "");
      stops.platform.push((h.platform_code !== undefined && r[h.platform_code]) || (m ? m[2] : ""));
      stops.wheelchair.push(Number(r[h.wheelchair_boarding] || 0));
      stops.group.push(g);
    }
    for (let g = 0; g < groups.id.length; g++) {
      groups.name[g] = [...groupNames[g].entries()].sort((a, b) => b[1] - a[1])[0][0];
      groups.lat[g] = Math.round((groupSum[g].lat / groupSum[g].n) * 1e6) / 1e6;
      groups.lon[g] = Math.round((groupSum[g].lon / groupSum[g].n) * 1e6) / 1e6;
    }
  }

  // --- patterns (spoje s rovnakou postupnosťou zastávok) ---
  const trips: RawTimetable["trips"] = { id: [], pattern: [], service: [], headsign: [], wheelchair: [], direction: [] };
  const patternKey = new Map<string, number>();
  const pRoute: number[] = [];
  const pStops: number[][] = [];
  const pFlags: number[][] = [];
  const pTrips: { trip: number; times: number[] }[][] = [];

  for (const [tripId, list] of stopTimes) {
    list.sort((a, b) => a.seq - b.seq);
    const sIdx = list.map((s) => stopIdx.get(s.stop));
    if (sIdx.some((x) => x === undefined) || list.length < 2) continue;
    const info = tripsRaw.get(tripId)!;
    const flags = list.map((s) => s.flag);
    const key = `${info.route}|${sIdx.join(",")}|${flags.join("")}`;
    let p = patternKey.get(key);
    if (p === undefined) {
      p = pRoute.length;
      patternKey.set(key, p);
      pRoute.push(info.route);
      pStops.push(sIdx as number[]);
      pFlags.push(flags);
      pTrips.push([]);
    }
    const t = trips.id.length;
    trips.id.push(tripId);
    trips.pattern.push(p);
    trips.service.push(info.service);
    trips.headsign.push(info.headsign);
    trips.wheelchair.push(info.wheelchair);
    trips.direction.push(info.direction);
    const times: number[] = [];
    for (const s of list) times.push(s.arr, Math.max(s.dep, s.arr));
    pTrips[p].push({ trip: t, times });
  }

  const patterns: RawTimetable["patterns"] = { route: pRoute, stops: pStops, flags: pFlags, trips: [], times: [] };
  for (const list of pTrips) {
    list.sort((a, b) => a.times[1] - b.times[1]);
    patterns.trips.push(list.map((x) => x.trip));
    patterns.times.push(
      list.flatMap((x) => {
        const out: number[] = [];
        let prev = 0;
        for (const v of x.times) {
          out.push(v - prev);
          prev = v;
        }
        return out;
      }),
    );
  }

  const tt: RawTimetable = {
    version: 1,
    generatedAt: new Date().toISOString(),
    feedLastModified: lastModified,
    stops,
    groups,
    routes,
    services,
    patterns,
    trips,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(tt));
  const size = fs.statSync(OUT).size;
  console.log(
    `Hotovo za ${((Date.now() - t0) / 1000).toFixed(1)} s: ${stops.id.length} zastávok, ${groups.id.length} uzlov, ` +
      `${routes.id.length} liniek, ${trips.id.length} spojov, ${pRoute.length} vzorov → ${(size / 1e6).toFixed(1)} MB`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
