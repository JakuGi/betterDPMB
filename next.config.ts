import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Predspracovaný cestovný poriadok čítajú API routes zo súboru – musí sa dostať do serverless bundlu.
  outputFileTracingIncludes: {
    "/api/**": ["./data/timetable.json"],
  },
  devIndicators: false,
  // Android appka (TWA) overuje prepojenie s webom cez tento súbor.
  async rewrites() {
    return [{ source: "/.well-known/assetlinks.json", destination: "/api/assetlinks" }];
  },
  serverExternalPackages: ["gtfs-realtime-bindings"],
};

export default nextConfig;
