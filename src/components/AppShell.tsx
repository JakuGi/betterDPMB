"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import type { I18nKey } from "@/lib/i18n";
import { useT } from "@/lib/client/store";
import { useServiceWorker } from "./InstallApp";
import { IconAlert, IconHome, IconLines, IconMap, IconRoute, IconSettings, IconStop } from "./icons";

const NAV = [
  { href: "/", label: "nav_home" as I18nKey, icon: IconHome, match: (p: string) => p === "/" || p.startsWith("/spojenie") },
  { href: "/trasa", label: "nav_route" as I18nKey, icon: IconRoute, match: (p: string) => p.startsWith("/trasa") },
  { href: "/zastavky", label: "nav_stops" as I18nKey, icon: IconStop, match: (p: string) => p.startsWith("/zastav") },
  { href: "/mapa", label: "nav_map" as I18nKey, icon: IconMap, match: (p: string) => p.startsWith("/mapa") || p.startsWith("/spoj/") },
  { href: "/linky", label: "nav_lines" as I18nKey, icon: IconLines, match: (p: string) => p.startsWith("/link") },
  { href: "/vyluky", label: "nav_alerts" as I18nKey, icon: IconAlert, match: (p: string) => p.startsWith("/vyluky") },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "/";
  const fullBleed = path.startsWith("/mapa") || path.startsWith("/trasa");
  const { t, lang } = useT();
  useServiceWorker();

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-[1000] border-b border-line bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/75">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
            <span className="grid size-8 place-items-center rounded-lg bg-brand text-sm font-black text-white">B</span>
            <span>
              Lepšie<span className="text-brand">DPMB</span>
            </span>
          </Link>
          <nav className="ml-4 hidden flex-1 items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${n.match(path) ? "bg-soft text-fg" : "text-muted hover:text-fg"}`}
              >
                {t(n.label)}
              </Link>
            ))}
          </nav>
          <Link
            href="/oblubene"
            className={`ml-auto rounded-full p-2 transition hover:bg-soft ${path.startsWith("/oblubene") ? "text-fg" : "text-muted"}`}
            title={t("settingsTitle")}
          >
            <IconSettings size={22} />
          </Link>
        </div>
      </header>

      <main className={fullBleed ? "relative flex flex-1 flex-col" : "mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-4 md:pb-10"}>{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-[1000] border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid grid-cols-6">
          {NAV.map((n) => {
            const active = n.match(path);
            return (
              <Link key={n.href} href={n.href} className={`flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium ${active ? "text-brand" : "text-muted"}`}>
                <n.icon size={22} />
                {t(n.label)}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
