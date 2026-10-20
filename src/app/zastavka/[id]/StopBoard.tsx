"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DepartureList } from "@/components/DepartureList";
import { IconClock, IconMap, IconRoute } from "@/components/icons";
import { AlertList, Card, Chip, EmptyState, ErrorBox, StarButton, UpdatedAt } from "@/components/ui";
import type { DeparturesResponse } from "@/lib/api-types";
import { useNow, usePolling } from "@/lib/client/hooks";
import { setFavStopLines, toggleFavStop, useStore, useT } from "@/lib/client/store";

export function StopBoard({ id }: { id: string }) {
  const store = useStore();
  const { t } = useT();
  const now = useNow(10_000);
  const [lines, setLines] = useState<string[]>([]);
  const [platform, setPlatform] = useState<string | null>(null);
  const [at, setAt] = useState<string>("");
  const atEpoch = at ? Math.floor(new Date(at).getTime() / 1000) : null;
  const url = `/api/departures?group=${encodeURIComponent(id)}&limit=80${atEpoch ? `&at=${atEpoch}` : ""}`;
  const { data, error, loading, updatedAt, reload } = usePolling<DeparturesResponse>(url, atEpoch ? 0 : 20_000);
  const fav = store.stops.find((s) => s.id === id);

  useEffect(() => {
    if (data) document.title = `${data.group.name} · LepšieDPMB`;
  }, [data]);

  const allLines = useMemo(() => {
    const m = new Map<string, DeparturesResponse["departures"][number]["route"]>();
    data?.departures.forEach((d) => m.set(d.route.name, d.route));
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "cs", { numeric: true }));
  }, [data]);

  const platforms = useMemo(() => {
    const s = new Set(data?.departures.map((d) => d.platform).filter(Boolean));
    return [...s].sort((a, b) => a.localeCompare(b, "cs", { numeric: true }));
  }, [data]);

  const filtered = useMemo(
    () => (data?.departures ?? []).filter((d) => (!lines.length || lines.includes(d.route.name)) && (!platform || d.platform === platform)),
    [data, lines, platform],
  );

  const toggleLine = (name: string) => setLines((l) => (l.includes(name) ? l.filter((x) => x !== name) : [...l, name]));

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold leading-tight">{data?.group.name ?? " "}</h1>
          <div className="mt-1 flex flex-wrap gap-3 text-sm">
            <Link href={`/spojenie?from=${encodeURIComponent(`${id}|${data?.group.name ?? ""}`)}`} className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400">
              <IconRoute size={16} /> {t("planFromHere")}
            </Link>
            {data && (
              <Link href={`/mapa?lat=${data.group.lat}&lon=${data.group.lon}&z=17`} className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400">
                <IconMap size={16} /> {t("onMap")}
              </Link>
            )}
          </div>
        </div>
        {data && <StarButton active={!!fav} onClick={() => toggleFavStop(id, data.group.name)} />}
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}
      {data && <AlertList alerts={data.alerts} />}

      {fav && allLines.length > 1 && (
        <Card className="p-3">
          <div className="mb-2 text-xs font-medium text-muted">{t("favLinesHint")}</div>
          <div className="flex flex-wrap gap-1.5">
            {allLines.map((r) => (
              <Chip
                key={r.name}
                active={fav.lines.includes(r.name)}
                onClick={() => setFavStopLines(id, fav.lines.includes(r.name) ? fav.lines.filter((x) => x !== r.name) : [...fav.lines, r.name])}
              >
                {r.name}
              </Chip>
            ))}
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {allLines.length > 1 && (
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
            <Chip active={!lines.length} onClick={() => setLines([])}>
              {t("all")}
            </Chip>
            {allLines.map((r) => (
              <Chip key={r.name} active={lines.includes(r.name)} onClick={() => toggleLine(r.name)}>
                {r.name}
              </Chip>
            ))}
          </div>
        )}
        {platforms.length > 1 && (
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
            <Chip active={!platform} onClick={() => setPlatform(null)}>
              {t("allPlatforms")}
            </Chip>
            {platforms.map((p) => (
              <Chip key={p} active={platform === p} onClick={() => setPlatform(platform === p ? null : p)}>
                {t("platform", { p })}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-sm text-muted">
          <IconClock size={16} />
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="h-8 rounded-lg border border-line bg-soft px-2" />
          {at && (
            <button className="underline" onClick={() => setAt("")}>
              {t("now")}
            </button>
          )}
        </label>
        <UpdatedAt at={updatedAt} loading={loading} onRefresh={reload} />
      </div>

      <Card className="overflow-hidden">
        {!data && loading && <div className="h-64 animate-pulse" />}
        {data && filtered.length === 0 && <EmptyState>{t("nothingSoon")}</EmptyState>}
        {data && <DepartureList departures={filtered} now={atEpoch ?? now} showPlatform={!platform} groupId={id} />}
      </Card>
      {data && !data.realtimeOk && <p className="text-xs text-muted">{t("rtUnavailable")}</p>}
    </div>
  );
}
