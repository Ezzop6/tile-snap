# next.md — jak pokračovat (desktop release)

Pracovní handoff pro desktop packaging TileSnap (Electron → Linux/Win/Mac, cíl
itch.io). Plná dokumentace je v `AGENTS.md` → sekce **"Desktop packaging"**.
Větev: `desktop-release` (dřív `taury-vs-elektron`).

---

## Zbývá vyřešit (pro pokračování)

1. ~~**Interaktivně ověřit CSP + IDB + paper-core build na Linuxu**~~ ✅ HOTOVO
   (2026-05-27, user). Demo / upload / export PNG+ZIP + CSP violations ověřeny dřív
   (viz `verify.md` → „Už dříve ověřeno"). Doklikány i poslední body `verify.md`
   sekce A: CSP warning v terminálu chybí + čistý boot, window-state restore drží
   přes restart, runtime ikona exportovaná (xprop). **Linux je kompletně ověřen.**
2. **Win build POSTAVEN (2026-05-27)** přes Docker (`build-win-docker.sh`,
   `electronuserland/builder:wine` — systémový wine netřeba): `release/win/TileSnap
   0.0.0.exe` (portable, x64, ikona zkonvertovaná, bez `default Electron icon`
   warningu). **Runtime ověření zbývá na reálném Win 10/11** (wine NENÍ věrohodný
   test) — viz `verify.md` sekce B. **Mac build nepostaven** (chce macOS); při něm
   ověřit `.icns` konverzi + že CSP/IDB/menu jedou jako na Linuxu.
3. ~~About dialog (UI)~~ ✅ HOTOVO (2026-05-27) — krok 4 níž.
4. **Rozhodnutí na userovi** — podpis/notarizace, CI, branch reconciliation
   (sekce „Rozhodnutí čekající na usera" níž).
5. **Commit** — vše je v pracovním stromu, negitnuto (řeší user).

> Konvence pro jednotné řešení web ⇆ desktop viz `AGENTS.md` → „Invarianty
> (na co pozor)". Každá nová závislost / asset / storage / CSP změna se musí
> držet těch pravidel, jinak se buildy rozejdou.

---

## Co je HOTOVO

- **Layout:** app zdrojáky přesunuty do `src/`; root drží jen packaging vrstvu
  (`electron-main.cjs`, `package.json`). Dev = otevřít `src/index.html`.
- **Electron wrapper** (`electron-main.cjs`): custom `app://` protokol (ES moduly
  + stabilní origin pro localStorage), servíruje `src/`, za běhu přepisuje CDN
  `<script>` → lokální `src/vendor/*` (offline). Loguje renderer chyby do terminálu.
- **Vendored knihovny** v `src/vendor/` (offline) — dev `index.html` zůstává na CDN.
- **Build:** `package.json` build config (electron-builder). Výstupy pod
  `release/<target>/`: desktop → `release/{linux,win,mac}`, web → `release/web`.
  Targety pro Linux/Win/Mac. Makefile: `make app-*` / `make build`.
- **Web build** (`build.sh`/`make build` → `release/web`) běží ze `src/`, funguje.
- **AGENTS.md** aktualizován (src/ layout, Desktop packaging sekce, opravena
  konvence o package.json).
- **Licence:** `LICENSE` (proprietární, © 2026 ezzop6) + `THIRD-PARTY-LICENSES.md`
  (přepsaný pro desktop bundling + Electron/Chromium) v pracovním stromu. Plné
  LICENSE texty knihoven v `src/vendor/licenses/`. Obojí přidáno do `files`.

Ověřeno: `npm start` (dev okno) i `make build` (web) jedou po přesunu.

---

## Otevřené kroky (priorita shora dolů)

### ~~1. Ověřit zabalený build po přesunu do `src/`~~ ✅ HOTOVO (2026-05-26)
Přebuildováno (`make app-linux`) a spuštěno (`./release/TileSnap-0.0.0.AppImage
--no-sandbox`). Ověřeno:
- `app.getAppPath()/src` resoluce uvnitř asaru funguje — `[did-finish-load] ok`,
  žádné `[did-fail-load]` ani renderer chyby (ES moduly z `src/` se načetly).
- asar obsahuje `LICENSE`, `THIRD-PARTY-LICENSES.md`, `electron-main.cjs`,
  `package.json`, `src/**` (incl. `src/vendor/licenses/`).
- `release/linux-unpacked/` má `LICENSE.electron.txt` + `LICENSES.chromium.html`.
- User vizuálně potvrdil: okno se vykreslí, demo projekt se načte, export funguje.

### ~~2. Desktop polish~~ ✅ HOTOVO (2026-05-26)
Vše v `electron-main.cjs` (+ CSP v `src/index.html`):
- **Minimální app menu** ✅ — jen genuinně funkční položky: File→Quit,
  Edit→Cut/Copy/Paste/SelectAll (**bez undo/redo** — app nemá document-level
  undo, role by jen klamaly), View→zoom/fullscreen, Window, (mac appMenu). Bez
  reload/devtools. App akce (New/Open/Save, módy) zůstávají v topbaru + klávesách
  (do menu se necpou — vyžadovalo by IPC most main↔renderer). Ověřeno dumpem menu.
- **Externí odkazy do systémového prohlížeče** ✅ — `setWindowOpenHandler`
  (deny + `shell.openExternal` pro http(s)) + `will-navigate` (povolí jen
  `app://`, zbytek ven). Pro budoucí About → GitHub.
- **CSP** ✅ — řešeno jako `<meta http-equiv>` v `src/index.html` (NE header), aby
  pokrylo OBA buildy (web `dist/` nemá `electron-main`). Striktní bez
  `unsafe-eval` → vyžádalo swap **`paper-full` → `paper-core`** (paper-full volá
  `new Function` při loadu; app PaperScript nepoužívá). Policy: `script-src
  'self' https://cdn.jsdelivr.net` (web tahá vendor z CDN, desktop rewrite na
  self), `img-src 'self' data: blob:`, `style-src 'self' 'unsafe-inline'`.
  Warning zmizel i v devu. Ověřeno: čistý boot + render, žádné violations.
- **Pamatování velikosti/pozice/maximized okna** ✅ — `userData/window-state.json`
  (getNormalBounds + isMaximized), `minWidth 1024` / `minHeight 640`.
- **Single-instance lock** ✅ — `requestSingleInstanceLock`; druhá instance
  fokusne první a skončí (ověřeno).

**Zbývá interaktivně ověřit uživatelem** (headless to neproklikne): demo load,
upload obrázku (`data:`), export PNG/zip (`blob:`) — kvůli CSP `img-src` cestám.

### ~~3. Ikona~~ ✅ HOTOVO (2026-05-26)
Jeden zdroj **`src/icon.png`** (512², uvnitř `src/` ať je dosažitelný přes
`app://` pro favicon) použitý třikrát: favicon (`<link rel=icon>` v index.html,
build.sh ho kopíruje do `release/web`), okno (`BrowserWindow.icon`), zabalená
app ikona (`package.json#build.icon` → electron-builder generuje platform ikony).
Ověřeno: electron-builder ho vzal (zmizelo „default Electron icon"), je v asaru,
čistý boot. **Logo `images/tileSnapLogo.png`** (630×500) zatím nepoužité — až
půjde do UI (topbar/About), přesunout taky pod `src/` (jinak ho `app://`
neservíruje).

### ~~4. About dialog (UI)~~ ✅ HOTOVO (2026-05-27)
`src/view/about.js` + topbar tlačítko `ⓘ` (`#about-toggle`, vedle loga, ve všech
módech) + `.about__*` styly v `styles/dialog.css`. Modal: název + `config.VERSION`
+ © 2026 ezzop6 + odkaz na **itch.io stránku** (`https://ezzop6.itch.io/tilesnap`,
otevře se externě přes `setWindowOpenHandler`) + rozbalovací seznam open-source
komponent (name/version/license/copyright + upstream odkaz) + závěrečná poznámka
**build-aware** přes `location.protocol === "app:"` (desktop = zabalené texty +
Electron/Chromium/FFmpeg; web = CDN, žádná redistribuce — jeden about.js ve
sdíleném `src/`). Reuse `.dialog` vizuálních tříd, ale vlastní root +
Esc handler (oddělené od `dialog.js`).
**Rozhodnutí, proč NE odkaz na GitHub repo:** repo zůstává soukromé (placený
closed-source produkt; veřejnost neuděluje právo k užití, ale source-available
podkopává prodej). About proto neukazuje zdroják — produktový odkaz = itch.io.
**Licence in-app:** atribuce je inline data v `about.js` (NE fetch souborů —
web build nekopíruje `vendor/`, takže fetch by tam selhal). Plné texty cestují
zabalené v desktop buildu (`src/vendor/licenses/`) + jsou na upstream odkazech.
`about.js#COMPONENTS` drž v sync s `THIRD-PARTY-LICENSES.md` (kanonický zdroj).

### ~~5. Verze v sync~~ ✅ HOTOVO (2026-05-26)
**`package.json#version` je teď jediný zdroj pravdy.** `make version-sync`
(prereq každého buildu) sedne verzi do `src/config.js#VERSION`. Při releasu bumpni
jen package.json (nebo `npm version x.y.z`) — config.js se dorovná sám při buildu,
needitovat ho ručně.

---

## Rozhodnutí čekající na usera

- ~~**Podpis / notarizace**~~ ✅ ROZHODNUTO (2026-05-27): **NEpodepisovat.**
  Na itch je nepodepsaný build norma; certy (Apple 99 $/rok, Win OV ~200–400 $/rok
  + HSM) až bude trakce. Build zůstává signing-ready (electron-builder config jde
  rozšířit kdykoli). Do `scrap/itch.html` přidána krátká „jak otevřít" poznámka
  (Win: More info → Run anyway; mac: right-click → Open / `xattr -cr`).
  - macOS pozn.: nepodepsaná app se NEblokuje jen „varuje" — Gatekeeper ji
    odmítne hláškou „app is damaged"; návod na stránce je proto na macu nutný.
- **GitHub Actions CI** — ODLOŽENO. Až bude potřeba spolehlivě stavět Win (bez
  wine) + Mac (bez Macu): matrix workflow ubuntu/windows/macos. macOS runner umí
  i notarizovat přes secrets.
- ~~**Branch reconciliation**~~ ✅ VYŘEŠENO (2026-05-27): větev `license` je plně
  redundantní — `LICENSE` identický, její `THIRD-PARTY` je jen starší verze, kterou
  `desktop-release` nahrazuje. Nic unikátního k záchraně → `git branch -D license`
  (lokální/nepushnutá, bezpečné). Pracovní větev přejmenována `taury-vs-elektron`
  → `desktop-release`. Zbývající git akce (smazat license, merge do master, push)
  jsou na userovi.

---

## Build & test cheat sheet

```bash
# DEV (desktop okno)
npm start                       # v sandboxu: npm start -- --no-sandbox

# DESKTOP build (→ release/<platforma>)
make app-linux                  # AppImage → release/linux  (staví se na Linuxu)
make app-win                    # Windows portable .exe → release/win  (z Linuxu CHCE wine)
make app-mac                    # macOS dmg+zip → release/mac  (JEN na macOS)
make app                        # aktuální platforma → release/<host>
make clean-app                  # smaže release/{linux,win,mac}

# WEB build (→ release/web, vendor zůstává CDN)
make build                      # = build-light
make serve                      # build + http server :8000 (servíruje release/web)
make clean                      # smaže release/web
```

## Gotchas

- **Build výstupy:** vše pod `release/<target>/` — web → `release/web`, desktop →
  `release/{linux,win,mac}` (electron-builder přes `-c.directories.output`). Celé
  `release/` je gitignored. (Dřív web→`dist/`; `dist/` se už nepoužívá.)
- **localStorage strop ~5 MB — VYŘEŠENO (2026-05-26), přes IndexedDB.** Image
  binárky (jediné objemné entry; zbytek je drobné JSON metadata) přesunuty z
  localStorage do **IndexedDB** (větší origin quota) — v `controller/storage.js`
  `images` store. Veřejné API zůstává sync (`get/has/put/delete/list`) přes
  in-memory `Map` (read layer) + IDB write-through; `await images.init()` v
  `main.js` bootu naplní Map a odmigruje legacy localStorage `image.*` → IDB.
  Funguje stejně ve webu i desktopu (jeden kód, oba mají reálný origin: http /
  `app://`). Fallback na localStorage když je IDB nedostupné (defensivní, pro
  `file://`). Ověřeno real-engine round-trip testem (perzistence/migrace/kolize)
  + čistý boot AppImage. Pozn.: drží se pořád vše v RAM (Map) — odstraní to jen
  *persistence* cap, ne paměťovou stopu (to je OK, cap byl ten problém).
- **Vendor je na dvou místech:** `src/vendor/` (lokální, pro desktop + offline)
  vs CDN odkazy v `src/index.html` (web build je nechává). `electron-main.cjs`
  je přemosťuje rewrite za běhu. Při bumpu verze knihovny aktualizovat OBĚ.
- **Sandbox:** v tomhle prostředí Electron potřebuje `--no-sandbox`; na běžném
  desktopu ne (leda chyba `chrome-sandbox` SUID → pak taky `--no-sandbox`).
- **Commity řeší user** — negitovat bez vyžádání.
