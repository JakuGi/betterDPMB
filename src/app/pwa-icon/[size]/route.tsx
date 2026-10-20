import { ImageResponse } from "next/og";

export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: s } = await params;
  const size = s === "512" ? 512 : s === "180" ? 180 : 192;
  const maskable = new URL(req.url).searchParams.has("maskable");
  const pad = maskable ? size * 0.2 : size * 0.12;
  const body = size - pad * 2;
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "#e30613", borderRadius: maskable ? 0 : size * 0.22 }}>
        <div style={{ width: body * 0.62, height: body * 0.72, background: "#fff", borderRadius: body * 0.12, display: "flex", flexDirection: "column", alignItems: "center", padding: body * 0.07 }}>
          <div style={{ width: "100%", height: "42%", background: "#e30613", borderRadius: body * 0.04 }} />
          <div style={{ display: "flex", width: "100%", justifyContent: "space-between", marginTop: "auto", padding: `0 ${body * 0.04}px` }}>
            <div style={{ width: body * 0.1, height: body * 0.1, borderRadius: 999, background: "#e30613" }} />
            <div style={{ width: body * 0.1, height: body * 0.1, borderRadius: 999, background: "#e30613" }} />
          </div>
        </div>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
