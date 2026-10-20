"use client";

import Link from "next/link";
import type { DepartureDTO } from "@/lib/api-types";
import { delayLevel, fmtTime } from "@/lib/client/format";
import { useT } from "@/lib/client/store";
import { IconWheelchair } from "./icons";
import { DelayBadge, LineBadge } from "./ui";

const COUNT_CLS = {
  none: "",
  ok: "text-green-600 dark:text-green-400",
  minor: "text-amber-600 dark:text-amber-400",
  major: "text-red-600 dark:text-red-400",
  early: "text-blue-600 dark:text-blue-400",
} as const;

export function DepartureRow({ d, now, showPlatform = true, groupId }: { d: DepartureDTO; now: number; showPlatform?: boolean; groupId?: string }) {
  const { t } = useT();
  const est = d.scheduled + (d.delay ?? 0);
  const mins = Math.round((est - now) / 60);
  const lvl = delayLevel(d.delay);
  const href = `/spoj/${encodeURIComponent(d.tripId)}?d=${d.date}${groupId ? `&s=${groupId}` : ""}`;
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-soft">
        <LineBadge route={d.route} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium">{d.headsign}</span>
            {d.wheelchair && <IconWheelchair size={14} className="shrink-0 text-muted" />}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="tabular">{fmtTime(d.scheduled)}</span>
            <DelayBadge delay={d.delay} compact />
            {showPlatform && d.platform && <span>{t("platform", { p: d.platform })}</span>}
            {d.onRequest && <span title={t("onRequest")}>×</span>}
          </div>
        </div>
        <div className={`shrink-0 text-right font-bold tabular ${d.delay != null ? COUNT_CLS[lvl] : ""}`}>
          {d.atStop ? (
            <span className="text-sm">{t("atStop")}</span>
          ) : mins <= 0 ? (
            <span className="text-sm">{t("now")}</span>
          ) : mins < 60 ? (
            <span className="text-lg">
              {mins}
              <span className="ml-0.5 text-xs font-medium">min</span>
            </span>
          ) : (
            <span className="text-base">{fmtTime(est)}</span>
          )}
        </div>
      </Link>
    </li>
  );
}

export function DepartureList({ departures, now, showPlatform, groupId }: { departures: DepartureDTO[]; now: number; showPlatform?: boolean; groupId?: string }) {
  return (
    <ul className="divide-y divide-line">
      {departures.map((d) => (
        <DepartureRow key={`${d.tripId}-${d.date}-${d.stopId}`} d={d} now={now} showPlatform={showPlatform} groupId={groupId} />
      ))}
    </ul>
  );
}
