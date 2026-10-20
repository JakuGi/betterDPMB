# LepšieDPMB – Android appka

Appka je **Trusted Web Activity (TWA)**: po spustení otvorí https://betterdpmb.vercel.app na celú obrazovku (cez Chrome, bez adresného
riadka; bez Chromu cez WebView). Všetok obsah aj aktualizácie idú z Vercelu – novú verziu appky treba vydať len pri zmene ikony,
názvu, adresy a pod.

- balík: `io.github.jakugi.betterdpmb`
- minSdk 26 (Android 8), targetSdk 36
- oprávnenia: len internet (polohu žiada stránka cez Chrome)
- prepojenie s webom: `/.well-known/assetlinks.json` (`src/app/api/assetlinks/route.ts`)

## ⚠️ Podpisový kľúč – zálohuj ho

`android/keystore/release.jks` + heslá v `android/keystore.properties` (oba sú mimo gitu).
**Bez tohto kľúča sa appka nedá aktualizovať** (pri GitHub verzii vôbec, pri Google Play len cez žiadosť o reset upload kľúča).
Ulož si oba súbory aj mimo počítača (správca hesiel, šifrovaný disk).

Odtlačok SHA-256: `96:D5:FE:0B:10:19:0E:7D:94:F3:C0:3C:C4:4A:DE:55:31:41:A3:21:00:FB:87:49:EA:55:E7:A6:3E:F2:71:93`

## Vydanie na GitHube (APK na stiahnutie)

1. Jednorazovo v repozitári **Settings → Secrets and variables → Actions → New repository secret** pridaj:
   | secret | hodnota |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | obsah súboru `android/keystore/release.jks.base64.txt` |
   | `ANDROID_KEYSTORE_PASSWORD` | `storePassword` z `android/keystore.properties` |
   | `ANDROID_KEY_ALIAS` | `betterdpmb` |
   | `ANDROID_KEY_PASSWORD` | `keyPassword` z `android/keystore.properties` |
2. Vydanie verzie: `git tag android-v1.0.1 && git push origin android-v1.0.1` – workflow `.github/workflows/android.yml`
   zostaví podpísané APK + AAB a vytvorí **GitHub Release** s APK.
3. Prvá verzia 1.0.0 je už zostavená v `android/release/` – dá sa nahrať aj ručne (Releases → Draft a new release).

**Inštalácia v mobile:** otvor Release v mobile, stiahni `.apk`, otvor ho a povoľ „Inštalovať neznáme aplikácie“ pre prehliadač.
Appka je podpísaná release kľúčom, cieli na aktuálne API a žiada len internet, takže ju Play Protect bežne pustí; pri neznámej
appke môže ponúknuť „Skontrolovať aplikáciu“ – po kontrole sa inštalácia dokončí.

**Overovanie vývojárov (sideloading):** Google ohlásil, že appky inštalované mimo Google Play budú musieť pochádzať od
overeného vývojára – najprv (od 9/2026) v Brazílii, Indonézii, Singapure a Thajsku, celosvetovo od roku 2027. Keď sa to bude týkať
SK/CZ, zaregistruj sa v **Android Developer Console** (je tam aj bezplatný typ účtu pre študentov/hobby) a zaregistruj balík
`io.github.jakugi.betterdpmb` s odtlačkom kľúča vyššie – potom inštaláciu nič blokovať nebude. Ak by Play Protect appku
neoprávnene označil, dá sa podať žiadosť o prehodnotenie cez formulár Play Protect (Google Help → „Play Protect appeals“).

## Vydanie na Google Play

1. **Účet:** [play.google.com/console](https://play.google.com/console) – registračný poplatok 25 USD (jednorazovo), overenie
   identity. Osobné účty založené po 13. 11. 2023 musia pred zverejnením spraviť **uzavreté testovanie s aspoň 12 testermi
   počas 14 dní** (testerov pridáš e-mailom, appku si nainštalujú cez odkaz).
2. **Vytvor appku:** názov napr. „LepšieDPMB – MHD Brno“, typ *App*, *Free*. Do popisu uveď, že ide o **neoficiálnu** appku
   (nie je od DPMB ani KORDIS JMK) – Google inak môže appku zamietnuť pre pravidlá o vydávaní sa za iných / ochranných známkach.
3. **Nahraj AAB:** `android/release/LepsieDPMB-1.0.0.aab` (ďalšie verzie z Actions → Artifacts) do *Testing → Closed testing*.
   Ponechaj **Play App Signing** (Google podpisuje appku svojím kľúčom, náš kľúč slúži ako *upload key*).
4. **Prepoj appku z Play s webom:** v *Test and release → Setup → App signing* skopíruj **SHA-256 odtlačok kľúča „App signing key“**
   a vo Verceli pridaj premennú `ANDROID_SHA256_FINGERPRINTS` (Production) s touto hodnotou → *Redeploy*. Bez toho bude appka
   z Play zobrazovať adresný riadok. Overenie: `https://betterdpmb.vercel.app/.well-known/assetlinks.json` musí obsahovať oba odtlačky.
5. **Store listing:** ikona 512×512 (`https://betterdpmb.vercel.app/pwa-icon/512`), feature graphic 1024×500, aspoň 2 snímky
   obrazovky z mobilu, krátky a dlhý popis.
6. **App content:**
   - *Privacy policy:* `https://betterdpmb.vercel.app/sukromie`
   - *Ads:* nie
   - *Data safety:* zbiera sa **poloha (presná)** – voliteľne, na funkčnosť appky, neukladá sa, nezdieľa sa s tretími stranami
     (spracovatelia ako hosting sa nepočítajú); dáta sú šifrované pri prenose (HTTPS); žiadne účty
   - *Content rating:* dotazník (kategória Utility/Travel – bez rizikového obsahu)
   - *Target audience:* 13+ (nie deti)
7. Po 14 dňoch testovania požiadaj o **Production access** a vydaj verziu do produkcie.

Každá nová verzia pre Play musí mať vyšší `versionCode` – CI ho nastavuje automaticky (číslo behu workflowu + 1).

## Lokálny build

Gradle na Windows **nefunguje z cesty s diakritikou** („Počítač“), preto treba priečinok `android/` skopírovať napr. do
`C:\dev\betterdpmb-android` a tam spustiť (JDK 21, Android SDK s platformou 36, Gradle 9.8):

```
gradle assembleRelease bundleRelease
```

Výstupy: `app/build/outputs/apk/release/app-release.apk`, `app/build/outputs/bundle/release/app-release.aab`.
