"use client";

import { useEffect, useState } from "react";
import { IconArrowDown, IconArrowUp, IconBriefcase, IconHome, IconLocate, IconTrash } from "@/components/icons";
import { PlaceInput } from "@/components/PlaceInput";
import { Card, LineBadge, SectionTitle, Spinner } from "@/components/ui";
import { getPosition } from "@/lib/client/hooks";
import {
  exportCode,
  importCode,
  moveItem,
  placeKey,
  removeItem,
  setStore,
  updateSettings,
  useStore,
  useT,
  type Place,
  type StoreData,
} from "@/lib/client/store";
import { LANGS } from "@/lib/i18n";

export default function FavoritesPage() {
  const store = useStore();
  const { t } = useT();
  const [incoming, setIncoming] = useState<StoreData | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);

  useEffect(() => {
    const m = /import=([A-Za-z0-9_-]+)/.exec(window.location.hash);
    if (!m) return;
    try {
      setIncoming(importCode(m[1]));
    } catch {
      setImportErr(t("importBroken"));
    }
  }, []);

  const finishImport = (mode: "merge" | "replace") => {
    if (!incoming) return;
    setStore((s) => {
      if (mode === "replace") return { ...incoming, recent: s.recent, history: s.history };
      const uniq = <T,>(arr: T[], key: (x: T) => string) => {
        const seen = new Set<string>();
        return arr.filter((x) => (seen.has(key(x)) ? false : (seen.add(key(x)), true)));
      };
      return {
        ...s,
        stops: uniq([...s.stops, ...incoming.stops], (x) => x.id),
        routes: uniq([...s.routes, ...incoming.routes], (x) => `${placeKey(x.from)}>${placeKey(x.to)}`),
        lines: uniq([...s.lines, ...incoming.lines], (x) => x.id),
        trips: uniq([...s.trips, ...incoming.trips], (x) => `${x.groupId}|${x.routeName}|${x.headsign}|${x.time}`),
        home: s.home ?? incoming.home,
        work: s.work ?? incoming.work,
      };
    });
    setIncoming(null);
    history.replaceState(null, "", window.location.pathname);
  };

  return (
    <div className="pb-6">
      <h1 className="text-2xl font-bold">{t("settingsTitle")}</h1>

      <SectionTitle>{t("language")}</SectionTitle>
      <div className="inline-flex rounded-xl border border-line bg-card p-1 shadow-sm">
        {LANGS.map((l) => (
          <button
            key={l.code}
            onClick={() => updateSettings({ lang: l.code })}
            aria-pressed={store.settings.lang === l.code}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${store.settings.lang === l.code ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}
          >
            {l.label}
          </button>
        ))}
      </div>

      {importErr && <p className="mt-3 text-sm text-red-600">{importErr}</p>}
      {incoming && (
        <Card className="mt-4 border-blue-400 p-4">
          <div className="font-semibold">{t("importTitle")}</div>
          <p className="mt-1 text-sm text-muted">
            {t("importSummary", { s: incoming.stops.length, r: incoming.routes.length, t: incoming.trips.length, l: incoming.lines.length })}
            {incoming.home ? ` · ${t("home")}` : ""}
            {incoming.work ? ` · ${t("work")}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => finishImport("merge")} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white">
              {t("merge")}
            </button>
            <button onClick={() => finishImport("replace")} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold">
              {t("replace")}
            </button>
            <button onClick={() => setIncoming(null)} className="px-3 py-2 text-sm text-muted">
              {t("cancel")}
            </button>
          </div>
        </Card>
      )}

      <SectionTitle>{t("myPlaces")}</SectionTitle>
      <Card className="space-y-3 p-4">
        <PlaceSetting label={t("home")} icon={<IconHome size={18} />} value={store.home} onChange={(p) => setStore((s) => ({ ...s, home: p }))} />
        <PlaceSetting label={t("workSchool")} icon={<IconBriefcase size={18} />} value={store.work} onChange={(p) => setStore((s) => ({ ...s, work: p }))} />
      </Card>

      <SectionTitle>{t("favStops")}</SectionTitle>
      <EditableList
        items={store.stops}
        empty={t("noFavStops")}
        render={(s) => (
          <>
            <span className="font-medium">{s.name}</span>
            {s.lines.length > 0 && <span className="ml-2 text-xs text-muted">{t("linesList", { lines: s.lines.join(", ") })}</span>}
          </>
        )}
        listKey="stops"
      />

      <SectionTitle>{t("savedRoutes")}</SectionTitle>
      <EditableList
        items={store.routes}
        empty={t("noRoutes")}
        render={(r, i) => (
          <div className="min-w-0">
            <div className="truncate text-sm text-muted">
              {r.from.name} → {r.to.name}
            </div>
            <input
              value={r.label ?? ""}
              placeholder={t("customName")}
              onChange={(e) => setStore((s) => ({ ...s, routes: s.routes.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))}
              className="mt-1 w-full rounded-lg border border-line bg-soft px-2 py-1 text-sm"
            />
          </div>
        )}
        listKey="routes"
      />

      <SectionTitle>{t("myTrips")}</SectionTitle>
      <EditableList
        items={store.trips}
        empty={t("noTrips")}
        render={(tr) => (
          <span className="flex items-center gap-2">
            <LineBadge route={{ name: tr.routeName, type: 3, color: null, textColor: null }} size="sm" />
            <span className="truncate">{t("myTripRow", { time: tr.time, stop: tr.stopName, h: tr.headsign })}</span>
          </span>
        )}
        listKey="trips"
      />

      <SectionTitle>{t("myLines")}</SectionTitle>
      <EditableList
        items={store.lines}
        empty={t("noLines")}
        render={(l) => <LineBadge route={{ name: l.name, type: l.type, color: null, textColor: null }} size="sm" />}
        listKey="lines"
      />

      <SectionTitle>{t("searchAndMap")}</SectionTitle>
      <Card className="divide-y divide-line">
        <Toggle label={t("setWheelchair")} checked={store.settings.wheelchair} onChange={(v) => updateSettings({ wheelchair: v })} />
        <Toggle
          label={t("setWalking")}
          checked={store.settings.walking}
          onChange={(v) => updateSettings({ walking: v })}
        />
        <Toggle label={t("setOnlyMhd")} checked={store.settings.onlyMhd} onChange={(v) => updateSettings({ onlyMhd: v })} />
        <label className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          {t("maxTransfersTitle")}
          <select value={store.settings.maxTransfers} onChange={(e) => updateSettings({ maxTransfers: Number(e.target.value) })} className="rounded-lg border border-line bg-soft px-2 py-1">
            {[0, 1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n === 4 ? t("unlimited") : n}
              </option>
            ))}
          </select>
        </label>
      </Card>

      <SectionTitle>{t("transfer")}</SectionTitle>
      <SyncCard store={store} />

      <p className="mt-6 text-xs text-muted">{t("footerNote")}</p>
      <p className="mt-2 text-xs text-muted">
        {t("unofficial")}{" "}
        <a href="/sukromie" className="underline">
          {t("privacy")}
        </a>
      </p>
    </div>
  );
}

function PlaceSetting({ label, icon, value, onChange }: { label: string; icon: React.ReactNode; value: Place | null; onChange: (p: Place | null) => void }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-sm font-medium">
        {icon} {label}
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <PlaceInput label="" value={value} onChange={onChange} placeholder={t("stopPh")} allowHere={false} />
        </div>
        <button
          type="button"
          title={t("useMyLocation")}
          onClick={async () => {
            setBusy(true);
            try {
              const p = await getPosition();
              onChange({ kind: "coord", lat: p.lat, lon: p.lon, name: label });
            } catch (e) {
              alert(e instanceof Error ? e.message : t("locFailed"));
            } finally {
              setBusy(false);
            }
          }}
          className="grid w-12 place-items-center rounded-xl border border-line bg-soft text-muted hover:text-fg"
        >
          {busy ? <Spinner /> : <IconLocate size={18} />}
        </button>
      </div>
    </div>
  );
}

function EditableList<T>({
  items,
  render,
  empty,
  listKey,
}: {
  items: T[];
  render: (item: T, i: number) => React.ReactNode;
  empty: string;
  listKey: "stops" | "routes" | "trips" | "lines";
}) {
  const { t } = useT();
  if (!items.length) return <p className="px-1 text-sm text-muted">{empty}</p>;
  return (
    <Card className="divide-y divide-line">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-2">
          <div className="min-w-0 flex-1">{render(item, i)}</div>
          <button onClick={() => moveItem(listKey, i, -1)} disabled={i === 0} className="rounded p-1.5 text-muted hover:bg-soft disabled:opacity-30" aria-label={t("up")}>
            <IconArrowUp size={16} />
          </button>
          <button onClick={() => moveItem(listKey, i, 1)} disabled={i === items.length - 1} className="rounded p-1.5 text-muted hover:bg-soft disabled:opacity-30" aria-label={t("down")}>
            <IconArrowDown size={16} />
          </button>
          <button onClick={() => removeItem(listKey, i)} className="rounded p-1.5 text-red-500 hover:bg-soft" aria-label={t("remove")}>
            <IconTrash size={16} />
          </button>
        </div>
      ))}
    </Card>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm">
      {label}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-[var(--color-brand)]" />
    </label>
  );
}

function SyncCard({ store }: { store: StoreData }) {
  const { t } = useT();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare("share" in navigator), []);
  const make = () => {
    const l = `${window.location.origin}/oblubene#import=${exportCode(store)}`;
    setLink(l);
    setCopied(false);
    return l;
  };
  return (
    <Card className="space-y-3 p-4 text-sm">
      <p className="text-muted">{t("syncHint")}</p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={async () => {
            const l = make();
            try {
              await navigator.clipboard.writeText(l);
              setCopied(true);
            } catch {
              /* schránka nedostupná – odkaz je zobrazený nižšie */
            }
          }}
          className="rounded-xl bg-brand px-4 py-2 font-semibold text-white"
        >
          {copied ? t("copied") : t("copyLink")}
        </button>
        {canShare && (
          <button onClick={() => navigator.share({ title: t("shareTitle"), url: make() }).catch(() => {})} className="rounded-xl border border-line px-4 py-2 font-semibold">
            {t("share")}
          </button>
        )}
      </div>
      {link && <textarea readOnly value={link} className="h-20 w-full rounded-lg border border-line bg-soft p-2 text-xs" onFocus={(e) => e.target.select()} />}
    </Card>
  );
}
