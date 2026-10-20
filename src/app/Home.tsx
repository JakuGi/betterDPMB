"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DepartureList } from "@/components/DepartureList";
import { IconBriefcase, IconChevron, IconClock, IconHome, IconLocate, IconMap, IconRoute, IconStar, IconX } from "@/components/icons";
import { InstallCard } from "@/components/InstallApp";
import { buildPlanUrl, buildTrasaUrl, PlannerForm } from "@/components/PlannerForm";
import { Card, DelayBadge, EmptyState, LineBadge, SectionTitle, Spinner } from "@/components/ui";
import type { DeparturesResponse } from "@/lib/api-types";
import { fmtCountdown, fmtDistance, fmtTime } from "@/lib/client/format";
import { nearestStops, useGeolocation, useNow, usePolling, useStops } from "@/lib/client/hooks";
import {
  clearHistory,
  findFavRoute,
  removeHistory,
  toggleFavRoute,
  useStore,
  useT,
  type FavStop,
  type FavTrip,
  type Place,
} from "@/lib/client/store";
import { LOCALES, type I18nKey, type Vars } from "@/lib/i18n";

export function Home() {
  const store = useStore();
  const { t } = useT();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const here: Place = { kind: "here", name: t("myLocation") };

  const hasFavs = store.stops.length + store.routes.length + store.trips.length > 0 || store.home || store.work;

  return (
    <div>
      <Card className="p-4">
        <PlannerForm />
      </Card>

      {mounted && (store.home || store.work || store.routes.length > 0) && (
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
          {store.home && <QuickLink href={buildPlanUrl(here, store.home)} icon={<IconHome size={16} />} label={t("goHome")} />}
          {store.work && <QuickLink href={buildPlanUrl(here, store.work)} icon={<IconBriefcase size={16} />} label={t("goWork")} />}
          {store.routes.map((r) => (
            <QuickLink key={r.id} href={buildPlanUrl(r.from, r.to)} icon={<IconRoute size={16} />} label={r.label || `${short(r.from, t)} → ${short(r.to, t)}`} />
          ))}
        </div>
      )}

      <div className="mt-3">
        <InstallCard dismissible />
      </div>

      {mounted && store.history.length > 0 && <SearchHistory />}

      {mounted && store.trips.length > 0 && (
        <>
          <SectionTitle>{t("myTrips")}</SectionTitle>
          <div className="grid gap-2 md:grid-cols-2">
            {store.trips.map((trip) => (
              <FavTripCard key={trip.id} trip={trip} />
            ))}
          </div>
        </>
      )}

      {mounted && store.stops.length > 0 && (
        <>
          <SectionTitle
            action={
              <Link href="/oblubene" className="text-xs text-muted hover:text-fg">
                {t("edit")}
              </Link>
            }
          >
            {t("favStops")}
          </SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            {store.stops.map((s) => (
              <FavStopCard key={s.id} stop={s} />
            ))}
          </div>
        </>
      )}

      <Nearby />

      {mounted && !hasFavs && (
        <Card className="mt-6 p-4 text-sm text-muted">
          <p className="mb-1 font-semibold text-fg">{t("tipTitle")}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              {t("tip1a")} <IconStar size={14} className="inline text-amber-500" /> {t("tip1b")}
            </li>
            <li>{t("tip2")}</li>
            <li>{t("tip3")}</li>
            <li>
              {t("tip4a")}{" "}
              <Link href="/oblubene" className="underline">
                {t("tip4link")}
              </Link>{" "}
              {t("tip4b")}
            </li>
          </ul>
        </Card>
      )}
    </div>
  );
}

type TFn = (key: I18nKey, vars?: Vars) => string;

function ago(ms: number, t: TFn, lang: keyof typeof LOCALES) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return t("justNow");
  if (min < 60) return t("agoMin", { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t("agoH", { n: h });
  const d = Math.round(h / 24);
  if (d === 1) return t("yesterday");
  if (d < 7) return t("agoDays", { n: d });
  return new Date(ms).toLocaleDateString(LOCALES[lang], { day: "numeric", month: "numeric" });
}

function placeLabel(p: Place, t: TFn) {
  return p.kind === "here" ? t("myLocation") : p.name;
}

function SearchHistory() {
  const store = useStore();
  const { t, lang } = useT();
  const [all, setAll] = useState(false);
  const list = all ? store.history : store.history.slice(0, 5);
  return (
    <>
      <SectionTitle
        action={
          <button
            onClick={() => {
              if (confirm(t("clearHistoryConfirm"))) clearHistory();
            }}
            className="text-xs text-muted hover:text-fg"
          >
            {t("clear")}
          </button>
        }
      >
        {t("historyTitle")}
      </SectionTitle>
      <Card className="divide-y divide-line overflow-hidden">
        {list.map((h) => {
          const fav = !!findFavRoute(store, h.from, h.to);
          const fromMap = h.source === "map";
          return (
            <div key={h.id} className="flex items-center gap-1 pr-1">
              <Link
                href={fromMap ? buildTrasaUrl(h.from, h.to) : buildPlanUrl(h.from, h.to)}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 hover:bg-soft"
              >
                {fromMap ? <IconMap size={18} className="shrink-0 text-blue-500" /> : <IconClock size={18} className="shrink-0 text-muted" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {placeLabel(h.from, t)} <span className="text-muted">→</span> {placeLabel(h.to, t)}
                  </span>
                  <span className="block text-xs text-muted">{ago(h.at, t, lang)}</span>
                </span>
              </Link>
              {!fromMap && (
                <Link href={buildTrasaUrl(h.from, h.to)} className="rounded-full p-2 text-muted hover:text-fg" title={t("showOnMap")}>
                  <IconMap size={18} />
                </Link>
              )}
              <button
                onClick={() => toggleFavRoute(h.from, h.to)}
                className={`rounded-full p-2 ${fav ? "text-amber-500" : "text-muted hover:text-fg"}`}
                title={fav ? t("unsaveRoute") : t("saveRoute")}
              >
                <IconStar size={18} filled={fav} />
              </button>
              <button onClick={() => removeHistory(h.id)} className="rounded-full p-2 text-muted hover:text-fg" title={t("removeFromHistory")}>
                <IconX size={16} />
              </button>
            </div>
          );
        })}
        {store.history.length > 5 && (
          <button onClick={() => setAll(!all)} className="w-full py-2.5 text-center text-sm font-medium text-muted hover:bg-soft hover:text-fg">
            {all ? t("showLess") : t("showAll", { n: store.history.length })}
          </button>
        )}
      </Card>
    </>
  );
}

function short(p: Place, t: TFn) {
  const name = placeLabel(p, t);
  return name.length > 18 ? `${name.slice(0, 17)}…` : name;
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-card px-3 py-2 text-sm font-medium shadow-sm hover:bg-soft">
      {icon}
      {label}
    </Link>
  );
}

function FavStopCard({ stop }: { stop: FavStop }) {
  const { t } = useT();
  const now = useNow(10_000);
  const { data, error } = usePolling<DeparturesResponse>(`/api/departures?group=${encodeURIComponent(stop.id)}&limit=40`, 30_000);
  const deps = useMemo(() => (data?.departures ?? []).filter((d) => !stop.lines.length || stop.lines.includes(d.route.name)).slice(0, 5), [data, stop.lines]);
  return (
    <Card className="overflow-hidden">
      <Link href={`/zastavka/${stop.id}`} className="flex items-center gap-2 border-b border-line px-3 py-2.5 hover:bg-soft">
        <IconStar size={16} filled className="text-amber-500" />
        <span className="flex-1 truncate font-semibold">{stop.name}</span>
        {stop.lines.length > 0 && <span className="text-xs text-muted">{t("linesList", { lines: stop.lines.join(", ") })}</span>}
        <IconChevron size={16} className="text-muted" />
      </Link>
      {error && <div className="p-3 text-sm text-red-600">{error}</div>}
      {!data && !error && <div className="h-40 animate-pulse" />}
      {data && deps.length === 0 && <EmptyState>{t("nothingNow")}</EmptyState>}
      {data && <DepartureList departures={deps} now={now} groupId={stop.id} />}
    </Card>
  );
}

function FavTripCard({ trip }: { trip: FavTrip }) {
  const { t } = useT();
  const now = useNow(10_000);
  // najbližší výskyt: dnes, alebo zajtra, ak už dávno odišiel
  const target = useMemo(() => {
    const [h, m] = trip.time.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    let ts = Math.floor(d.getTime() / 1000);
    if (ts < now - 20 * 60) ts += 86400;
    return ts;
    // prepočítame raz za pár minút stačí
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.time, Math.floor(now / 300)]);
  const { data } = usePolling<DeparturesResponse>(`/api/departures?group=${encodeURIComponent(trip.groupId)}&at=${target - 20 * 60}&limit=200`, 30_000);
  const dep = useMemo(() => {
    const cands = (data?.departures ?? []).filter((d) => d.route.name === trip.routeName && d.headsign === trip.headsign);
    cands.sort((a, b) => Math.abs(a.scheduled - target) - Math.abs(b.scheduled - target));
    return cands[0] && Math.abs(cands[0].scheduled - target) < 30 * 60 ? cands[0] : null;
  }, [data, trip, target]);
  const tomorrow = target - now > 12 * 3600;

  return (
    <Link
      href={dep ? `/spoj/${encodeURIComponent(dep.tripId)}?d=${dep.date}&s=${trip.groupId}` : `/zastavka/${trip.groupId}`}
      className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3 shadow-sm hover:bg-soft"
    >
      <LineBadge route={dep?.route ?? { name: trip.routeName, type: 3, color: null, textColor: null }} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">
          {trip.time} · {trip.stopName}
        </div>
        <div className="truncate text-sm text-muted">→ {trip.headsign}</div>
      </div>
      <div className="shrink-0 text-right">
        {!data ? (
          <Spinner className="text-muted" />
        ) : dep ? (
          <>
            <div className="font-bold tabular">{tomorrow ? t("tomorrow") : fmtCountdown(dep.scheduled + (dep.delay ?? 0), now)}</div>
            <DelayBadge delay={dep.delay} compact />
            {dep.delay == null && <div className="text-xs text-muted">{fmtTime(dep.scheduled)}</div>}
          </>
        ) : (
          <div className="text-xs text-muted">{t("notToday")}</div>
        )}
      </div>
    </Link>
  );
}

function Nearby() {
  const { t } = useT();
  const stops = useStops();
  const { geo, request } = useGeolocation(false);
  const near = useMemo(() => (geo.status === "ok" && stops ? nearestStops(stops, geo.lat, geo.lon, 6, 1200) : []), [geo, stops]);

  return (
    <>
      <SectionTitle>{t("nearby")}</SectionTitle>
      {geo.status !== "ok" ? (
        <button onClick={request} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-card py-4 text-sm font-medium text-muted hover:text-fg">
          {geo.status === "loading" ? <Spinner /> : <IconLocate size={18} />}
          {geo.status === "error" ? geo.message : t("showNearby")}
        </button>
      ) : near.length === 0 ? (
        <EmptyState>{t("noStopsNearby")}</EmptyState>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {near.map(({ g, d }) => (
            <Link key={g.id} href={`/zastavka/${g.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-soft">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{g.name}</div>
                <div className="truncate text-xs text-muted">{g.lines.join(" · ")}</div>
              </div>
              <span className="shrink-0 text-sm text-muted tabular">{fmtDistance(d)}</span>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
