import type { Metadata } from "next";
import { MapPlanner } from "./MapPlanner";

export const metadata: Metadata = { title: "Trasa na mapě" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <MapPlanner key={`${sp.from}-${sp.to}-${sp.j}`} fromParam={sp.from ?? null} toParam={sp.to ?? null} tParam={sp.t ? Number(sp.t) : null} journeyParam={sp.j ?? null} />;
}
