# verify.md — co ještě zbývá ověřit (desktop release)

Statické/CLI kroky jsem doklikal automaticky **2026-05-27** (souhrn na konci).
Tady nahoře zůstává jen to, co vyžaduje **interaktivní spuštění** nebo **jinou
platformu** — to z tohohle stroje (Linux, bez wine) nejde ověřit.
Kontext: `next.md` + `AGENTS.md → Desktop packaging`. Větev: `desktop-release`.

Odškrtávej `- [ ]` → `- [x]`. Pokud něco neklapne, poznač к bodu co a kde.

---

## A. Desktop AppImage — interaktivně

Spusť: `./release/linux/TileSnap-0.0.0.AppImage`
(jen v sandboxu přidat `--no-sandbox`; na běžném desktopu netřeba)

- [x] **Ikona desktop (packaging)** — ověřeno 2026-05-27 rozbalením AppImage
      (`--appimage-extract`): `usr/share/icons/hicolor/512x512/apps/tilesnap-desktop.png`
      i `.DirIcon` mají **identický md5 jako `src/icon.png`** (`1bbaa837…`), tedy NE
      defaultní Electron. `.desktop`: `Icon=tilesnap-desktop` + `StartupWMClass=TileSnap`.
      To je ikona, kterou používají launchery/docky.
- [x] (volitelné) **Runtime okenní ikona** — ověřeno 2026-05-27 (user) přes
      `xprop -name TileSnap WM_CLASS _NET_WM_ICON | head` → `WM_CLASS … "TileSnap"`
      + `_NET_WM_ICON` přítomna. Pod qtile se v titlebaru nezobrazí (volba WM, ne
      chyba); xprop potvrdil, že ji app exportuje WM-nezávisle.
- [x] **Window state** — ověřeno 2026-05-27 (user): restart appky drží velikost
      (restore z uloženého stavu funguje). Soubor je `~/.config/tilesnap-desktop/
      window-state.json` (auto-ověřeno: existuje, rozumné bounds 1906×1049).
- [x] **Electron Security Warning (Insecure CSP)** — ověřeno 2026-05-27 (user):
      v terminálu hláška CHYBÍ, čistý boot (`[did-finish-load] ok`, žádné renderer
      chyby ani did-fail-load).

## B. Win + Mac buildy — nejde z tohohle stroje

```bash
make app-win   # z Linuxu CHCE wine (tady NENÍ nainstalované) → release/win/*.exe
make app-mac   # JEN na macOS → release/mac/*.dmg + *.zip
```
- [ ] Build vznikl: `ls release/win` / `ls release/mac`.
- [ ] Ikona se propsala: v build logu **NENÍ** `default Electron icon is used`
      (= electron-builder zkonvertoval `src/icon.png` → `.ico`/`.icns`). Pokud TAM
      JE → dodat nativní `.ico`/`.icns`.
- [ ] Spuštění + chování shodné s Linuxem (demo/upload/export + menu).
      - Win: přes wine nebo na Windows.
      - Mac: right-click → Open (nepodepsané → Gatekeeper).

---

## ✅ Auto-ověřeno 2026-05-27 (pro záznam, nevyžaduje akci)

**CSP / paper-core (statická kontrola):**
- CSP `<meta>` v `src/index.html` i `release/web/index.html` — striktní, bez
  `unsafe-eval`: `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net;
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self';
  object-src 'none'; base-uri 'self'`.
- `grep -c "new Function" src/vendor/paper-core.min.js` → **0** (i `eval(` → 0).
- `src/vendor/` obsahuje jen `paper-core.min.js` (žádný paper-full).

**Build artefakty (z buildu 2026-05-26):**
- `release/web/`: `index.html` + `app.*.css` + `app.*.js` + `icon.png` + demo — OK.
- `release/linux/`: `TileSnap-0.0.0.AppImage` (~108 MB) + `linux-unpacked/`.
- asar (`app.asar`) obsahuje: `/src/icon.png`, `/src/vendor/paper-core.min.js`,
  `/src/vendor/licenses/*` (5 souborů), `/LICENSE`, `/THIRD-PARTY-LICENSES.md`,
  `/electron-main.cjs`.
- `linux-unpacked/` má `LICENSE.electron.txt` + `LICENSES.chromium.html`
  (= Electron/Chromium notices se reálně distribuují — splňuje požadavek z
  `THIRD-PARTY-LICENSES.md`).

**Verze (single-source):**
- `make version-sync` proběhl; `src/config.js#VERSION` = `0.0.0` =
  `package.json#version`. V sync.

**Už dříve ověřeno uživatelem (Linux, interaktivně):**
- CSP: žádné violations při demo / upload / export (web i desktop).
- IndexedDB: upload → záznam v `tilesetgen/images`, drží přes reload i restart appky.
- Cap test: nahráno ~53 MB (přes starý ~5 MB localStorage cap), drží po reloadu.
  V konzoli vyskočila hláška `atom_cache.cc(229) … chromium/from-privileged` —
  **benign** X11/drag-and-drop log z Chromia (ne chyba appky), žádná akce nutná.
- Export PNG i ZIP (`blob:`) funguje, bez CSP hlášky.
- Menu: File→Quit · Edit→Cut/Copy/Paste/SelectAll (bez Undo/Redo) · View · Window.
- Single-instance: druhá instance neotevře druhé okno.
