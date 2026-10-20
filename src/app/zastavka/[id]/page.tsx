import { StopBoard } from "./StopBoard";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StopBoard key={id} id={decodeURIComponent(id)} />;
}
