"use client";

import { useMemo, useState } from "react";
import { IconSearch } from "@/components/icons";
import { AlertList, Chip, EmptyState, ErrorBox, Spinner } from "@/components/ui";
import type { AlertDTO } from "@/lib/api-types";
import { normalize } from "@/lib/client/format";
import { usePolling } from "@/lib/client/hooks";
import { useStore, useT } from "@/lib/client/store";

export default function AlertsPage() {
  const store = useStore();
  const { t } = useT();
  const { data, error, loading } = usePolling<AlertDTO[]>("/api/alerts", 60_000);
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(false);

  const myLines = useMemo(() => new Set(store.lines.map((l) => l.name)), [store.lines]);
  const myStops = useMemo(() => new Set(store.stops.map((s) => s.id)), [store.stops]);
  const hasMine = myLines.size + myStops.size > 0;

  const list = useMemo(() => {
    const nq = normalize(q.trim());
    return (data ?? []).filter((a) => {
      if (mine && !a.lines.some((l) => myLines.has(l)) && !a.stops.some((s) => myStops.has(s))) return false;
      if (!nq) return true;
      return normalize(`${a.header} ${a.description}`).includes(nq) || a.lines.some((l) => normalize(l) === nq);
    });
  }, [data, q, mine, myLines, myStops]);

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">{t("alertsTitle")}</h1>
      <label className="flex items-center gap-2 rounded-xl border border-line bg-card px-3 shadow-sm">
        <IconSearch size={18} className="text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("alertsSearch")} className="h-12 flex-1 bg-transparent outline-none placeholder:text-muted" />
        {loading && <Spinner className="text-muted" />}
      </label>
      {hasMine && (
        <Chip active={mine} onClick={() => setMine(!mine)}>
          {t("onlyMine")}
        </Chip>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}
      {data && list.length === 0 && <EmptyState>{mine ? t("noAlertsMine") : t("noAlerts")}</EmptyState>}
      <AlertList alerts={list} />
      <p className="pt-2 text-xs text-muted">{t("alertsSource")}</p>
    </div>
  );
}
