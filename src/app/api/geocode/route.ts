// Proxy na OpenStreetMap Nominatim (vyhľadanie adresy a spätné geokódovanie).
// Ide cez server, aby sme posielali identifikačný User-Agent podľa pravidiel Nominatimu a mohli cachovať.

import type { GeoResult } from "@/lib/api-types";

const NOMINATIM = "https://nominatim.openstreetmap.org";
const UA = "LepsieDPMB/0.1 (osobna appka MHD Brno)";
// okolie Brna (lon_min, lat_max, lon_max, lat_min)
const VIEWBOX = "16.40,49.32,16.82,49.08";

export const dynamic = "force-dynamic";

interface NominatimItem {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  type?: string;
  address?: Record<string, string>;
}

const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 24 * 3600 * 1000;

function label(it: NominatimItem): { label: string; detail: string } {
  const a = it.address ?? {};
  const street = a.road || a.pedestrian || a.footway || a.square || a.path;
  const streetLine = street ? `${street}${a.house_number ? ` ${a.house_number}` : ""}` : "";
  const main = it.name && it.name !== street ? it.name : streetLine || it.display_name.split(",")[0];
  const area = a.suburb || a.city_district || a.quarter || a.neighbourhood || a.city || a.town || a.village || "";
  const detail = [main !== streetLine ? streetLine : "", area].filter(Boolean).join(", ");
  return { label: main, detail };
}

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data as T;
  const data = await fn();
  if (cache.size > 2000) cache.clear();
  cache.set(key, { at: Date.now(), data });
  return data;
}

async function nominatim(path: string): Promise<unknown> {
  const res = await fetch(`${NOMINATIM}${path}`, {
    headers: { "User-Agent": UA, "Accept-Language": "cs,sk;q=0.8" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  return res.json();
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  try {
    const q = sp.get("q")?.trim();
    if (q) {
      if (q.length < 3) return Response.json([]);
      const data = await cached(`q:${q.toLowerCase()}`, async () => {
        const list = (await nominatim(
          `/search?format=jsonv2&addressdetails=1&limit=7&bounded=1&viewbox=${VIEWBOX}&q=${encodeURIComponent(q)}`,
        )) as NominatimItem[];
        return list.map((it): GeoResult => ({ lat: Number(it.lat), lon: Number(it.lon), ...label(it) }));
      });
      return Response.json(data);
    }
    const lat = Number(sp.get("lat"));
    const lon = Number(sp.get("lon"));
    if (Number.isFinite(lat) && Number.isFinite(lon) && sp.has("lat")) {
      const key = `r:${lat.toFixed(4)},${lon.toFixed(4)}`;
      const data = await cached(key, async () => {
        const it = (await nominatim(`/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lon}`)) as NominatimItem & { error?: string };
        if (it.error) return null;
        return { lat, lon, ...label(it) } satisfies GeoResult;
      });
      return Response.json(data);
    }
    return Response.json({ error: "Chýba q alebo lat/lon" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
