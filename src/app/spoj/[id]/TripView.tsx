"use client";

import type * as Leaflet from "leaflet";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IconMap, IconWheelchair } from "@/components/icons";
import { useLeaflet, vehicleIconHtml } from "@/components/map/useLeaflet";
import { AlertList, Card, DelayBadge, ErrorBox, LineBadge, UpdatedAt } from "@/components/ui";
import type { TripDetailDTO } from "@/lib/api-types";
import { delayLevel, fmtDate, fmtTime, routeColors } from "@/lib/client/format";
import { usePolling } from "@/lib/client/hooks";
import { addFavTrip, useStore, useT } from "@/lib/client/store";

export function TripView({ tripId, date, boardGroup }: { tripId: string; date: number | null; boardGroup: string | null }) {
  const store = useStore();
  const { t } = useT();
  const url = `/api/trip/${encodeURIComponent(tripId)}${date ? `?d=${date}` : ""}`;
  const { data, error, loading, updatedAt, reload } = usePolling<TripDetailDTO>(url, 15_000);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) document.title = `${data.route.name} → ${data.headsign} · LepšieDPMB`;
  }, [data]);

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <div className="h-96 animate-pulse rounded-2xl bg-card" />;

  const v = data.vehicle;
  const delay = v?.delay ?? null;
  const cur = data.currentIndex;
  const boardIdx = boardGroup ? data.stops.findIndex((s) => s.groupId === boardGroup) : -1;
  const board = boardIdx >= 0 ? data.stops[boardIdx] : null;
  const alreadySaved =
    !!board &&
    store.trips.some((t) => t.groupId === board.groupId && t.routeName === data.route.name && t.headsign === data.headsign && t.time === fmtTime(board.dep));

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <LineBadge route={data.route} size="lg" href={`/linka/${encodeURIComponent(data.route.id)}`} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold leading-tight">→ {data.headsign}</h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span>{fmtDate(data.stops[0].dep)}</span>
            {data.wheelchair && (
              <span className="inline-flex items-center gap-1">
                <IconWheelchair size={14} /> {t("stepFreeVehicle")}
              </span>
            )}
            {v ? (
              <>
                <DelayBadge delay={delay} />
                <span>{t("vehicle", { v: v.label })}</span>
              </>
            ) : (
              <span>{t("noLivePosition")}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {v && (
          <Link href={`/mapa?trip=${encodeURIComponent(tripId)}`} className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2 text-sm font-medium hover:bg-soft">
            <IconMap size={16} /> {t("followOnMap")}
          </Link>
        )}
        {board && (
          <button
            disabled={alreadySaved}
            onClick={() => {
              addFavTrip({ groupId: board.groupId, stopName: board.name, routeName: data.route.name, headsign: data.headsign, time: fmtTime(board.dep) });
              setSaved(true);
            }}
            className="rounded-xl border border-line bg-card px-3 py-2 text-left text-sm font-medium hover:bg-soft disabled:opacity-60"
          >
            {alreadySaved || saved ? t("savedMyTrip") : t("saveMyTrip", { time: fmtTime(board.dep), stop: board.name })}
          </button>
        )}
        <span className="ml-auto">
          <UpdatedAt at={updatedAt} loading={loading} onRefresh={reload} />
        </span>
      </div>

      <AlertList alerts={data.alerts} />

      <TripMap trip={data} />

      <Card className="py-2">
        <ol>
          {data.stops.map((s, i) => {
            const passed = cur != null && i < cur;
            const here = cur === i && v?.stopped;
            const approaching = cur === i && !v?.stopped;
            const future = cur == null || i >= cur;
            const est = delay != null && future && delay > 0 ? delay : 0;
            const isBoard = i === boardIdx;
            return (
              <li key={i} className={`relative flex items-center gap-3 px-4 py-1.5 ${passed ? "opacity-45" : ""} ${isBoard ? "bg-blue-50 dark:bg-blue-950/40" : ""}`}>
                <div className="relative flex w-5 justify-center self-stretch">
                  <span className="absolute inset-y-0 w-1 rounded-full" style={{ background: i === 0 ? "transparent" : routeColors(data.route).bg, top: 0, bottom: "50%" }} />
                  <span
                    className="absolute inset-y-0 w-1 rounded-full"
                    style={{ background: i === data.stops.length - 1 ? "transparent" : routeColors(data.route).bg, top: "50%", bottom: 0 }}
                  />
                  <span
                    className={`relative z-10 my-auto rounded-full border-[3px] bg-card ${here ? "size-4" : "size-3"}`}
                    style={{ borderColor: here ? "#2563eb" : routeColors(data.route).bg }}
                  />
                  {approaching && <span className="absolute -top-2 z-20 size-3 rounded-full bg-blue-600 ring-4 ring-blue-600/25" title={t("vehicleApproaching")} />}
                </div>
                <div className="w-14 shrink-0 text-right tabular">
                  {est >= 60 ? (
                    <>
                      <div className={`text-sm font-semibold ${delayLevel(delay) === "major" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>{fmtTime(s.dep + est)}</div>
                      <div className="text-[11px] text-muted line-through">{fmtTime(s.dep)}</div>
                    </>
                  ) : (
                    <div className="text-sm font-semibold">{fmtTime(i === data.stops.length - 1 ? s.arr : s.dep)}</div>
                  )}
                </div>
                <Link href={`/zastavka/${s.groupId}`} className="min-w-0 flex-1 truncate py-1 hover:underline">
                  <span className={here || isBoard ? "font-semibold" : ""}>{s.name}</span>
                  {s.onRequest && <span className="ml-1 text-muted" title={t("requestStop")}>×</span>}
                </Link>
                {s.platform && <span className="shrink-0 text-xs text-muted">{s.platform}</span>}
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}

function TripMap({ trip }: { trip: TripDetailDTO }) {
  const ref = useRef<HTMLDivElement>(null);
  const ctx = useLeaflet(ref);
  const routeLayer = useRef<Leaflet.LayerGroup | null>(null);
  const vehMarker = useRef<Leaflet.Marker | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    if (!ctx) return;
    const { L, map } = ctx;
    routeLayer.current?.remove();
    const color = routeColors(trip.route).bg;
    const layer = L.layerGroup();
    const pts = trip.stops.map((s) => [s.lat, s.lon] as [number, number]);
    L.polyline(pts, { color, weight: 5, opacity: 0.7 }).addTo(layer);
    trip.stops.forEach((s) => L.circleMarker([s.lat, s.lon], { radius: 4, color, weight: 2, fillColor: "#fff", fillOpacity: 1 }).bindTooltip(s.name).addTo(layer));
    layer.addTo(map);
    routeLayer.current = layer;
    if (!fitted.current) {
      map.fitBounds(L.latLngBounds(pts), { padding: [20, 20] });
      fitted.current = true;
    }
  }, [ctx, trip.stops, trip.route]);

  useEffect(() => {
    if (!ctx) return;
    const { L, map } = ctx;
    const v = trip.vehicle;
    if (!v) {
      vehMarker.current?.remove();
      vehMarker.current = null;
      return;
    }
    const { bg, fg } = routeColors(trip.route);
    const icon = L.divIcon({
      className: "",
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      html: vehicleIconHtml({ name: trip.route.name, bg, fg, tram: trip.route.type === 0, bearing: v.bearing, delayCls: delayLevel(v.delay), selected: true }),
    });
    if (vehMarker.current) vehMarker.current.setLatLng([v.lat, v.lon]).setIcon(icon);
    else vehMarker.current = L.marker([v.lat, v.lon], { icon, zIndexOffset: 1000 }).addTo(map);
  }, [ctx, trip.vehicle, trip.route]);

  return <div ref={ref} className="h-64 overflow-hidden rounded-2xl border border-line md:h-80" />;
}
