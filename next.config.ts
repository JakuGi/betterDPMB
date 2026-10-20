import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Predspracovaný cestovný poriadok čítajú API routes zo súboru – musí sa dostať do serverless bundlu.
  outputFileTracingIncludes: {
    "/api/**": ["./data/timetable.json"],
  },
  devIndicators: false,
  serverExternalPackages: ["gtfs-realtime-bindings"],
};

export default nextConfig;
