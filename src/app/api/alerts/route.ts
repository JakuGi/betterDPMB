import { alerts } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await alerts(), { headers: { "Cache-Control": "no-store" } });
}
