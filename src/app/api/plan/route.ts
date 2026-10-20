import type { PlaceParam } from "@/lib/api-types";
import { plan } from "@/lib/server/plan";
import { nowSec } from "@/lib/server/time";

export const dynamic = "force-dynamic";

/** Miesto: „U1472“ (uzol) alebo „49.19,16.60“ (súradnice), voliteľne s menom „…|Domov“. */
function parsePlace(v: string | null): PlaceParam | null {
  if (!v) return null;
  const [val, label] = v.split("|");
  const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(val);
  if (m) return { kind: "coord", lat: Number(m[1]), lon: Number(m[2]), label };
  return { kind: "group", id: val };
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const from = parsePlace(sp.get("from"));
  const to = parsePlace(sp.get("to"));
  if (!from || !to) return Response.json({ error: "Chýba odkiaľ alebo kam" }, { status: 400 });
  const t = sp.get("t") ? Number(sp.get("t")) : nowSec();
  const started = performance.now();
  const data = await plan(from, to, t, {
    wheelchair: sp.get("wheelchair") === "1",
    walking: sp.get("walk") !== "0",
    maxTransfers: sp.get("maxTransfers") ? Number(sp.get("maxTransfers")) : undefined,
    count: sp.get("count") ? Math.min(10, Number(sp.get("count"))) : undefined,
  });
  return Response.json(data, {
    headers: { "Cache-Control": "no-store", "Server-Timing": `plan;dur=${(performance.now() - started).toFixed(0)}` },
  });
}
