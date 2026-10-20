import { stopGroups } from "@/lib/server/queries";

export function GET() {
  return Response.json(stopGroups(), {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
