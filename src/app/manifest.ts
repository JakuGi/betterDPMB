import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LepšieDPMB – MHD Brno",
    short_name: "LepšieDPMB",
    description: "Spojení, odjezdy a online poloha vozidel MHD Brno",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f5f7",
    theme_color: "#e30613",
    lang: "cs",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Mapa vozidel", url: "/mapa" },
      { name: "Zastávky", url: "/zastavky" },
    ],
  };
}
