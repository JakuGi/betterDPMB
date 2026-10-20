import { departures } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const group = sp.get("group");
  if (!group) return Response.json({ error: "Chýba parameter group" }, { status: 400 });
  const at = sp.get("at") ? Number(sp.get("at")) : null;
  const limit = Math.min(200, Number(sp.get("limit") ?? 40));
  const data = await departures(group, at, limit);
  if (!data) return Response.json({ error: "Zastávka neexistuje" }, { status: 404 });
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
