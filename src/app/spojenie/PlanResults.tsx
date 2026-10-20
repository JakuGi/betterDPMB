"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { JourneyCard } from "@/components/JourneyCard";
import { buildTrasaUrl, PlannerForm, setPlannerDraft } from "@/components/PlannerForm";
import { IconChevron, IconMap, IconRefresh } from "@/components/icons";
import { EmptyState, ErrorBox, Spinner, StarButton, UpdatedAt } from "@/components/ui";
import type { JourneyDTO, PlanResponse } from "@/lib/api-types";
import { fmtDate, fmtTime } from "@/lib/client/format";
import { useGeolocation, useNow, usePolling } from "@/lib/client/hooks";
import { addHistory, findFavRoute, paramToPlace, placeToParam, toggleFavRoute, updateSettings, useStore, useT } from "@/lib/client/store";

export function PlanResults({ fromParam, toParam, tParam, fromMap = false }: { fromParam: string | null; toParam: string | null; tParam: number | null; fromMap?: boolean }) {
  const store = useStore();
  const { t } = useT();
  const now = useNow(15_000);
  const from = useMemo(() => paramToPlace(fromParam), [fromParam]);
  const to = useMemo(() => paramToPlace(toParam), [toParam]);
  const needsGeo = from?.kind === "here" || to?.kind === "here";
  const { geo, request } = useGeolocation(needsGeo);
  const [editing, setEditing] = useState(false);
  const [later, setLater] = useState<JourneyDTO[]>([]);
  const [loadingLater, setLoadingLater] = useState(false);
  const [startT, setStartT] = useState<number | null>(tParam);

  // každé vyhľadanie zapíšeme do histórie (zoznam otvorený zo záložky Trasa už má záznam z mapy)
  // a necháme ho vo formulári na úvodnej stránke, aby sa po návrate dalo upraviť
  useEffect(() => {
    if (!from || !to || fromMap) return;
    addHistory(from, to);
    setPlannerDraft({ from, to });
  }, [from, to, fromMap]);

  const here = geo.status === "ok" ? { lat: geo.lat, lon: geo.lon } : null;
  const fromQ = from ? placeToParam(from, here) : null;
  const toQ = to ? placeToParam(to, here) : null;

  const apiUrl = useMemo(() => {
    if (!fromQ || !toQ) return null;
    const qs = new URLSearchParams({ from: fromQ, to: toQ, maxTransfers: String(store.settings.maxTransfers) });
    if (startT) qs.set("t", String(startT));
    if (store.settings.wheelchair) qs.set("wheelchair", "1");
    if (!store.settings.walking) qs.set("walk", "0");
    return `/api/plan?${qs}`;
  }, [fromQ, toQ, startT, store.settings.maxTransfers, store.settings.wheelchair, store.settings.walking]);

  const { data, error, loading, updatedAt, reload } = usePolling<PlanResponse>(apiUrl, 30_000);

  useEffect(() => setLater([]), [apiUrl]);

  const journeys = useMemo(() => {
    const seen = new Set<string>();
    return [...(data?.journeys ?? []), ...later].filter((j) => (seen.has(j.id) ? false : (seen.add(j.id), true)));
  }, [data, later]);

  const loadLater = async () => {
    if (!fromQ || !toQ || !journeys.length) return;
    setLoadingLater(true);
    try {
      const qs = new URLSearchParams({ from: fromQ, to: toQ, t: String(journeys[journeys.length - 1].dep + 60), maxTransfers: String(store.settings.maxTransfers) });
      if (store.settings.wheelchair) qs.set("wheelchair", "1");
      if (!store.settings.walking) qs.set("walk", "0");
      const res: PlanResponse = await fetch(`/api/plan?${qs}`).then((r) => r.json());
      setLater((l) => [...l, ...res.journeys]);
    } finally {
      setLoadingLater(false);
    }
  };

  const mapUrl = (journeyId?: string) => (fromQ && toQ ? buildTrasaUrl(fromQ, toQ, startT, journeyId) : undefined);

  if (!from || !to) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">{t("planTitle")}</h1>
        <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
          <PlannerForm initialFrom={from} initialTo={to} />
        </div>
      </div>
    );
  }

  const fav = findFavRoute(store, from, to);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
        {editing ? (
          <PlannerForm initialFrom={from} initialTo={to} initialTime={tParam} />
        ) : (
          <div className="flex items-start gap-2">
            <button type="button" onClick={() => setEditing(true)} className="min-w-0 flex-1 text-left">
              <div className="truncate text-lg font-bold">{from.kind === "here" ? t("myLocation") : from.name}</div>
              <div className="truncate text-lg font-bold">
                <span className="text-muted">→</span> {to.kind === "here" ? t("myLocation") : to.name}
              </div>
              <div className="mt-1 text-sm text-muted">
                {startT ? t("departFrom", { when: `${fmtDate(startT)} ${fmtTime(startT)}` }) : t("departNow")}
                {!store.settings.walking && ` · ${t("noWalking")}`}
                {store.settings.wheelchair && ` · ${t("stepFree")}`} · <span className="underline">{t("editLink")}</span>
              </div>
            </button>
            <StarButton active={!!fav} onClick={() => toggleFavRoute(from, to)} />
          </div>
        )}
      </div>

      {needsGeo && geo.status === "loading" && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> {t("locating")}
        </div>
      )}
      {needsGeo && geo.status === "error" && (
        <ErrorBox>
          {geo.message}.{" "}
          <button className="underline" onClick={request}>
            {t("retry")}
          </button>
        </ErrorBox>
      )}
      {error && <ErrorBox>{t("planFailed", { e: error })}</ErrorBox>}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStartT((startT ?? Math.floor(Date.now() / 1000)) - 30 * 60)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted hover:bg-soft hover:text-fg"
        >
          <IconChevron dir="up" size={16} /> {t("earlier")}
        </button>
        <div className="flex items-center gap-3">
          {mapUrl() && (
            <Link href={mapUrl()!} className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1 text-sm font-medium hover:bg-soft">
              <IconMap size={16} /> {t("onMap")}
            </Link>
          )}
          <UpdatedAt at={updatedAt} loading={loading} onRefresh={reload} />
        </div>
      </div>

      {!data && loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      )}

      {data && journeys.length === 0 && (
        <EmptyState>
          {t("noJourneys")}
          {!store.settings.walking && (
            <>
              <br />
              <button className="mt-2 underline" onClick={() => updateSettings({ walking: true })}>
                {t("allowWalking")}
              </button>
            </>
          )}
          <br />
          <button className="mt-3 inline-flex items-center gap-1 underline" onClick={reload}>
            <IconRefresh size={14} /> {t("retry")}
          </button>
        </EmptyState>
      )}

      <div className="space-y-3">
        {journeys.map((j, i) => (
          <JourneyCard key={j.id} j={j} now={now} defaultOpen={i === 0} mapHref={mapUrl(j.id)} />
        ))}
      </div>

      {journeys.length > 0 && (
        <button
          type="button"
          onClick={loadLater}
          disabled={loadingLater}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-card py-3 text-sm font-medium hover:bg-soft"
        >
          {loadingLater ? <Spinner /> : <IconChevron dir="down" size={16} />} {t("later")}
        </button>
      )}
    </div>
  );
}
