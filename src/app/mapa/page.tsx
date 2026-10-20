import type { Metadata } from "next";
import { LiveMap } from "./LiveMap";

export const metadata: Metadata = { title: "Mapa vozidel" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <LiveMap
      initialLines={sp.line ? sp.line.split(",") : []}
      initialTrip={sp.trip ?? null}
      initialView={sp.lat && sp.lon ? { lat: Number(sp.lat), lon: Number(sp.lon), z: Number(sp.z ?? 16) } : null}
    />
  );
}
