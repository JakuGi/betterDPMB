"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { IconSearch, IconStar } from "@/components/icons";
import { Chip, LineBadge, SectionTitle, Spinner } from "@/components/ui";
import type { RouteDTO } from "@/lib/api-types";
import { isBrnoMhd, isNight, normalize, routeTypeLabel } from "@/lib/client/format";
import { useRoutes } from "@/lib/client/hooks";
import { useStore, useT } from "@/lib/client/store";
import type { I18nKey } from "@/lib/i18n";

const GROUPS: { key: string; label: I18nKey; test: (r: RouteDTO) => boolean }[] = [
  { key: "tram", label: "grp_tram", test: (r) => r.type === 0 && isBrnoMhd(r) },
  { key: "trol", label: "grp_trol", test: (r) => r.type === 11 && isBrnoMhd(r) },
  { key: "bus", label: "grp_bus", test: (r) => r.type === 3 && isBrnoMhd(r) && !isNight(r) },
  { key: "night", label: "grp_night", test: (r) => isNight(r) },
  { key: "other", label: "grp_other", test: (r) => isBrnoMhd(r) && ![0, 11, 3].includes(r.type) },
  { key: "train", label: "grp_train", test: (r) => r.type === 2 },
  { key: "reg", label: "grp_reg", test: (r) => !isBrnoMhd(r) && r.type !== 2 },
];

export default function LinesPage() {
  const routes = useRoutes();
  const store = useStore();
  const { t } = useT();
  const [q, setQ] = useState("");
  const [showRegional, setShowRegional] = useState(false);
  const collator = useMemo(() => new Intl.Collator("cs", { numeric: true }), []);

  const filtered = useMemo(() => {
    if (!routes) return [];
    const nq = normalize(q.trim());
    return routes
      .filter((r) => !nq || normalize(r.name).startsWith(nq) || normalize(r.long).includes(nq))
      .sort((a, b) => collator.compare(a.name, b.name));
  }, [routes, q, collator]);

  const favs = routes?.filter((r) => store.lines.some((l) => l.id === r.id)) ?? [];

  return (
    <div>
      <h1 className="mb-3 text-2xl font-bold">{t("nav_lines")}</h1>
      <label className="flex items-center gap-2 rounded-xl border border-line bg-card px-3 shadow-sm">
        <IconSearch size={18} className="text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("linesSearch")} className="h-12 flex-1 bg-transparent outline-none placeholder:text-muted" />
        {!routes && <Spinner className="text-muted" />}
      </label>
      <div className="mt-2">
        <Chip active={showRegional} onClick={() => setShowRegional(!showRegional)}>
          {t("showRegional")}
        </Chip>
      </div>

      {favs.length > 0 && !q && (
        <>
          <SectionTitle>
            <span className="inline-flex items-center gap-1">
              <IconStar size={14} filled className="text-amber-500" /> {t("myLines")}
            </span>
          </SectionTitle>
          <LineGrid routes={favs} />
        </>
      )}

      {GROUPS.filter((g) => showRegional || !["train", "reg"].includes(g.key)).map((g) => {
        const list = filtered.filter(g.test);
        if (!list.length) return null;
        return (
          <div key={g.key}>
            <SectionTitle>{t(g.label)}</SectionTitle>
            {g.key === "reg" || g.key === "train" ? <LineList routes={list} /> : <LineGrid routes={list} />}
          </div>
        );
      })}
    </div>
  );
}

function LineGrid({ routes }: { routes: RouteDTO[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {routes.map((r) => (
        <Link key={r.id} href={`/linka/${encodeURIComponent(r.id)}`} title={r.long} className="transition hover:scale-105">
          <LineBadge route={r} size="lg" />
        </Link>
      ))}
    </div>
  );
}

function LineList({ routes }: { routes: RouteDTO[] }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
      {routes.map((r) => (
        <Link key={r.id} href={`/linka/${encodeURIComponent(r.id)}`} className="flex items-center gap-3 px-3 py-2 hover:bg-soft">
          <LineBadge route={r} />
          <span className="truncate text-sm">{r.long}</span>
          <span className="ml-auto shrink-0 text-xs text-muted">{routeTypeLabel(r.type)}</span>
        </Link>
      ))}
    </div>
  );
}
