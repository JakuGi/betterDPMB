import { vehicles } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await vehicles(), { headers: { "Cache-Control": "no-store" } });
}
