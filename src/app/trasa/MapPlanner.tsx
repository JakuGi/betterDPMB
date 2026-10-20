"use client";

import type * as Leaflet from "leaflet";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JourneyCard } from "@/components/JourneyCard";
import { IconClock, IconLocate, IconSearch, IconSwap, IconWalk, IconX } from "@/components/icons";
import { useLeaflet } from "@/components/map/useLeaflet";
import { EmptyState, ErrorBox, SectionTitle, Spinner, UpdatedAt } from "@/components/ui";
import type { GeoResult, JourneyDTO, PlanResponse, StopGroupDTO } from "@/lib/api-types";
import { distanceM, fmtDistance, routeColors } from "@/lib/client/format";
import { getPosition, nearestStops, useNow, usePolling, useStops } from "@/lib/client/hooks";
import { getLang, translate } from "@/lib/i18n";
import { addHistory, paramToPlace, updateSettings, useStore, useT, type Place } from "@/lib/client/store";

type Which = "A" | "B";

interface Pt {
  lat: number;
  lon: number;
  label: string;
  detail?: string;
  /** bod je zastávka (uzol) – hľadá sa priamo z/na ňu */
  groupId?: string;
}

/** Miesto z URL, ktoré treba ešte dohľadať (zastávka bez súradníc, aktuálna poloha). */
type Pending = { kind: "group"; id: string; name: string } | { kind: "here" } | null;

function initialPoint(v: string | null): { pt: Pt | null; pending: Pending } {
  const p = paramToPlace(v);
  if (!p) return { pt: null, pending: null };
  if (p.kind === "coord") return { pt: { lat: p.lat, lon: p.lon, label: p.name }, pending: null };
  if (p.kind === "group") return { pt: null, pending: { kind: "group", id: p.id, name: p.name } };
  return { pt: null, pending: { kind: "here" } };
}

/** Parameter pre URL aj /api/plan */
const ptParam = (p: Pt) => (p.groupId ? `${p.groupId}|${p.label}` : `${p.lat.toFixed(5)},${p.lon.toFixed(5)}|${p.label}`);

const ptPlace = (p: Pt): Place => (p.groupId ? { kind: "group", id: p.groupId, name: p.label } : { kind: "coord", lat: p.lat, lon: p.lon, name: p.label });

function toLocalInput(epoch: number) {
  const d = new Date(epoch * 1000);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

const PIN_COLOR: Record<Which, string> = { A: "#16a34a", B: "#dc2626" };

function pinIcon(L: typeof Leaflet, which: Which) {
  return L.divIcon({
    className: "",
    iconSize: [34, 44],
    iconAnchor: [17, 42],
    html: `<svg width="34" height="44" viewBox="0 0 34 44"><path d="M17 43C17 43 32 27 32 16A15 15 0 0 0 2 16C2 27 17 43 17 43Z" fill="${PIN_COLOR[which]}" stroke="#fff" stroke-width="2.5"/><text x="17" y="21" text-anchor="middle" font-size="15" font-weight="800" fill="#fff" font-family="system-ui">${which}</text></svg>`,
  });
}

export function MapPlanner({
  fromParam,
  toParam,
  tParam,
  journeyParam,
}: {
  fromParam: string | null;
  toParam: string | null;
  tParam: number | null;
  journeyParam: string | null;
}) {
  const store = useStore();
  const { t } = useT();
  const now = useNow(15_000);
  const stops = useStops();
  const mapRef = useRef<HTMLDivElement>(null);
  const ctx = useLeaflet(mapRef, undefined, 14);

  const init = useMemo(() => ({ A: initialPoint(fromParam), B: initialPoint(toParam) }), [fromParam, toParam]);
  const [points, setPoints] = useState<Record<Which, Pt | null>>(() => ({ A: init.A.pt, B: init.B.pt }));
  const [pending, setPending] = useState<Record<Which, Pending>>(() => ({ A: init.A.pending, B: init.B.pending }));
  const [mode, setMode] = useState<Which>(() => (fromParam ? "B" : "A"));
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [at, setAt] = useState(() => (tParam ? toLocalInput(tParam) : ""));
  const [selectedId, setSelectedId] = useState<string | null>(journeyParam);
  const [fitTick, setFitTick] = useState(0);

  // ---------- nastavenie bodu ----------

  const setPoint = useCallback((which: Which, lat: number, lon: number, label?: string, detail?: string, groupId?: string) => {
    setPoints((p) => ({ ...p, [which]: { lat, lon, label: label ?? translate(getLang(), "pointOnMap"), detail, groupId } }));
    setSelectedId(null);
    if (which === "A") setMode("B");
    if (label) return;
    // názov ulice dohľadáme dodatočne
    fetch(`/api/geocode?lat=${lat}&lon=${lon}`)
      .then((r) => r.json())
      .then((g: GeoResult | null) => {
        if (!g?.label) return;
        setPoints((p) => {
          const cur = p[which];
          if (!cur || cur.lat !== lat || cur.lon !== lon) return p;
          return { ...p, [which]: { ...cur, label: g.label, detail: g.detail } };
        });
      })
      .catch(() => {});
  }, []);

  // dohľadanie zastávok a polohy z URL
  useEffect(() => {
    if (!stops) return;
    let changed = false;
    const next = { ...points };
    for (const w of ["A", "B"] as Which[]) {
      const p = pending[w];
      if (p?.kind !== "group") continue;
      const g = stops.find((x) => x.id === p.id);
      if (g) next[w] = { lat: g.lat, lon: g.lon, label: g.name, detail: t("stopWord"), groupId: g.id };
      changed = true;
    }
    if (!changed) return;
    setPoints(next);
    setPending((x) => ({ A: x.A?.kind === "group" ? null : x.A, B: x.B?.kind === "group" ? null : x.B }));
    setFitTick((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops]);

  useEffect(() => {
    const which = (["A", "B"] as Which[]).filter((w) => pending[w]?.kind === "here");
    if (!which.length) return;
    getPosition()
      .then((p) => {
        setPoints((x) => {
          const n = { ...x };
          for (const w of which) n[w] = { lat: p.lat, lon: p.lon, label: t("myLocation") };
          return n;
        });
        setFitTick((n) => n + 1);
      })
      .catch(() => {})
      .finally(() => setPending((x) => ({ A: x.A?.kind === "here" ? null : x.A, B: x.B?.kind === "here" ? null : x.B })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const p = await getPosition();
      setPoint("A", p.lat, p.lon, t("myLocation"));
      ctx?.map.setView([p.lat, p.lon], Math.max(ctx.map.getZoom(), 15));
    } catch (e) {
      alert(e instanceof Error ? e.message : t("locFailed"));
    } finally {
      setLocating(false);
    }
  };

  // ---------- hľadanie adresy ----------

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults(null);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/geocode?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => setResults(Array.isArray(d) ? d : []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 450);
    return () => clearTimeout(timer);
  }, [query]);

  // zastávky zodpovedajúce textu – aj tie sa dajú vybrať
  const stopMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!stops || q.length < 2) return [];
    const nq = q.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return stops.filter((g) => g.norm.includes(nq) && (g.zone === "100" || g.zone === "101")).slice(0, 3);
  }, [stops, query]);

  const pickResult = (lat: number, lon: number, label: string, detail?: string, groupId?: string) => {
    setPoint(mode, lat, lon, label, detail, groupId);
    setQuery("");
    setResults(null);
    ctx?.map.setView([lat, lon], Math.max(ctx.map.getZoom(), 16));
  };

  // ---------- URL ----------

  const atEpoch = at ? Math.floor(new Date(at).getTime() / 1000) : null;

  useEffect(() => {
    if (pending.A || pending.B) return;
    const qs = new URLSearchParams();
    if (points.A) qs.set("from", ptParam(points.A));
    if (points.B) qs.set("to", ptParam(points.B));
    if (atEpoch) qs.set("t", String(atEpoch));
    const s = qs.toString();
    window.history.replaceState(null, "", s ? `/trasa?${s}` : "/trasa");
  }, [points, pending, atEpoch]);

  // ---------- vyhľadanie spojení ----------

  const apiUrl = useMemo(() => {
    if (!points.A || !points.B) return null;
    const qs = new URLSearchParams({ from: ptParam(points.A), to: ptParam(points.B), maxTransfers: String(store.settings.maxTransfers), count: "6" });
    if (atEpoch) qs.set("t", String(atEpoch));
    if (store.settings.wheelchair) qs.set("wheelchair", "1");
    if (!store.settings.walking) qs.set("walk", "0");
    return `/api/plan?${qs}`;
    // názov bodu nemení výsledok, nepreposielame kvôli nemu dotaz
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.A?.lat, points.A?.lon, points.A?.groupId, points.B?.lat, points.B?.lon, points.B?.groupId, atEpoch, store.settings.maxTransfers, store.settings.wheelchair, store.settings.walking]);
  const { data, error, loading, updatedAt, reload } = usePolling<PlanResponse>(apiUrl, 30_000);
  const journeys = useMemo(() => data?.journeys ?? [], [data]);
  const selected: JourneyDTO | null = journeys.find((j) => j.id === selectedId) ?? journeys[0] ?? null;

  // do histórie zapíšeme až keď sa body chvíľu nemenia (aby ťahanie špendlíka nespamovalo históriu)
  useEffect(() => {
    if (!data || !points.A || !points.B) return;
    const a = points.A;
    const b = points.B;
    const timer = setTimeout(() => addHistory(ptPlace(a), ptPlace(b), "map"), 4000);
    return () => clearTimeout(timer);
  }, [data, points.A, points.B]);

  // ---------- mapa: kliknutie a vycentrovanie ----------

  useEffect(() => {
    if (!ctx) return;
    const onClick = (e: Leaflet.LeafletMouseEvent) => setPoint(modeRef.current, e.latlng.lat, e.latlng.lng);
    ctx.map.on("click", onClick);
    return () => {
      ctx.map.off("click", onClick);
    };
  }, [ctx, setPoint]);

  useEffect(() => {
    if (!ctx) return;
    // pri vybranom spojení sa mapa prispôsobí trase (nižšie)
    if (points.A && points.B) {
      if (!selectedId) ctx.map.fitBounds(ctx.L.latLngBounds([points.A.lat, points.A.lon], [points.B.lat, points.B.lon]), { paddingTopLeft: [50, 150], paddingBottomRight: [50, 60] });
    } else if (points.A) ctx.map.setView([points.A.lat, points.A.lon], 15);
    else if (points.B) ctx.map.setView([points.B.lat, points.B.lon], 15);
    // len pri načítaní mapy alebo po dohľadaní bodov z URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, fitTick]);

  // ---------- mapa: špendlíky a zastávky v okolí ----------

  const pinRefs = useRef<Partial<Record<Which, Leaflet.Marker>>>({});
  const nearLayer = useRef<Leaflet.LayerGroup | null>(null);

  const nearby = useMemo(() => {
    const out: Record<Which, { g: StopGroupDTO; d: number }[]> = { A: [], B: [] };
    if (!stops) return out;
    for (const w of ["A", "B"] as Which[]) {
      const p = points[w];
      if (p) out[w] = nearestStops(stops, p.lat, p.lon, 4, 800);
    }
    return out;
  }, [stops, points]);

  useEffect(() => {
    if (!ctx) return;
    const { L, map } = ctx;
    for (const w of ["A", "B"] as Which[]) {
      const p = points[w];
      const m = pinRefs.current[w];
      if (!p) {
        m?.remove();
        delete pinRefs.current[w];
        continue;
      }
      if (m) m.setLatLng([p.lat, p.lon]);
      else {
        pinRefs.current[w] = L.marker([p.lat, p.lon], { icon: pinIcon(L, w), draggable: true, zIndexOffset: 2000 })
          .on("dragend", (e) => {
            const ll = (e.target as Leaflet.Marker).getLatLng();
            setPoint(w, ll.lat, ll.lng);
          })
          .addTo(map);
      }
    }

    nearLayer.current?.remove();
    const layer = L.layerGroup();
    for (const w of ["A", "B"] as Which[]) {
      for (const { g } of nearby[w]) {
        L.circleMarker([g.lat, g.lon], { radius: 7, color: PIN_COLOR[w], weight: 3, fillColor: "#fff", fillOpacity: 1 })
          .bindTooltip(`${g.name}<br><small>${g.lines.slice(0, 10).join(" · ")}</small>`, { direction: "top", offset: [0, -6] })
          .addTo(layer);
      }
    }
    layer.addTo(map);
    nearLayer.current = layer;
  }, [ctx, points, nearby, setPoint]);

  // ---------- mapa: vybraná trasa ----------

  const routeLayer = useRef<Leaflet.LayerGroup | null>(null);
  const lastFitted = useRef<string | null>(null);
  useEffect(() => {
    if (!ctx) return;
    const { L, map } = ctx;
    routeLayer.current?.remove();
    routeLayer.current = null;
    if (!selected) return;
    const layer = L.layerGroup();
    const all: [number, number][] = [];
    for (const leg of selected.legs) {
      if (leg.type === "walk") {
        const pts: [number, number][] = [
          [leg.from.lat, leg.from.lon],
          [leg.to.lat, leg.to.lon],
        ];
        L.polyline(pts, { color: "#6b7280", weight: 4, dashArray: "2 8", lineCap: "round" }).addTo(layer);
        all.push(...pts);
      } else {
        const { bg, fg } = routeColors(leg.route);
        const pts = leg.stops.map((s) => [s.lat, s.lon] as [number, number]);
        L.polyline(pts, { color: "#fff", weight: 9, opacity: 0.9 }).addTo(layer);
        L.polyline(pts, { color: bg, weight: 6 }).addTo(layer);
        leg.stops.forEach((s, i) => {
          const end = i === 0 || i === leg.stops.length - 1;
          L.circleMarker([s.lat, s.lon], { radius: end ? 6 : 3, color: bg, weight: end ? 3 : 2, fillColor: "#fff", fillOpacity: 1 })
            .bindTooltip(s.name, { direction: "top" })
            .addTo(layer);
        });
        const first = leg.stops[0];
        L.marker([first.lat, first.lon], {
          interactive: false,
          icon: L.divIcon({
            className: "",
            iconSize: [36, 22],
            iconAnchor: [18, 30],
            html: `<div style="background:${bg};color:${fg};font:700 12px/22px system-ui;text-align:center;border-radius:6px;box-shadow:0 1px 4px rgb(0 0 0/.35)">${leg.route.name}</div>`,
          }),
        }).addTo(layer);
        all.push(...pts);
      }
    }
    layer.addTo(map);
    routeLayer.current = layer;
    if (all.length && lastFitted.current !== selected.id) {
      lastFitted.current = selected.id;
      map.fitBounds(L.latLngBounds(all), { paddingTopLeft: [40, 140], paddingBottomRight: [40, 50], maxZoom: 16 });
    }
  }, [ctx, selected]);

  const swap = () => {
    setPoints((p) => ({ A: p.B, B: p.A }));
    setSelectedId(null);
  };

  const hint = !points.A ? t("hintA") : !points.B ? t("hintB") : t("hintDrag");
  const resolving = !!(pending.A || pending.B);

  return (
    <div className="flex flex-1 flex-col md:h-[calc(100dvh-3.5rem)] md:flex-none md:flex-row md:overflow-clip">
      {/* mapa */}
      <div className="relative h-[52dvh] shrink-0 md:h-full md:flex-1">
        <div ref={mapRef} className="absolute inset-0 z-0" />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] p-3">
          <div className="pointer-events-auto mx-auto max-w-lg space-y-2">
            <div className="flex gap-1.5">
              {(["A", "B"] as Which[]).map((w) => (
                <button
                  key={w}
                  onClick={() => setMode(w)}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold shadow-lg transition ${mode === w ? "text-white" : "bg-card/95 text-fg"}`}
                  style={mode === w ? { background: PIN_COLOR[w] } : undefined}
                >
                  {w === "A" ? t("modeFrom") : t("modeTo")}
                </button>
              ))}
              <button onClick={useMyLocation} className="grid w-11 place-items-center rounded-xl bg-card/95 shadow-lg" title={t("startIsMe")}>
                {locating ? <Spinner /> : <IconLocate size={18} />}
              </button>
            </div>
            <div className="relative">
              <label className="flex items-center gap-2 rounded-xl border border-line bg-card/95 px-3 shadow-lg backdrop-blur">
                <IconSearch size={18} className="text-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={mode === "A" ? t("addrStart") : t("addrEnd")}
                  className="h-11 min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
                />
                {searching && <Spinner className="text-muted" />}
                {query && (
                  <button onClick={() => setQuery("")} className="text-muted" aria-label={t("cancel")}>
                    <IconX size={16} />
                  </button>
                )}
              </label>
              {query.trim().length >= 2 && (stopMatches.length > 0 || results) && (
                <ul className="absolute inset-x-0 top-full mt-1 max-h-72 overflow-auto rounded-xl border border-line bg-card py-1 shadow-xl">
                  {stopMatches.map((g) => (
                    <li key={g.id}>
                      <button onClick={() => pickResult(g.lat, g.lon, g.name, t("stopWord"), g.id)} className="block w-full px-3 py-2 text-left hover:bg-soft">
                        <span className="block font-medium">{g.name}</span>
                        <span className="block text-xs text-muted">
                          {t("stopWord")} · {g.lines.slice(0, 10).join(" · ")}
                        </span>
                      </button>
                    </li>
                  ))}
                  {results?.map((r, i) => (
                    <li key={i}>
                      <button onClick={() => pickResult(r.lat, r.lon, r.label, r.detail)} className="block w-full px-3 py-2 text-left hover:bg-soft">
                        <span className="block font-medium">{r.label}</span>
                        {r.detail && <span className="block text-xs text-muted">{r.detail}</span>}
                      </button>
                    </li>
                  ))}
                  {results && results.length === 0 && stopMatches.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t("nothingFound")}</li>}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[400] flex justify-center">
          <span className="rounded-full bg-fg/80 px-3 py-1 text-xs font-medium text-bg shadow">{hint}</span>
        </div>
      </div>

      {/* panel */}
      <div className="w-full space-y-3 px-4 pb-28 pt-4 md:h-full md:w-[440px] md:overflow-y-auto md:border-l md:border-line md:pb-6">
        <div className="rounded-2xl border border-line bg-card p-3 shadow-sm">
          <div className="flex items-stretch gap-2">
            <div className="min-w-0 flex-1 space-y-2">
              {(["A", "B"] as Which[]).map((w) => {
                const p = points[w];
                return (
                  <button
                    key={w}
                    onClick={() => setMode(w)}
                    className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left ${mode === w ? "border-fg/30 bg-soft" : "border-line"}`}
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: PIN_COLOR[w] }}>
                      {w}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${p ? "font-semibold" : "text-muted"}`}>
                        {p ? p.label : pending[w] ? t("loading") : w === "A" ? t("fromTap") : t("toTap")}
                      </span>
                      {p?.detail && <span className="block truncate text-xs text-muted">{p.detail}</span>}
                    </span>
                    {p && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPoints((x) => ({ ...x, [w]: null }));
                          setMode(w);
                        }}
                        className="rounded-full p-1 text-muted hover:text-fg"
                        aria-label={t("removePoint")}
                      >
                        <IconX size={14} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button onClick={swap} className="grid w-10 place-items-center rounded-xl border border-line text-muted hover:text-fg" aria-label={t("swap")}>
              <IconSwap size={18} />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <label className="inline-flex items-center gap-1.5 text-muted">
              <IconClock size={16} />
              <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="h-8 rounded-lg border border-line bg-soft px-2" />
              {at && (
                <button className="underline" onClick={() => setAt("")}>
                  {t("now")}
                </button>
              )}
            </label>
            <button
              type="button"
              onClick={() => updateSettings({ walking: !store.settings.walking })}
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 ${store.settings.walking ? "border-line text-muted" : "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"}`}
            >
              <IconWalk size={14} /> {store.settings.walking ? t("walkOn") : t("walkOff")}
            </button>
          </div>
        </div>

        {(nearby.A.length > 0 || nearby.B.length > 0) && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-1">
            {(["A", "B"] as Which[]).map(
              (w) =>
                nearby[w].length > 0 && (
                  <div key={w} className="rounded-2xl border border-line bg-card p-3 text-sm shadow-sm">
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted">
                      <span className="size-2.5 rounded-full" style={{ background: PIN_COLOR[w] }} />
                      {w === "A" ? t("stopsNearStart") : t("stopsNearEnd")}
                    </div>
                    <ul className="space-y-1">
                      {nearby[w].map(({ g, d }) => (
                        <li key={g.id} className="flex items-baseline gap-2">
                          <Link href={`/zastavka/${g.id}`} className="truncate font-medium hover:underline">
                            {g.name}
                          </Link>
                          <span className="truncate text-xs text-muted">{g.lines.slice(0, 6).join(" · ")}</span>
                          <span className="ml-auto shrink-0 text-xs text-muted tabular">{fmtDistance(d)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ),
            )}
          </div>
        )}

        {points.A && points.B && (
          <>
            {(() => {
              const d = distanceM(points.A.lat, points.A.lon, points.B.lat, points.B.lon);
              if (d > 1500) return null;
              return (
                <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3 shadow-sm">
                  <IconWalk size={22} className="shrink-0 text-muted" />
                  <div className="text-sm">
                    <div className="font-semibold">{t("walkAbout", { n: Math.max(1, Math.round((d * 1.3) / 1.25 / 60)) })}</div>
                    <div className="text-muted">{t("walkAboutHint", { d: fmtDistance(d) })}</div>
                  </div>
                </div>
              );
            })()}
            <SectionTitle action={<UpdatedAt at={updatedAt} loading={loading} onRefresh={reload} />}>{t("bestJourneys")}</SectionTitle>
            {error && <ErrorBox>{error}</ErrorBox>}
            {!data && loading && (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-2xl bg-card" />
                ))}
              </div>
            )}
            {data && journeys.length === 0 && <EmptyState>{t("noTransitBetween")}</EmptyState>}
            <div className="space-y-3">
              {journeys.map((j) => (
                <JourneyCard key={j.id} j={j} now={now} selected={selected?.id === j.id} onSelect={() => setSelectedId(j.id)} defaultOpen={j.id === selected?.id} />
              ))}
            </div>
            {journeys.length > 0 && (
              <Link
                href={`/spojenie?from=${encodeURIComponent(ptParam(points.A))}&to=${encodeURIComponent(ptParam(points.B))}${atEpoch ? `&t=${atEpoch}` : ""}&src=map`}
                className="block rounded-xl border border-line bg-card py-3 text-center text-sm font-medium hover:bg-soft"
              >
                {t("moreInList")}
              </Link>
            )}
          </>
        )}

        {!points.A && !points.B && !resolving && (
          <div className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
            <p className="font-semibold text-fg">{t("plannerHelpTitle")}</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li>{t("plannerHelp1")}</li>
              <li>{t("plannerHelp2")}</li>
              <li>{t("plannerHelp3")}</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
