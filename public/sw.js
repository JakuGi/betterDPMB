// Minimálny service worker – umožňuje inštaláciu webu ako appky (PWA / WebAPK)
// a pri výpadku siete zobrazí hlášku namiesto chyby prehliadača. Dáta sa necachujú,
// aby odchody a meškania boli vždy aktuálne.

const OFFLINE_HTML = `<!doctype html><html lang="cs"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LepšieDPMB</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f4f5f7;color:#111827;text-align:center">
<div style="padding:24px"><div style="font-size:40px">📡</div><h1 style="font-size:20px;margin:8px 0">Jste offline · Si offline · You are offline</h1>
<p style="color:#6b7280">Připoj se k internetu a zkus to znovu.</p>
<button onclick="location.reload()" style="margin-top:8px;padding:10px 20px;border:0;border-radius:12px;background:#e30613;color:#fff;font-weight:600;font-size:15px">↻</button></div>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});
