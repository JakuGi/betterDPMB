import { LineView } from "./LineView";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LineView key={id} id={decodeURIComponent(id)} />;
}
