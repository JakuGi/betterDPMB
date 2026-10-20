import { lineDetail } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await lineDetail(decodeURIComponent(id));
  if (!data) return Response.json({ error: "Linka neexistuje" }, { status: 404 });
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
