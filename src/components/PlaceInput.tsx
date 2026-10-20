"use client";

import { useId, useMemo, useRef, useState } from "react";
import { searchStops, useStops } from "@/lib/client/hooks";
import { placeKey, useStore, useT, type Place } from "@/lib/client/store";
import { IconBriefcase, IconClock, IconHome, IconLocate, IconStar, IconStop, IconX } from "./icons";

interface Option {
  place: Place;
  label: string;
  hint?: string;
  icon: "here" | "star" | "recent" | "stop" | "home" | "work";
}

const ICONS = {
  here: IconLocate,
  star: IconStar,
  recent: IconClock,
  stop: IconStop,
  home: IconHome,
  work: IconBriefcase,
};

export function PlaceInput({
  value,
  onChange,
  placeholder,
  label,
  allowHere = true,
  autoFocus,
}: {
  value: Place | null;
  onChange: (p: Place | null) => void;
  placeholder: string;
  label: string;
  allowHere?: boolean;
  autoFocus?: boolean;
}) {
  const store = useStore();
  const { t } = useT();
  const stops = useStops();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const options = useMemo<Option[]>(() => {
    const q = query.trim();
    const out: Option[] = [];
    if (!q) {
      if (allowHere) out.push({ place: { kind: "here", name: t("myLocation") }, label: t("myLocation"), icon: "here" });
      if (store.home) out.push({ place: store.home, label: t("home"), hint: store.home.name, icon: "home" });
      if (store.work) out.push({ place: store.work, label: t("work"), hint: store.work.name, icon: "work" });
      for (const s of store.stops) out.push({ place: { kind: "group", id: s.id, name: s.name }, label: s.name, icon: "star" });
      for (const r of store.recent) {
        if (out.some((o) => placeKey(o.place) === placeKey(r))) continue;
        out.push({ place: r, label: r.name, icon: "recent" });
      }
      return out.slice(0, 12);
    }
    if (!stops) return [];
    for (const g of searchStops(stops, q, 10)) {
      out.push({
        place: { kind: "group", id: g.id, name: g.name },
        label: g.name,
        hint: g.lines.slice(0, 12).join(" · "),
        icon: store.stops.some((s) => s.id === g.id) ? "star" : "stop",
      });
    }
    return out;
  }, [query, stops, store, allowHere, t]);

  const select = (o: Option) => {
    onChange(o.place);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const display = value && !open ? (value.kind === "here" ? t("myLocation") : value.name) : query;

  return (
    <div className="relative">
      <label className="flex items-center gap-2 rounded-xl border border-line bg-soft px-3 focus-within:border-fg/40 focus-within:bg-card">
        {label && <span className="w-8 shrink-0 text-xs font-semibold uppercase text-muted">{label}</span>}
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={display}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
          onFocus={() => {
            setOpen(true);
            setActive(0);
            setQuery("");
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, options.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && open && options[active]) {
              e.preventDefault();
              select(options[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
        />
        {value && !open && (
          <button type="button" className="rounded-full p-1 text-muted hover:text-fg" onClick={() => onChange(null)} aria-label={t("clear")}>
            <IconX size={16} />
          </button>
        )}
      </label>

      {open && options.length > 0 && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-[1100] mt-1 max-h-80 overflow-auto rounded-xl border border-line bg-card py-1 shadow-xl">
          {options.map((o, i) => {
            const Icon = ICONS[o.icon];
            return (
              <li
                key={`${o.icon}-${placeKey(o.place)}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${i === active ? "bg-soft" : ""}`}
              >
                <Icon size={18} className={o.icon === "star" ? "text-amber-500" : o.icon === "here" ? "text-blue-500" : "text-muted"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{o.label}</span>
                  {o.hint && <span className="block truncate text-xs text-muted">{o.hint}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {open && query && stops && options.length === 0 && (
        <div className="absolute inset-x-0 top-full z-[1100] mt-1 rounded-xl border border-line bg-card p-3 text-sm text-muted shadow-xl">{t("noStopFound")}</div>
      )}
    </div>
  );
}
