import { TripView } from "./TripView";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  return <TripView key={`${id}-${sp.d}`} tripId={decodeURIComponent(id)} date={sp.d ? Number(sp.d) : null} boardGroup={sp.s ?? null} />;
}
