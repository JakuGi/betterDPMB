import type { Metadata } from "next";

export const metadata: Metadata = { title: "Ochrana soukromí / Privacy policy" };

const UPDATED = "20. 10. 2026";
const ISSUES = "https://github.com/JakuGi/betterDPMB/issues";

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-8 pb-10 text-sm leading-relaxed [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">
      <section>
        <h1 className="text-2xl font-bold">Zásady ochrany soukromí</h1>
        <p className="text-muted">LepšieDPMB (web betterdpmb.vercel.app a Android aplikace) · aktualizováno {UPDATED}</p>

        <p className="mt-4">
          LepšieDPMB je neoficiální aplikace pro vyhledávání spojení MHD v Brně. Není provozována Dopravním podnikem města Brna ani KORDIS JMK a nemá s nimi
          žádné spojení. Aplikace nemá uživatelské účty, nezobrazuje reklamy a nepoužívá analytické ani sledovací nástroje.
        </p>

        <h2>Jaká data se zpracovávají</h2>
        <ul>
          <li>
            <b>Oblíbené, historie a nastavení</b> se ukládají jen v úložišti prohlížeče ve vašem zařízení a na server se neodesílají (kromě odkazu pro přenos
            oblíbených, který si vytvoříte sami).
          </li>
          <li>
            <b>Poloha</b> se zjišťuje jen tehdy, když o to požádáte (tlačítko polohy). Souřadnice se odešlou na náš server, aby se našly zastávky v okolí a
            spojení. Při výběru místa na mapě se souřadnice nebo hledaná adresa odešlou také službě OpenStreetMap Nominatim kvůli zjištění názvu ulice. Poloha se
            neukládá.
          </li>
          <li>
            <b>Technické záznamy</b>: hostingová služba Vercel a dlaždice mapy z OpenStreetMap běžně zpracovávají IP adresu a údaje o požadavku (např. pro
            zabezpečení a provoz služby).
          </li>
        </ul>

        <h2>Zdroje dat</h2>
        <p>Jízdní řád a polohy vozidel pocházejí z otevřených dat IDS JMK (KORDIS JMK, DPMB). Mapa © přispěvatelé OpenStreetMap.</p>

        <h2>Kontakt</h2>
        <p>
          Dotazy a žádosti: <a className="underline" href={ISSUES}>{ISSUES}</a>
        </p>
      </section>

      <hr className="border-line" />

      <section lang="en">
        <h1 className="text-2xl font-bold">Privacy policy</h1>
        <p className="text-muted">LepšieDPMB (website betterdpmb.vercel.app and Android app) · updated {UPDATED}</p>

        <p className="mt-4">
          LepšieDPMB is an unofficial public transport journey planner for Brno. It is not operated by or affiliated with Dopravní podnik města Brna (DPMB) or
          KORDIS JMK. The app has no user accounts, shows no ads and uses no analytics or tracking tools.
        </p>

        <h2>What data is processed</h2>
        <ul>
          <li>
            <b>Favourites, history and settings</b> are stored only in your browser storage on your device and are not sent to the server (except for a
            transfer link you create yourself).
          </li>
          <li>
            <b>Location</b> is read only when you ask for it (location button). Coordinates are sent to our server to find nearby stops and connections. When you
            pick a place on the map, coordinates or the searched address are also sent to OpenStreetMap Nominatim to look up the street name. Location is not
            stored.
          </li>
          <li>
            <b>Technical logs</b>: the hosting provider Vercel and the OpenStreetMap tile servers routinely process IP addresses and request data (e.g. for
            security and operation).
          </li>
        </ul>

        <h2>Data sources</h2>
        <p>Timetables and vehicle positions come from IDS JMK open data (KORDIS JMK, DPMB). Map © OpenStreetMap contributors.</p>

        <h2>Contact</h2>
        <p>
          Questions and requests: <a className="underline" href={ISSUES}>{ISSUES}</a>
        </p>
      </section>
    </article>
  );
}
