"use client";

import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { useEffect, useState, type RefObject } from "react";

export type LeafletNS = typeof Leaflet;

export const BRNO_CENTER: [number, number] = [49.1951, 16.6068];

/** Vytvorí mapu Leaflet v kontajneri (Leaflet sa načíta až v prehliadači). */
export function useLeaflet(ref: RefObject<HTMLDivElement | null>, center: [number, number] = BRNO_CENTER, zoom = 13) {
  const [ctx, setCtx] = useState<{ L: LeafletNS; map: Leaflet.Map } | null>(null);

  useEffect(() => {
    let map: Leaflet.Map | null = null;
    let cancelled = false;
    import("leaflet").then((mod) => {
      const L = (mod.default ?? mod) as LeafletNS;
      if (cancelled || !ref.current) return;
      map = L.map(ref.current, { zoomControl: false, attributionControl: true }).setView(center, zoom);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      setCtx({ L, map });
    });
    return () => {
      cancelled = true;
      map?.remove();
      setCtx(null);
    };
    // mapu vytvárame len raz
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ctx;
}

export function vehicleIconHtml(opts: { name: string; bg: string; fg: string; tram: boolean; bearing: number | null; delayCls: string; selected?: boolean }) {
  const arrow = opts.bearing != null ? `<i style="transform:rotate(${opts.bearing}deg)"></i>` : "";
  const fontSize = opts.name.length > 3 ? "font-size:9px;" : "";
  return `<div class="veh ${opts.tram ? "tram" : ""} d-${opts.delayCls}${opts.selected ? " sel" : ""}" style="--c:${opts.bg};--t:${opts.fg}">${arrow}<b style="${fontSize}">${opts.name}</b></div>`;
}
