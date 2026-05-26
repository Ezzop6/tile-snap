# next.md — jak pokračovat (desktop release)

Pracovní handoff pro desktop packaging TileSnap (Electron → Linux/Win/Mac, cíl
itch.io). Plná dokumentace je v `AGENTS.md` → sekce **"Desktop packaging"**.
Větev: `taury-vs-elektron`.

---

## Co je HOTOVO

- **Layout:** app zdrojáky přesunuty do `src/`; root drží jen packaging vrstvu
  (`electron-main.cjs`, `package.json`). Dev = otevřít `src/index.html`.
- **Electron wrapper** (`electron-main.cjs`): custom `app://` protokol (ES moduly
  + stabilní origin pro localStorage), servíruje `src/`, za běhu přepisuje CDN
  `<script>` → lokální `src/vendor/*` (offline). Loguje renderer chyby do terminálu.
- **Vendored knihovny** v `src/vendor/` (offline) — dev `index.html` zůstává na CDN.
- **Build:** `package.json` build config (electron-builder, output → `release/`,
  NE `dist/`). Targety pro Linux/Win/Mac. Makefile: `make app-*`.
- **Web build** (`build.sh`/`make build` → `dist/`) přesměrován na `src/`, funguje.
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

### 2. Desktop polish (kód, většinu zvládnu bez vstupu)
Vše v `electron-main.cjs`:
- **Minimální app menu** (default Electron menu má dev věci) + **externí odkazy
  do systémového prohlížeče** přes `win.webContents.setWindowOpenHandler` +
  `will-navigate` (kvůli budoucímu About s GitHub odkazem — nesmí otevřít uvnitř okna).
- **CSP hlavička** — zbavit se security warningu + harden. Vlastníme `app://`
  handler → přidat `content-security-policy` header do Response (vše je lokální,
  takže striktní CSP je proveditelná).
- **Pamatování velikosti/pozice okna** + min velikost (AGENTS zmiňuje min 1024px).
  Teď fixní 1440×900, nepamatuje se.
- **Single-instance lock** (`app.requestSingleInstanceLock()`) — dvě okna by si
  přepisovala localStorage.

### 3. Ikona
Čeká na obrázek od usera (512×512+ PNG). Pak doplnit do `build` configu
(`"icon": "build/icon.png"`); electron-builder vygeneruje platform ikony.

### 4. About dialog (UI)
V appce (`src/view/`, použít `dialog.js`): název + `config.VERSION` + © 2026
ezzop6 + odkaz na GitHub **projekt** + odkazy na licence (`LICENSE` /
`THIRD-PARTY` / `src/vendor/licenses/`). Plán: malé „ⓘ About" v topbaru u loga.
**BLOKOVÁNO:** chybí konkrétní **URL repa na GitHubu** (LICENSE teď používá jen
profil `github.com/ezzop6`). Pozn.: pro čtení licencí přes `app://` zvážit, že
handler servíruje z `src/` — root `LICENSE` přes `app://` není dosažitelný
(buď odkaz na GitHub, nebo zkopírovat/zpřístupnit pod `src/`).

### 5. Verze v sync
`config.js#VERSION` (0.0.0) i `package.json#version` (0.0.0) — při každém releasu
bumpnout **obojí** zároveň.

---

## Rozhodnutí čekající na usera

- **Podpis / notarizace** (rozhodnutí ODLOŽENO — „rozhodnu později"):
  - macOS: bez Apple Developer ID ($99/rok) + notarizace → Gatekeeper blokuje
    („app is damaged"). Buď zaplatit, nebo shipnout s návodem (right-click → Open
    / `xattr -cr`).
  - Windows: nepodepsaný → SmartScreen „neznámý vydavatel" (na itch běžně OK).
  - Build držet signing-ready, neblokovat.
- **GitHub Actions CI** — ODLOŽENO. Až bude potřeba spolehlivě stavět Win (bez
  wine) + Mac (bez Macu): matrix workflow ubuntu/windows/macos. macOS runner umí
  i notarizovat přes secrets.
- **Branch reconciliation** — `THIRD-PARTY` na větvi `license` je zastaralý
  (nezná desktop); verze v `taury-vs-elektron` ho nahrazuje. Sloučit/cherry-pick
  je na userovi.

---

## Build & test cheat sheet

```bash
# DEV (desktop okno)
npm start                       # v sandboxu: npm start -- --no-sandbox

# DESKTOP build (→ release/)
make app-linux                  # AppImage (staví se na Linuxu)
make app-win                    # Windows portable .exe (z Linuxu CHCE wine)
make app-mac                    # macOS dmg+zip (JEN na macOS)
make app                        # aktuální platforma
make clean-app                  # smaže release/

# WEB build (→ dist/, vendor zůstává CDN)
make build                      # = build-light
make serve                      # build + http server :8000
```

## Gotchas

- **Dva výstupní adresáře:** web → `dist/`, desktop → `release/`. Neslévat.
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
