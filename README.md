# LepšieDPMB

Web appka na pohodlné vyhľadávanie spojení MHD Brno (IDS JMK) – funguje na PC aj v mobile (dá sa „nainštalovať“ na plochu).

## Funkcie

- **Vyhľadávanie spojení** A → B (vlastný algoritmus RAPTOR nad cestovným poriadkom), aj z aktuálnej polohy, s prestupmi a chôdzou, filter bezbariérovosti a počtu prestupov
- **Trasa na mape** – keď nepoznáš názvy zastávok: ťukni na mapu (alebo vyhľadaj adresu), kde si a kam ideš; ukáže najbližšie zastávky, najlepšie spojenia a vybranú trasu nakreslí do mapy
- **Online meškanie** pri každom spoji, odchode aj vo výsledkoch hľadania
- **Odchodová tabuľa** zastávky – filter liniek a stanovíšť, odpočet minút, auto-obnova
- **Živá mapa vozidiel** – farby liniek, smer jazdy, farebný krúžok podľa meškania, filter liniek / meškajúcich, sledovanie vozidla, trasa spoja
- **Detail spoja** – kde je vozidlo, odhadované časy na ďalších zastávkach
- **Obľúbené**: zastávky (s výberom liniek pre úvod), uložené trasy, „moje spoje“ (napr. ranná 25-ka o 7:42 – na úvode vidíš, či mešká), obľúbené linky, Domov / Práca
- **História vyhľadávaní** na úvode – opakovanie hľadania jedným klikom (trasy z mapy sa otvoria znova na mape), uloženie do trás hviezdičkou
- Každé vyhľadané spojenie sa dá **zobraziť na mape** (celé vyhľadávanie aj konkrétne spojenie)
- **Jazyk rozhrania**: čeština (predvolená), slovenčina, angličtina – v nastaveniach
- Prepínač **„Aj pešo / Bez chôdze“** – bez chôdze sa prestupuje len v rámci tej istej zastávky
- **Výluky** z GTFS-RT, filter na tvoje linky a zastávky
- Zastávky v okolí, hovorové názvy (mendlák, hlavas, …), tmavý režim, PWA
- Prenos obľúbených medzi zariadeniami cez odkaz (dáta sú v prehliadači, bez účtu)

## Dáta

- Cestovný poriadok: GTFS IDS JMK – `https://kordis-jmk.cz/gtfs/gtfs.zip`
- Online polohy a výluky: GTFS-RT – `https://kordis-jmk.cz/gtfs/gtfsReal.dat`

Feed polôh neobsahuje meškanie, preto sa dopočítava z polohy vozidla medzi zastávkami a cestovného poriadku.

## Lokálne spustenie

```bash
npm install
npm run dev        # pri prvom spustení stiahne a predspracuje GTFS (~10 s)
```

Otvor http://localhost:3000. V mobile v tej istej Wi-Fi: `http://<IP-počítača>:3000`.

Aktualizácia cestovného poriadku: `npm run data`.

## Deploy na Vercel

1. Nahraj repozitár na GitHub a importuj ho vo Vercel (framework Next.js sa rozpozná sám), alebo `npx vercel`.
2. `npm run build` pri každom deployi stiahne čerstvé GTFS – na pravidelnú aktualizáciu cestovného poriadku stačí občas redeploy (napr. Deploy Hook spúšťaný raz týždenne).

### Automatická denná aktualizácia cestovného poriadku

Vercel Cron (`vercel.json`) volá každý deň o 3:00 UTC `/api/cron/refresh-timetable`. Endpoint porovná
`Last-Modified` GTFS na kordis-jmk.cz s dátami aktuálneho deployu a ak sú nové, zavolá Deploy Hook –
nový build si stiahne čerstvý cestovný poriadok. Ručne sa dá vynútiť cez `?force=1` (s hlavičkou `Authorization: Bearer $CRON_SECRET`).

Potrebné premenné prostredia (Production): `CRON_SECRET`, `DEPLOY_HOOK_URL` (Settings → Git → Deploy Hooks, vetva `main`).

## Android appka

V priečinku `android/` je natívna Android appka s vlastným WebView, ktorá načítava tento web – vydanie na GitHube aj Google Play
popisuje [`android/README.md`](android/README.md).

## Poznámka k OneDrive

Projekt je v priečinku synchronizovanom cez OneDrive. Ten pri synchronizácii `node_modules` občas spomalí dev server („waiting for the filesystem to settle“). Ak to bude prekážať, presuň projekt mimo OneDrive (napr. `C:\dev\lepsieDPMB`).
