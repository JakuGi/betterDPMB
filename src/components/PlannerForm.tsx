"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { addRecent, placeToParam, updateSettings, useStore, useT, type Place } from "@/lib/client/store";
import { IconClock, IconMap, IconSwap, IconWalk, IconWheelchair } from "./icons";
import { PlaceInput } from "./PlaceInput";

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------- rozpracované vyhľadávanie ----------
// Zastávky vo formulári na úvodnej stránke ostanú aj po návrate z výsledkov (počas relácie).

type Draft = { from: Place | null; to: Place | null };
const DRAFT_KEY = "lepsieDPMB:plannerDraft";
const EMPTY_DRAFT: Draft = { from: null, to: null };
let draft: Draft | null = null;
const draftListeners = new Set<() => void>();

function getDraft(): Draft {
  if (draft) return draft;
  let d = EMPTY_DRAFT;
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw) d = { ...EMPTY_DRAFT, ...JSON.parse(raw) };
  } catch {
    /* nedostupné úložisko */
  }
  return (draft = d);
}

/** Vyplní formulár na úvodnej stránke (bez vyhľadania). */
export function setPlannerDraft(patch: Partial<Draft>) {
  draft = { ...getDraft(), ...patch };
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* nedostupné úložisko */
  }
  draftListeners.forEach((l) => l());
}

function subscribeDraft(cb: () => void) {
  draftListeners.add(cb);
  return () => draftListeners.delete(cb);
}

export function buildPlanUrl(from: Place, to: Place, t?: number | null) {
  const qs = new URLSearchParams();
  qs.set("from", from.kind === "here" ? "here" : placeToParam(from)!);
  qs.set("to", to.kind === "here" ? "here" : placeToParam(to)!);
  if (t) qs.set("t", String(t));
  return `/spojenie?${qs.toString()}`;
}

/** Odkaz do záložky Trasa (mapa) – miesta v rovnakom formáte ako /spojenie. */
export function buildTrasaUrl(from: Place | string, to: Place | string, t?: number | null, journeyId?: string) {
  const p = (x: Place | string) => (typeof x === "string" ? x : x.kind === "here" ? "here" : placeToParam(x)!);
  const qs = new URLSearchParams({ from: p(from), to: p(to) });
  if (t) qs.set("t", String(t));
  if (journeyId) qs.set("j", journeyId);
  return `/trasa?${qs.toString()}`;
}

/** `persist` = zastávky sa pamätajú (úvodná stránka) a dajú sa vyplniť zvonka cez setPlannerDraft. */
export function PlannerForm({
  initialFrom = null,
  initialTo = null,
  initialTime = null,
  compact = false,
  persist = false,
}: {
  initialFrom?: Place | null;
  initialTo?: Place | null;
  initialTime?: number | null;
  compact?: boolean;
  persist?: boolean;
}) {
  const router = useRouter();
  const store = useStore();
  const { t } = useT();
  const saved = useSyncExternalStore(subscribeDraft, getDraft, () => EMPTY_DRAFT);
  const [localFrom, setLocalFrom] = useState<Place | null>(initialFrom);
  const [localTo, setLocalTo] = useState<Place | null>(initialTo);
  const from = persist ? saved.from : localFrom;
  const to = persist ? saved.to : localTo;
  const setFrom = (p: Place | null) => (persist ? setPlannerDraft({ from: p }) : setLocalFrom(p));
  const setTo = (p: Place | null) => (persist ? setPlannerDraft({ to: p }) : setLocalTo(p));
  const [timeMode, setTimeMode] = useState<"now" | "at">(initialTime ? "at" : "now");
  const [at, setAt] = useState(() => toLocalInput(initialTime ? new Date(initialTime * 1000) : new Date()));
  const [error, setError] = useState<string | null>(null);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!from || !to) {
      setError(!from ? t("errFrom") : t("errTo"));
      return;
    }
    if (from.kind !== "here" && to.kind !== "here" && placeToParam(from) === placeToParam(to)) {
      setError(t("errSame"));
      return;
    }
    setError(null);
    addRecent(from);
    addRecent(to);
    const when = timeMode === "at" ? Math.floor(new Date(at).getTime() / 1000) : null;
    router.push(buildPlanUrl(from, to, when));
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="relative space-y-2">
        <PlaceInput label={t("from_short")} value={from} onChange={setFrom} placeholder={t("fromPlaceholder")} />
        <PlaceInput label={t("to_short")} value={to} onChange={setTo} placeholder={t("toPlaceholder")} />
        <button
          type="button"
          onClick={() => {
            if (persist) setPlannerDraft({ from: to, to: from });
            else {
              setLocalFrom(to);
              setLocalTo(from);
            }
          }}
          className="absolute right-12 top-1/2 z-10 -translate-y-1/2 rounded-full border border-line bg-card p-2 text-muted shadow-sm hover:text-fg"
          aria-label={t("swap")}
        >
          <IconSwap size={18} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <div className="inline-flex rounded-xl border border-line bg-soft p-0.5 text-sm">
          <button type="button" onClick={() => setTimeMode("now")} className={`rounded-lg px-3 py-1.5 ${timeMode === "now" ? "bg-card font-semibold shadow-sm" : "text-muted"}`}>
            {t("leaveNow")}
          </button>
          <button type="button" onClick={() => setTimeMode("at")} className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 ${timeMode === "at" ? "bg-card font-semibold shadow-sm" : "text-muted"}`}>
            <IconClock size={14} /> {t("departAt")}
          </button>
        </div>
        {timeMode === "at" && (
          <input
            type="datetime-local"
            value={at}
            onChange={(e) => setAt(e.target.value)}
            className="h-9 rounded-xl border border-line bg-soft px-2 text-sm"
          />
        )}
        {!compact && (
          <>
            <button
              type="button"
              onClick={() => updateSettings({ wheelchair: !store.settings.wheelchair })}
              className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-sm ${store.settings.wheelchair ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "border-line text-muted"}`}
              title={t("wheelchairTitle")}
            >
              <IconWheelchair size={16} /> {t("wheelchair")}
            </button>
            <button
              type="button"
              onClick={() => updateSettings({ walking: !store.settings.walking })}
              className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-sm ${store.settings.walking ? "border-line text-muted" : "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"}`}
              title={t("walkTitle")}
              aria-pressed={!store.settings.walking}
            >
              <IconWalk size={16} className={store.settings.walking ? "" : "opacity-50"} />
              {store.settings.walking ? t("walkOn") : t("walkOff")}
            </button>
            <select
              value={store.settings.maxTransfers}
              onChange={(e) => updateSettings({ maxTransfers: Number(e.target.value) })}
              className="h-9 rounded-xl border border-line bg-soft px-2 text-sm text-muted"
              title={t("maxTransfersTitle")}
            >
              <option value={0}>{t("tr0")}</option>
              <option value={1}>{t("tr1")}</option>
              <option value={2}>{t("tr2")}</option>
              <option value={4}>{t("trAny")}</option>
            </select>
          </>
        )}
        <button type="submit" className="ml-auto h-10 rounded-xl bg-brand px-5 font-semibold text-white shadow-sm transition hover:bg-brand-dark">
          {t("search")}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Link href="/trasa" className="inline-flex items-center gap-1.5 pt-1 text-sm text-blue-600 hover:underline dark:text-blue-400">
        <IconMap size={16} /> {t("pickOnMap")}
      </Link>
    </form>
  );
}
