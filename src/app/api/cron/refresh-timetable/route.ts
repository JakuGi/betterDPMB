import { getTimetable } from "@/lib/server/timetable";

/**
 * Denná aktualizácia cestovného poriadku (Vercel Cron, viď vercel.json).
 *
 * Cestovný poriadok sa predspracuje pri builde, preto sa aktualizuje novým deployom:
 * ak KORDIS zverejnil nové GTFS (zmenil sa Last-Modified), zavoláme Deploy Hook
 * a build si stiahne čerstvé dáta. `?force=1` spustí nový deploy vždy.
 *
 * Potrebné premenné prostredia:
 *   CRON_SECRET      – Vercel ho posiela v hlavičke Authorization pri volaní cronu
 *   DEPLOY_HOOK_URL  – Deploy Hook projektu (Settings → Git → Deploy Hooks)
 */

const GTFS_URL = process.env.GTFS_URL ?? "https://kordis-jmk.cz/gtfs/gtfs.zip";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Chýba CRON_SECRET" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const hook = process.env.DEPLOY_HOOK_URL;
  if (!hook) return Response.json({ error: "Chýba DEPLOY_HOOK_URL" }, { status: 500 });

  const force = new URL(req.url).searchParams.has("force");
  const local = getTimetable().feedLastModified;

  let remote: string | null = null;
  try {
    const head = await fetch(GTFS_URL, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (head.ok) remote = head.headers.get("last-modified");
  } catch {
    // KORDIS nedostupný – radšej skúsime prebuildovať, build si dáta stiahne sám
  }

  const changed = !remote || !local || new Date(remote).getTime() !== new Date(local).getTime();
  if (!changed && !force) {
    return Response.json({ status: "up-to-date", feedLastModified: local });
  }

  const res = await fetch(hook, { method: "POST", cache: "no-store" });
  return Response.json(
    { status: res.ok ? "redeploy-triggered" : "hook-failed", hookStatus: res.status, local, remote, forced: force },
    { status: res.ok ? 200 : 502 },
  );
}
