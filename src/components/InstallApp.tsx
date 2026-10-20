"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useT } from "@/lib/client/store";
import { IconX } from "./icons";

/** Udalosť, ktorú Chrome pošle, keď sa dá web nainštalovať ako appka. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPromptEvent | null = null;
let justInstalled = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// Udalosť príde hneď po načítaní stránky – zachytíme ju čo najskôr (modul sa načíta s AppShell).
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    justInstalled = true;
    notify();
  });
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export const APK_URL = "https://github.com/JakuGi/betterDPMB/releases/latest";

const DISMISS_KEY = "lepsieDPMB:installDismissed";

type Platform = "android" | "ios" | "desktop";

/** Beží web vnútri našej Android appky? (appka pridáva značku do User-Agent) */
export function isInApp(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("LepsieDPMBApp");
}

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  return "desktop";
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    document.referrer.startsWith("android-app://")
  );
}

export function useInstall() {
  const canPrompt = useSyncExternalStore(subscribe, () => deferred != null, () => false);
  const installedNow = useSyncExternalStore(subscribe, () => justInstalled, () => false);
  const [env, setEnv] = useState<{ platform: Platform; standalone: boolean; inApp: boolean } | null>(null);
  useEffect(() => setEnv({ platform: detectPlatform(), standalone: isStandalone(), inApp: isInApp() }), []);

  const promptInstall = async () => {
    if (!deferred) return;
    const ev = deferred;
    await ev.prompt();
    await ev.userChoice.catch(() => null);
    deferred = null;
    notify();
  };

  return { ready: env != null, platform: env?.platform ?? "desktop", inApp: !!env?.inApp, installed: !!env?.standalone || installedNow, canPrompt, promptInstall };
}

/** Karta s inštaláciou appky. `dismissible` = dá sa skryť (na úvodnej stránke). V appke sa nezobrazuje. */
export function InstallCard({ dismissible = false, title }: { dismissible?: boolean; title?: React.ReactNode }) {
  const { t } = useT();
  const { ready, platform, inApp, installed, canPrompt, promptInstall } = useInstall();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(dismissible && localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, [dismissible]);

  if (!ready || inApp || (dismissible && (dismissed || installed))) return null;
  const android = platform === "android";

  return (
    <>
    {title}
    <section className="relative rounded-2xl border border-line bg-card p-4 shadow-sm">
      {dismissible && (
        <button
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* nedostupné úložisko */
            }
          }}
          className="absolute right-2 top-2 rounded-full p-1.5 text-muted hover:text-fg"
          aria-label={t("hide")}
        >
          <IconX size={16} />
        </button>
      )}
      <div className="flex items-start gap-3 pr-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-lg font-black text-white">B</span>
        <div className="min-w-0 text-sm">
          {android ? (
            <>
              <p className="font-semibold">{t("androidTitle")}</p>
              <p className="mt-0.5 text-muted">{t("androidText")}</p>
              <a href={APK_URL} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-xl bg-brand px-4 py-2 font-semibold text-white shadow-sm hover:bg-brand-dark">
                {t("androidBtn")}
              </a>
              <p className="mt-2 text-xs text-muted">{t("androidHint")}</p>
            </>
          ) : installed ? (
            <p className="font-semibold">{t("installed")}</p>
          ) : (
            <>
              <p className="font-semibold">{t("installTitle")}</p>
              <p className="mt-0.5 text-muted">{t("installText")}</p>
              {canPrompt ? (
                <button onClick={promptInstall} className="mt-3 rounded-xl bg-brand px-4 py-2 font-semibold text-white shadow-sm hover:bg-brand-dark">
                  {t("installBtn")}
                </button>
              ) : (
                <p className="mt-2 text-fg">{platform === "ios" ? t("installIos") : t("installDesktop")}</p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
    </>
  );
}

/** Registrácia service workera (len v produkcii, aby neprekážal pri vývoji). */
export function useServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
}
