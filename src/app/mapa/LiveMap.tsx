"use client";

import type * as Leaflet from "leaflet";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconLocate, IconSearch, IconStar, IconX } from "@/components/icons";
import { useLeaflet, vehicleIconHtml } from "@/components/map/useLeaflet";
import { DelayBadge, LineBadge, Spinner } from "@/components/ui";
import type { TripDetailDTO, VehicleDTO, VehiclesResponse } from "@/lib/api-types";
import { delayLevel, isBrnoMhd, routeColors } from "@/lib/client/format";
import { getPosition, usePolling, useStops } from "@/lib/client/hooks";
import { updateSettings, useStore, useT } from "@/lib/client/store";

type View = { lat: number; lon: number; z: number } | null;

export function LiveMap({ initialLines, initialTrip, initialView }: { initialLines: string[]; initialTrip: string | null; initialView: View }) {
  const router = useRouter();
  const store = useStore();
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const ctx = useLeaflet(ref, initialView ? [initialView.lat, initialView.lon] : undefined, initialView?.z ?? 14);
  const stops = useStops();
  const { data, loading } = usePolling<VehiclesResponse>("/api/vehicles", 10_000);

  const [lineQuery, setLineQuery] = useState(initialLines.join(", "));
  const [onlyFav, setOnlyFav] = useState(false);
  const [onlyDelayed, setOnlyDelayed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [follow, setFollow] = useState(!!initialTrip);
  const [viewTick, setViewTick] = useState(0);
  const [locating, setLocating] = useState(false);
  const pendingTrip = useRef(initialTrip);

  const markers = useRef(new Map<string, { m: Leaflet.Marker; key: string }>());
  const stopLayer = useRef<Leaflet.LayerGroup | null>(null);
  const routeLayer = useRef<Leaflet.LayerGroup | null>(null);
  const meMarker = useRef<Leaflet.Marker | null>(null);

  const wanted = useMemo(
    () =>
      lineQuery
        .split(/[\s,;]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    [lineQuery],
  );
  const favLineIds = useMemo(() => new Set(store.lines.map((l) => l.id)), [store.lines]);

  const visible = useMemo(() => {
    if (!data) return [];
    return data.vehicles.filter((v) => {
      if (!v.route) return false;
      if (wanted.length) return wanted.includes(v.route.name.toUpperCase());
      if (onlyFav && !favLineIds.has(v.route.id)) return false;
      if (store.settings.onlyMhd && !isBrnoMhd(v.route)) return false;
      if (onlyDelayed && (v.delay == null || v.delay < 180)) return false;
      return true;
    });
  }, [data, wanted, onlyFav, favLineIds, onlyDelayed, store.settings.onlyMhd]);

  const selected = useMemo(() => data?.vehicles.find((v) => v.id === selectedId) ?? null, [data, selectedId]);

  // výber podľa ?trip=
  useEffect(() => {
    if (!data || !pendingTrip.current) return;
    const v = data.vehicles.find((x) => x.tripId === pendingTrip.current);
    pendingTrip.current = null;
    if (v) {
      setSelectedId(v.id);
      setFollow(true);
    }
  }, [data]);

  // prekreslenie pri posune mapy
  useEffect(() => {
    if (!ctx) return;
    const onMove = () => setViewTick((t) => t + 1);
    ctx.map.on("moveend", onMove);
    ctx.map.on("dragstart", () => setFollow(false));
    return () => {
      ctx.map.off("moveend", onMove);
    };
  }, [ctx]);

  // vozidlá
  useEffect(() => {
    if (!ctx) return;
    const { L, map } = ctx;
    const bounds = map.getBounds().pad(0.3);
    const keep = new Set<string>();
    for (const v of visible) {
      if (!bounds.contains([v.lat, v.lon]) && v.id !== selectedId) continue;
      keep.add(v.id);
      const route = v.route!;
      const { bg, fg } = routeColors(route);
      const sel = v.id === selectedId;
      const key = `${route.name}|${bg}|${v.bearing}|${delayLevel(v.delay)}|${sel}`;
      const existing = markers.current.get(v.id);
      if (existing) {
        existing.m.setLatLng([v.lat, v.lon]);
        if (existing.key !== key) {
          existing.m.setIcon(makeIcon(L, v, bg, fg, sel));
          existing.key = key;
        }
        existing.m.setZIndexOffset(sel ? 1000 : 0);
      } else {
        const m = L.marker([v.lat, v.lon], { icon: makeIcon(L, v, bg, fg, sel), zIndexOffset: sel ? 1000 : 0, keyboard: false })
          .on("click", () => {
            setSelectedId(v.id);
          })
          .addTo(map);
        markers.current.set(v.id, { m, key });
      }
    }
    for (const [id, { m }] of markers.current) {
      if (!keep.has(id)) {
        m.remove();
        markers.current.delete(id);
      }
    }
    if (follow && selected) map.panTo([selected.lat, selected.lon], { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, visible, selectedId, viewTick]);

  // zastávky pri väčšom priblížení
  useEffect(() => {
    if (!ctx || !stops) return;
    const { L, map } = ctx;
    stopLayer.current?.remove();
    if (map.getZoom() < 15) return;
    const b = map.getBounds().pad(0.2);
    const layer = L.layerGroup();
    for (const g of stops) {
      if (!b.contains([g.lat, g.lon])) continue;
      L.circleMarker([g.lat, g.lon], { radius: 6, color: "#374151", weight: 2.5, fillColor: "#fff", fillOpacity: 1 })
        .bindTooltip(g.name, { direction: "top", offset: [0, -6] })
        .on("click", () => router.push(`/zastavka/${g.id}`))
        .addTo(layer);
    }
    layer.addTo(map);
    stopLayer.current = layer;
  }, [ctx, stops, viewTick, router]);

  // trasa vybraného spoja
  useEffect(() => {
    routeLayer.current?.remove();
    routeLayer.current = null;
    if (!ctx || !selected?.tripId) return;
    let cancelled = false;
    fetch(`/api/trip/${encodeURIComponent(selected.tripId)}${selected.date ? `?d=${selected.date}` : ""}`)
      .then((r) => r.json())
      .then((t: TripDetailDTO) => {
        if (cancelled || !t.stops) return;
        const { L, map } = ctx;
        const color = routeColors(t.route).bg;
        const layer = L.layerGroup();
        L.polyline(
          t.stops.map((s) => [s.lat, s.lon] as [number, number]),
          { color, weight: 5, opacity: 0.55 },
        ).addTo(layer);
        t.stops.forEach((s, i) =>
          L.circleMarker([s.lat, s.lon], { radius: 4, color, weight: 2, fillColor: "#fff", fillOpacity: 1 })
            .bindTooltip(s.name, { direction: "top" })
            .on("click", () => router.push(`/zastavka/${s.groupId}`))
            .addTo(layer)
            .setStyle(i === 0 || i === t.stops.length - 1 ? { radius: 6 } : {}),
        );
        layer.addTo(map);
        routeLayer.current = layer;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, selected?.tripId]);

  const locate = async () => {
    if (!ctx) return;
    setLocating(true);
    try {
      const p = await getPosition();
      const { L, map } = ctx;
      meMarker.current?.remove();
      meMarker.current = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "", html: '<div class="me-dot"></div>', iconSize: [16, 16] }) }).addTo(map);
      map.flyTo([p.lat, p.lon], 16);
      setFollow(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : t("locFailed"));
    } finally {
      setLocating(false);
    }
  };

  const delayedCount = visible.filter((v) => v.delay != null && v.delay >= 180).length;

  return (
    <div className="relative flex-1" style={{ minHeight: "calc(100dvh - 3.5rem)" }}>
      <div ref={ref} className="absolute inset-0 z-0" />

      {/* filtre */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] p-3">
        <div className="pointer-events-auto mx-auto max-w-xl space-y-2">
          <label className="flex items-center gap-2 rounded-xl border border-line bg-card/95 px-3 shadow-lg backdrop-blur">
            <IconSearch size={18} className="text-muted" />
            <input
              value={lineQuery}
              onChange={(e) => setLineQuery(e.target.value)}
              placeholder={t("linesPlaceholder")}
              className="h-11 min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
              inputMode="text"
            />
            {lineQuery && (
              <button onClick={() => setLineQuery("")} className="text-muted" aria-label={t("cancelFilter")}>
                <IconX size={16} />
              </button>
            )}
            {loading && <Spinner className="text-muted" />}
          </label>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <MapChip active={store.settings.onlyMhd} onClick={() => updateSettings({ onlyMhd: !store.settings.onlyMhd })}>
              {t("onlyMhd")}
            </MapChip>
            {store.lines.length > 0 && (
              <MapChip active={onlyFav} onClick={() => setOnlyFav(!onlyFav)}>
                <IconStar size={12} filled /> {t("myLines")}
              </MapChip>
            )}
            <MapChip active={onlyDelayed} onClick={() => setOnlyDelayed(!onlyDelayed)}>
              {t("delayed3")} {delayedCount > 0 && !onlyDelayed ? `(${delayedCount})` : ""}
            </MapChip>
            <span className="rounded-full bg-card/90 px-2.5 py-1 text-muted shadow">{t("vehiclesCount", { n: visible.length })}</span>
          </div>
        </div>
      </div>

      <button
        onClick={locate}
        className="absolute bottom-28 right-3 z-[500] grid size-11 place-items-center rounded-full border border-line bg-card shadow-lg md:bottom-24"
        aria-label={t("myLocation")}
      >
        {locating ? <Spinner /> : <IconLocate size={20} />}
      </button>

      <div className="absolute bottom-20 left-3 z-[400] hidden rounded-lg bg-card/90 px-2 py-1 text-[11px] text-muted shadow sm:block md:bottom-6">
        <Legend color="#22c55e" label={t("onTime")} /> <Legend color="#f59e0b" label={t("legendTo5")} /> <Legend color="#ef4444" label="5+ min" /> <Legend color="#3b82f6" label={t("legendEarly")} />
      </div>

      {selected && (
        <div className="absolute inset-x-0 bottom-16 z-[600] p-3 md:bottom-0">
          <div className="mx-auto max-w-xl rounded-2xl border border-line bg-card p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              {selected.route && <LineBadge route={selected.route} size="lg" />}
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">→ {selected.headsign || "?"}</div>
                <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
                  <DelayBadge delay={selected.delay} />
                  {selected.nextStop && <span>{selected.stopped ? t("vehAt", { s: selected.nextStop }) : t("vehNext", { s: selected.nextStop })}</span>}
                </div>
                <div className="text-xs text-muted">
                  {t("vehicleAgo", { v: selected.label, s: Math.max(0, Math.round(Date.now() / 1000 - selected.ts)) })}
                </div>
              </div>
              <button onClick={() => setSelectedId(null)} className="rounded-full p-1 text-muted hover:bg-soft" aria-label={t("close")}>
                <IconX size={18} />
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <Link
                href={`/spoj/${encodeURIComponent(selected.tripId)}${selected.date ? `?d=${selected.date}` : ""}`}
                className="flex-1 rounded-xl bg-brand py-2 text-center text-sm font-semibold text-white"
              >
                {t("tripDetail")}
              </Link>
              <button
                onClick={() => setFollow(!follow)}
                className={`flex-1 rounded-xl border py-2 text-sm font-semibold ${follow ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-line"}`}
              >
                {follow ? t("following") : t("follow")}
              </button>
              {selected.route && (
                <Link href={`/linka/${encodeURIComponent(selected.route.id)}`} className="rounded-xl border border-line px-3 py-2 text-sm font-semibold">
                  {t("line")}
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function makeIcon(L: typeof Leaflet, v: VehicleDTO, bg: string, fg: string, selected: boolean) {
  return L.divIcon({
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: vehicleIconHtml({
      name: v.route!.name,
      bg,
      fg,
      tram: v.route!.type === 0,
      bearing: v.bearing,
      delayCls: delayLevel(v.delay),
      selected,
    }),
  });
}

function MapChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium shadow transition ${active ? "bg-fg text-bg" : "bg-card/95 text-fg"}`}
    >
      {children}
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="mr-2 inline-flex items-center gap-1">
      <span className="inline-block size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
