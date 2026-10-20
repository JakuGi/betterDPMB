"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { IconLocate, IconSearch, IconStar } from "@/components/icons";
import { Card, EmptyState, SectionTitle, Spinner } from "@/components/ui";
import { fmtDistance } from "@/lib/client/format";
import { nearestStops, searchStops, useGeolocation, useStops } from "@/lib/client/hooks";
import { toggleFavStop, useStore, useT } from "@/lib/client/store";

export default function StopsPage() {
  const stops = useStops();
  const store = useStore();
  const { t } = useT();
  const [q, setQ] = useState("");
  const { geo, request } = useGeolocation(false);
  const results = useMemo(() => (stops && q.trim() ? searchStops(stops, q, 30) : []), [stops, q]);
  const near = useMemo(() => (geo.status === "ok" && stops ? nearestStops(stops, geo.lat, geo.lon, 15, 1500) : []), [geo, stops]);
  const favIds = new Set(store.stops.map((s) => s.id));

  const Row = ({ id, name, lines, extra }: { id: string; name: string; lines: string[]; extra?: string }) => (
    <div className="flex items-center gap-2 pr-2">
      <Link href={`/zastavka/${id}`} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 hover:bg-soft">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{name}</div>
          <div className="truncate text-xs text-muted">{lines.join(" · ")}</div>
        </div>
        {extra && <span className="shrink-0 text-sm text-muted tabular">{extra}</span>}
      </Link>
      <button onClick={() => toggleFavStop(id, name)} className={`rounded-full p-2 ${favIds.has(id) ? "text-amber-500" : "text-muted"}`} aria-label={t("favourites")}>
        <IconStar size={18} filled={favIds.has(id)} />
      </button>
    </div>
  );

  return (
    <div>
      <h1 className="mb-3 text-2xl font-bold">{t("stopsTitle")}</h1>
      <label className="flex items-center gap-2 rounded-xl border border-line bg-card px-3 shadow-sm">
        <IconSearch size={18} className="text-muted" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchStop")} className="h-12 flex-1 bg-transparent text-base outline-none placeholder:text-muted" />
        {!stops && <Spinner className="text-muted" />}
      </label>

      {q.trim() ? (
        <Card className="mt-3 divide-y divide-line overflow-hidden">
          {results.length === 0 && stops && <EmptyState>{t("nothingFound")}</EmptyState>}
          {results.map((g) => (
            <Row key={g.id} id={g.id} name={g.name} lines={g.lines} extra={g.zone === "100" || g.zone === "101" ? undefined : t("zone", { z: g.zone })} />
          ))}
        </Card>
      ) : (
        <>
          {store.stops.length > 0 && (
            <>
              <SectionTitle>{t("favourites")}</SectionTitle>
              <Card className="divide-y divide-line overflow-hidden">
                {store.stops.map((s) => {
                  const g = stops?.find((x) => x.id === s.id);
                  return <Row key={s.id} id={s.id} name={s.name} lines={g?.lines ?? []} />;
                })}
              </Card>
            </>
          )}
          <SectionTitle>{t("nearby")}</SectionTitle>
          {geo.status !== "ok" ? (
            <button onClick={request} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-card py-4 text-sm font-medium text-muted hover:text-fg">
              {geo.status === "loading" ? <Spinner /> : <IconLocate size={18} />}
              {geo.status === "error" ? geo.message : t("findNearby")}
            </button>
          ) : (
            <Card className="divide-y divide-line overflow-hidden">
              {near.length === 0 && <EmptyState>{t("noNearby")}</EmptyState>}
              {near.map(({ g, d }) => (
                <Row key={g.id} id={g.id} name={g.name} lines={g.lines} extra={fmtDistance(d)} />
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
