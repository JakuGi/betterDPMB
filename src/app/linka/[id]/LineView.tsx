"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { IconMap } from "@/components/icons";
import { AlertList, Card, Chip, DelayBadge, ErrorBox, LineBadge, StarButton, UpdatedAt } from "@/components/ui";
import type { LineDTO } from "@/lib/api-types";
import { distanceM, routeTypeLabel } from "@/lib/client/format";
import { usePolling } from "@/lib/client/hooks";
import { toggleFavLine, useStore, useT } from "@/lib/client/store";

export function LineView({ id }: { id: string }) {
  const store = useStore();
  const { t } = useT();
  const { data, error, loading, updatedAt, reload } = usePolling<LineDTO>(`/api/line/${encodeURIComponent(id)}`, 20_000);
  const [dir, setDir] = useState(0);

  useEffect(() => {
    if (data) document.title = `Linka ${data.route.name} · LepšieDPMB`;
  }, [data]);

  const direction = data?.directions[dir];

  // vozidlá priradíme k najbližšej zastávke vybraného smeru (podľa cieľovej zastávky)
  const vehiclesByStop = useMemo(() => {
    const m = new Map<number, LineDTO["vehicles"]>();
    if (!data || !direction) return m;
    for (const v of data.vehicles) {
      if (v.headsign !== direction.headsign && data.directions.length > 1) {
        const other = data.directions.find((d) => d.headsign === v.headsign);
        if (other && other !== direction) continue;
      }
      let best = -1;
      let bestD = Infinity;
      direction.stops.forEach((s, i) => {
        const d = distanceM(v.lat, v.lon, s.lat, s.lon);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best >= 0 && bestD < 1500) m.set(best, [...(m.get(best) ?? []), v]);
    }
    return m;
  }, [data, direction]);

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <div className="h-96 animate-pulse rounded-2xl bg-card" />;

  const fav = store.lines.some((l) => l.id === data.route.id);
  const delays = data.vehicles.filter((v) => v.delay != null).map((v) => v.delay!);
  const avg = delays.length ? delays.reduce((a, b) => a + Math.max(0, b), 0) / delays.length : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <LineBadge route={data.route} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold leading-tight">{data.route.long}</h1>
          <div className="text-sm text-muted">{routeTypeLabel(data.route.type)}</div>
        </div>
        <StarButton active={fav} onClick={() => toggleFavLine({ id: data.route.id, name: data.route.name, type: data.route.type })} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/mapa?line=${encodeURIComponent(data.route.name)}`} className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2 text-sm font-medium hover:bg-soft">
          <IconMap size={16} /> {t("vehiclesOnMap")}
        </Link>
        <span className="text-sm text-muted">
          {t("inService", { n: data.vehicles.length })}
          {avg != null && <> · {t("avgDelay", { m: (avg / 60).toFixed(1) })}</>}
        </span>
        <span className="ml-auto">
          <UpdatedAt at={updatedAt} loading={loading} onRefresh={reload} />
        </span>
      </div>

      <AlertList alerts={data.alerts} />

      {data.directions.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {data.directions.map((d, i) => (
            <Chip key={i} active={dir === i} onClick={() => setDir(i)}>
              → {d.headsign}
            </Chip>
          ))}
        </div>
      )}

      {direction && (
        <Card className="py-2">
          <ol>
            {direction.stops.map((s, i) => {
              const vs = vehiclesByStop.get(i) ?? [];
              return (
                <li key={i} className="flex items-center gap-3 px-4 py-1">
                  <span className="relative flex w-4 justify-center self-stretch">
                    <span className="absolute inset-y-0 w-1 rounded-full bg-line" />
                    <span className="relative z-10 my-auto size-3 rounded-full border-[3px] border-fg/60 bg-card" />
                  </span>
                  <Link href={`/zastavka/${s.groupId}`} className="min-w-0 flex-1 truncate py-1 hover:underline">
                    {s.name}
                  </Link>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {vs.map((v) => (
                      <Link key={v.id} href={`/spoj/${encodeURIComponent(v.tripId)}${v.date ? `?d=${v.date}` : ""}`} className="inline-flex items-center gap-1 rounded-full bg-soft px-2 py-0.5 text-xs">
                        <span className="tabular text-muted">#{v.label}</span> <DelayBadge delay={v.delay} compact />
                      </Link>
                    ))}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
    </div>
  );
}
