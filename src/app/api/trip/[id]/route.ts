import { tripDetail } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = new URL(req.url).searchParams.get("d");
  const data = await tripDetail(decodeURIComponent(id), d ? Number(d) : null);
  if (!data) return Response.json({ error: "Spoj neexistuje" }, { status: 404 });
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
