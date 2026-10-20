"use client";

import Link from "next/link";
import { useState } from "react";
import type { JourneyDTO, RideLegDTO } from "@/lib/api-types";
import { fmtCountdown, fmtDistance, fmtDuration, fmtTime } from "@/lib/client/format";
import { useT } from "@/lib/client/store";
import { IconChevron, IconMap, IconWalk, IconWheelchair } from "./icons";
import { DelayBadge, LineBadge, TimeWithDelay } from "./ui";

export function JourneyCard({
  j,
  now,
  defaultOpen = false,
  selected = false,
  onSelect,
  mapHref,
}: {
  j: JourneyDTO;
  now: number;
  defaultOpen?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  /** odkaz na zobrazenie spojenia v záložke Trasa */
  mapHref?: string;
}) {
  const { t, tn } = useT();
  const [open, setOpen] = useState(defaultOpen);
  const rides = j.legs.filter((l): l is RideLegDTO => l.type === "ride");
  const first = rides[0];
  const firstDelay = first?.delay ?? 0;
  const lastRide = rides[rides.length - 1];
  const endDelay = lastRide?.delay != null && lastRide.delay > 0 ? lastRide.delay : 0;
  const leaveAt = j.dep + Math.max(0, firstDelay);
  const missed = leaveAt < now - 30;

  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-card shadow-sm ${selected ? "border-blue-500 ring-2 ring-blue-500/30" : "border-line"} ${missed ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        onClick={() => {
          // prvý klik na nevybratú kartu ju len vyberie (zobrazí na mape)
          if (onSelect && !selected) {
            onSelect();
            setOpen(true);
          } else setOpen(!open);
        }}
        className="block w-full p-4 text-left"
        aria-expanded={open}
      >
        <div className="flex items-baseline gap-3">
          <span className="text-xl font-bold tabular">
            {fmtTime(j.dep)} – {fmtTime(j.arr + endDelay)}
          </span>
          <span className="text-sm text-muted">{fmtDuration(j.arr - j.dep)}</span>
          <span className={`ml-auto text-sm font-semibold tabular ${leaveAt - now < 300 ? "text-brand" : ""}`}>
            {missed ? t("missed") : leaveAt - now < 30 ? t("now") : t("inTime", { t: fmtCountdown(leaveAt, now) })}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {j.legs.map((l, i) =>
            l.type === "ride" ? (
              <span key={i} className="inline-flex items-center gap-1">
                {i > 0 && <IconChevron size={14} className="text-muted" />}
                <LineBadge route={l.route} size="sm" />
              </span>
            ) : (
              (l.arr - l.dep >= 120 || i === 0 || i === j.legs.length - 1) && (
                <span key={i} className="inline-flex items-center gap-0.5 text-xs text-muted">
                  {i > 0 && <IconChevron size={14} />}
                  <IconWalk size={14} />
                  {Math.round((l.arr - l.dep) / 60)}
                </span>
              )
            ),
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {first && (
            <span>
              {t("fromStop")} <b className="font-medium text-fg">{first.from.name}</b>
              {first.from.platform && <> · {t("platform", { p: first.from.platform })}</>}
            </span>
          )}
          <span>{j.transfers === 0 ? t("direct") : tn("transfers", j.transfers)}</span>
          {j.walk >= 60 && <span>{t("walkMin", { n: Math.round(j.walk / 60) })}</span>}
          {first && <DelayBadge delay={first.delay} compact />}
        </div>
      </button>

      {open && (
        <ol className="border-t border-line px-4 py-3">
          {j.legs.map((l, i) =>
            l.type === "walk" ? (
              <li key={i} className="flex items-center gap-3 py-2 text-sm text-muted">
                <span className="grid w-12 place-items-center">
                  <IconWalk size={18} />
                </span>
                <span>
                  {l.from.groupId && l.from.groupId === l.to.groupId ? t("changePlatform", { p: l.to.platform ?? "" }) : t("walkTo", { name: l.to.name })} · {Math.max(1, Math.round((l.arr - l.dep) / 60))} min
                  {l.distance > 30 && <> · {fmtDistance(l.distance)}</>}
                </span>
              </li>
            ) : (
              <RideLeg key={i} leg={l} />
            ),
          )}
          {mapHref && (
            <li className="pt-2">
              <Link href={mapHref} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-soft">
                <IconMap size={16} /> {t("showOnMap")}
              </Link>
            </li>
          )}
        </ol>
      )}
    </article>
  );
}

function RideLeg({ leg }: { leg: RideLegDTO }) {
  const { t, tn } = useT();
  const [showStops, setShowStops] = useState(false);
  const mid = leg.stops.slice(1, -1);
  const delay = leg.delay;
  return (
    <li className="relative py-2">
      <div className="flex gap-3">
        <div className="flex w-12 flex-col items-center">
          <LineBadge route={leg.route} href={`/linka/${encodeURIComponent(leg.route.id)}`} />
          <span className="mt-1 w-1 flex-1 rounded-full" style={{ background: leg.route.color ? `#${leg.route.color}` : "var(--line)" }} />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-baseline gap-2">
            <TimeWithDelay scheduled={leg.dep} delay={delay} />
            <Link href={`/zastavka/${leg.from.groupId}`} className="truncate font-medium hover:underline">
              {leg.from.name}
            </Link>
            {leg.from.platform && <span className="shrink-0 rounded bg-soft px-1.5 text-xs text-muted">{t("platform", { p: leg.from.platform })}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            <span>{t("direction", { h: leg.headsign })}</span>
            {leg.wheelchair && <IconWheelchair size={14} />}
            <DelayBadge delay={delay} />
            {leg.vehicle && <span className="text-xs">{t("vehicleShort", { v: leg.vehicle })}</span>}
          </div>
          <div className="flex gap-3 text-xs">
            {mid.length > 0 && (
              <button type="button" onClick={() => setShowStops(!showStops)} className="text-muted underline-offset-2 hover:underline">
                {showStops ? t("hide") : tn("stops", mid.length)} · {fmtDuration(leg.arr - leg.dep)}
              </button>
            )}
            <Link href={`/spoj/${encodeURIComponent(leg.tripId)}?d=${leg.date}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
              {t("trackTrip")}
            </Link>
          </div>
          {showStops && (
            <ul className="space-y-0.5 py-1 text-sm">
              {mid.map((s, i) => (
                <li key={i} className="flex gap-2 text-muted">
                  <span className="w-11 tabular">{fmtTime(s.time + (delay != null && delay > 0 ? delay : 0))}</span>
                  <span className="truncate">{s.name}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-baseline gap-2 pt-1">
            <TimeWithDelay scheduled={leg.arr} delay={delay != null && delay > 0 ? delay : null} />
            <Link href={`/zastavka/${leg.to.groupId}`} className="truncate font-medium hover:underline">
              {leg.to.name}
            </Link>
            {leg.to.platform && <span className="shrink-0 rounded bg-soft px-1.5 text-xs text-muted">{t("platform", { p: leg.to.platform })}</span>}
          </div>
        </div>
      </div>
    </li>
  );
}
