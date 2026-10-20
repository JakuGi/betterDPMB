import type { Metadata } from "next";
import { PlanResults } from "./PlanResults";

export const metadata: Metadata = { title: "Spojení" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <PlanResults key={`${sp.from}-${sp.to}-${sp.t}`} fromParam={sp.from ?? null} toParam={sp.to ?? null} tParam={sp.t ? Number(sp.t) : null} />;
}
