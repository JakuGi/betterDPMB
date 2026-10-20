"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { AlertDTO, RouteDTO } from "@/lib/api-types";
import { delayLevel, fmtClock, fmtDelay, fmtTime, routeColors } from "@/lib/client/format";
import { useT } from "@/lib/client/store";
import { IconAlert, IconChevron, IconStar } from "./icons";

export function LineBadge({ route, size = "md", href }: { route: Pick<RouteDTO, "name" | "type" | "color" | "textColor">; size?: "sm" | "md" | "lg"; href?: string }) {
  const { bg, fg } = routeColors(route);
  const cls = {
    sm: "min-w-7 h-5 text-xs px-1",
    md: "min-w-9 h-7 text-sm px-1.5",
    lg: "min-w-12 h-10 text-lg px-2",
  }[size];
  const shape = route.type === 0 ? "rounded-md" : route.type === 11 ? "rounded-full" : "rounded";
  const el = (
    <span className={`inline-flex shrink-0 items-center justify-center font-bold tabular leading-none ${cls} ${shape}`} style={{ background: bg, color: fg }}>
      {route.name}
    </span>
  );
  return href ? <Link href={href}>{el}</Link> : el;
}

const DELAY_CLS = {
  none: "text-muted",
  ok: "text-green-600 dark:text-green-400",
  minor: "text-amber-600 dark:text-amber-400",
  major: "text-red-600 dark:text-red-400",
  early: "text-blue-600 dark:text-blue-400",
} as const;

export function DelayBadge({ delay, compact }: { delay: number | null; compact?: boolean }) {
  const { t } = useT();
  if (delay == null) return compact ? null : <span className="text-xs text-muted">{t("noLive")}</span>;
  const lvl = delayLevel(delay);
  const onTime = Math.round(delay / 60) === 0;
  const txt = fmtDelay(delay);
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold tabular ${DELAY_CLS[lvl]}`}>
      <span className="live-dot inline-block size-1.5 rounded-full bg-current" />
      {onTime ? t("onTime") : `${txt} min`}
    </span>
  );
}

/** Plánovaný čas, prípadne preškrtnutý s odhadom. */
export function TimeWithDelay({ scheduled, delay, className = "" }: { scheduled: number; delay: number | null; className?: string }) {
  const lvl = delayLevel(delay);
  const shifted = delay != null && Math.abs(delay) >= 60;
  return (
    <span className={`tabular ${className}`}>
      {shifted ? (
        <>
          <span className={`font-semibold ${DELAY_CLS[lvl]}`}>{fmtTime(scheduled + delay!)}</span>{" "}
          <span className="text-xs text-muted line-through">{fmtTime(scheduled)}</span>
        </>
      ) : (
        <span className="font-semibold">{fmtTime(scheduled)}</span>
      )}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-card shadow-sm ${className}`}>{children}</section>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between px-1">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function StarButton({ active, onClick, label }: { active: boolean; onClick: () => void; label?: string }) {
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={active ? t("removeFav") : t("addFav")}
      className={`inline-flex items-center gap-1.5 rounded-full p-2 transition hover:bg-soft ${active ? "text-amber-500" : "text-muted"}`}
    >
      <IconStar filled={active} size={22} />
      {label && <span className="text-sm">{label}</span>}
    </button>
  );
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1 text-sm transition ${
        active ? "border-transparent bg-fg text-bg" : "border-line bg-card hover:bg-soft"
      }`}
    >
      {children}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-muted">{children}</div>;
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{children}</div>;
}

export function AlertList({ alerts, compact }: { alerts: AlertDTO[]; compact?: boolean }) {
  const { t } = useT();
  if (!alerts.length) return null;
  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <details key={a.id} className="group rounded-xl border border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100">
          <summary className="flex cursor-pointer list-none items-start gap-2 p-3 text-sm">
            <IconAlert size={18} className="mt-0.5 shrink-0" />
            <span className="flex-1">
              <span className="font-semibold">{a.header || t("disruption")}</span>
              {a.lines.length > 0 && <span className="ml-1 opacity-80">· {t("linesList", { lines: a.lines.join(", ") })}</span>}
              {!compact && <span className="block opacity-80 line-clamp-1 group-open:hidden">{a.description.split("\n")[0]}</span>}
            </span>
            <IconChevron dir="down" size={16} className="mt-0.5 shrink-0 transition group-open:rotate-180" />
          </summary>
          <div className="whitespace-pre-line px-3 pb-3 text-sm opacity-90">
            {a.description}
            {a.url && (
              <a href={a.url} target="_blank" rel="noreferrer" className="mt-2 block underline">
                {t("moreOnIds")}
              </a>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

export function UpdatedAt({ at, loading, onRefresh }: { at: number | null; loading?: boolean; onRefresh?: () => void }) {
  const { t } = useT();
  return (
    <button type="button" onClick={onRefresh} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg">
      {loading ? <Spinner className="size-3" /> : <span className="live-dot inline-block size-2 rounded-full bg-green-500" />}
      {at ? t("updatedAt", { time: fmtClock(at) }) : t("loading")}
    </button>
  );
}
