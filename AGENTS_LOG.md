# AGENTS Log — Tileset Generator

Archive of status log moved out of AGENTS.md on 2026-05-17.
AGENTS.md keeps only currently-valid spec; this file is historical reference + landing for new entries.

## Status log

- **2026-05-21, mega session:** Bundle mode + cross-project import + structural cleanup.
  - **Bundle mode** — new tab (`view/bundleMode/`) for multi-project Godot
    TileSet export. Right panel: project picker (checkbox + ↗ Open icon,
    max-height 500px scroll), bundle name input, Export ZIP button,
    Overrides section. Stage: card-style entry rows (project info + pool
    thumbs + tile/variant counts + source A/B badges + icon-only actions)
    grouped forward+reverse pairs, plus N×N terrain coverage matrix
    (directed `✓` covered, `↺` reverse-only, missing) with rotated -45°
    headers. Selection persists cross-session via `setting.bundleSelection`;
    auto-prunes deleted projects via `project:deleted` event.
  - **Combined export** (`view/export/bundleExport.js`) — snapshots live
    state, deserialises each bundled project in turn (optional swapPools()
    for reverse entries), applies bundle overrides, renders atlas PNG,
    enumerates atlas tiles + source bundle, assembles one .tres with
    deduplicated terrain_set (first-seen colour wins) + N
    TileSetAtlasSource blocks + filename collision dedup. AbortController
    + onProgress callback drive a transient progress overlay over the
    bundle stage (renders gated during export to suppress flicker).
    JSZip from CDN packages the result.
  - **Bundle Overrides** (`controller/state/bundleOverrides.js`) — singleton
    registry of globalCurve params force-applied at bundle export
    (currently outline color + width as one toggle row). Persisted via
    `setting.bundleOverrides`; texture-ops swap also extended (pools.js
    swapPools now swaps `_globalTextureOps.A/B` too — fixed reverse-entry
    bug where ops stayed on the wrong pool).
  - **Project-level pool naming + cross-project settings import.** Pool
    names (`state._poolNames.A/B`) editable per project, serialise +
    drive terrain identity in bundle export. New canvas-toolbar dropdowns
    (preview-only) "Import curve + noise" / "Import texture ops" copy a
    saved project's params over the current one via new
    `state.importCurveAndNoiseFrom` / `importTextureOpsFrom` (mixin in
    new `controller/state/importSettings.js`). Pure replace semantics —
    per-slot data + pool refs + template untouched.
  - **Bundle source bundle in tres now emitted** — `bundleExport.js`
    previously skipped source bundle rows in `.tres` even when project
    had them enabled in PNG. Added `emitSourceBundleWithIds(lines,
    sourceLayout, terrainModeStr, terrainIds, template)` export from
    tresBuilder.js (parametric terrain ids) → bundle export reuses single-
    project per-mode rules with remapped global terrain ids.
  - **CSS split.** `styles/main.css` 3612 lines → @import index. 10 feature
    files: base / layout / modes / primitives / panels / sources / curve /
    creator / bundle / export. Cascade order matters — modes is THIRD (not
    last) so feature-specific files can override its shared stage box
    rules (= bundle stretches instead of centring); !important rules in
    modes.css still win regardless. Fixed bundle stage flex-center +
    overflow bug — content jumped above viewport when card list exceeded
    stage height.
  - **bundleMode.js split.** 812-line monofile → 7-file directory
    (`view/bundleMode/{index, state, projectList, matrix, card, coverage,
    overrides, exportRunner}.js`). `renderAll` dispatcher in state.js
    (= empty fn until index.js wires real impl) avoids the projectList ↔
    matrix ↔ card cyclic chain.
  - **texOpsPanel.js split.** Canvas rendering extracted to
    `view/texOpsPreview.js` (initTexOpsPreview / paint / setActivePool /
    setViewMode / reshuffle); panel keeps only controls UI + state sync.
  - **tresBuilder.js color helpers extracted** to
    `view/export/colorHelpers.js` (FALLBACK_COLOR + rgbToHsl/hslToRgb +
    inverseColorOfTile). Same for `serialize.js` → `importSettings.js`
    (cross-project import mixin moved out, mergeOpsPool now exported helper).
  - **Performance.**
    - **rAF-coalesce** added to mainView.refresh / mapView.refresh /
      slotEditor.paint / texOpsPreview.paint — burst events (curve "Random
      all" 7×, bundle deserialize loop) collapse into one paint per frame.
    - **mainView wheel/pan now preview-mode-only** (`isActive: () =>
      getMode() === "preview"`) — previously its `preventDefault()` blocked
      native CSS overflow scroll on bundle/debug/export stages.
    - **`willReadFrequently: true`** added to every canvas getImageData
      source (textureOps impls + source loaders) — Canvas2D readback
      warnings cleared.
  - **Persistent settings additions.** `bundleSelection`,
    `bundleOverrides`, `traceVisible`, `traceRecording`, `modeTab`,
    `inputsCols` settings keys.

- **2026-05-21, refactor:** UI polish + font unification.
  - **Right-panel font hierarchy fixed.** `tex-ops__cat-title` was `lg` + bold 700
    (= bigger than its parent `panel-section__title` at `sm`). Inverted hierarchy
    rewritten so cat/op titles share `sm` size; differentiation via uppercase + colour
    + weight. Control label `curve-panel__label` dropped to `xs` (= deemphasized).
  - **Token sweep.** Replaced ~11 inline `px` font-sizes with tokens (xs/sm/md/lg);
    fixed 3× bad fallback `var(--font-size-xs, 11px)` (xs is 10px — fallback diverged).
    Remaining hardcoded sizes are display-only (large icons / placeholders).
  - **Export panel structural cleanup.**
    - `.layout-tile { border, border-radius }` removed — adjacent tiles touch
      edge-to-edge with no grid lines visible. `outline: dashed` on variants
      removed too (variants are now identified by the pattern marker).
    - `.layout-grid__full { gap: 0 }` (from 6px). `.template-frame` div + CSS
      deleted entirely (visible frame around tiles dropped).
    - Triangle group marker → **`buildPatternMarker`**: square N×M grid mirroring
      `slot.array`, "on" cells get the per-group hue, outline = high-contrast frame
      (= readable on any tile colour). Doubles as colour + pattern preview.
    - Selection indicator → **`buildSelectionFrame`**: sibling grid item with
      `border + box-sizing: border-box`. Replaces `outline` on `.layout-tile`
      (outline-offset bled onto neighbours when tiles touch + got clipped behind
      neighbour z-index).
    - Variants section deleted; slot meta moved into Preview section header,
      Variants count slider into a new `#export-preview-controls` strip below the
      preview canvas, 🎲 randomize-all moved into Main section header.
    - Whole Preview section is `hidden` until a slot is selected (= no idle
      placeholder canvas).
    - Variability section's per-param min/max numeric inputs dropped — sliders only.
    - Pools list → grid of texture-on-top + weight-below cells (`auto-fit
      minmax(56px, 1fr)`). Master entry (`is-master`) gets accent-coloured outline
      around its thumb. Tags ("master" / "var N") dropped from visible text;
      tooltips preserve the labels.
    - `applyPoolTextureOps(srcCanvas, poolKey)` exported from `view/export/tile.js`;
      `buildSourceBlock` + `view/export/png.js` source loop pipe each bundle tile
      through the active pool's texture-ops chain so PNG export + Layout preview
      match the main canvas exactly.
  - **Layout toggles.** Top-left ☰ (`#toggle-left-panel`) hides/restores the left
    panel (saves last sizes + hides `.gutter[0]`). Texture · global header ⛶
    (`#tex-ops-expand`) collapses the middle workspace + hides `.gutter[1]`,
    giving the right panel almost the full screen. `Split.js#minSize` is now
    `[0, 0, 240]`; `.panel`/`.main-area` CSS `min-width` overridden to 0 so the
    sizes ride entirely on Split.js's minSize array.
  - **Selected slot section.** No longer collapsible — section starts `hidden`
    and `slotEditor/index.js#rebuild` toggles `section.hidden = !slot`. Reset
    button no longer needs to track `disabled`. CSS: `.panel-section[hidden]
    { display: none }` (override required because `display: flex` ties with
    `[hidden]` on specificity, author wins). `body.texture-active
    #slot-editor-section { display: none !important }` keeps it hidden in
    Texture mode even when a slot is selected.
  - **Project rename bug fix.** `projects.rename` updated `entry.name` only —
    `entry.data.projectName` lagged, so reload showed the old name. Fix syncs
    both; `projects.load` self-heals legacy entries (forces
    `data.projectName = entry.name`).

- **2026-05-21, feature:** Global inputs library (cross-project source storage).
  - **`tilesetgen.v1.inputs-library`** storage key — array of `{ id, name,
    tileSize, hash }`. Holds metadata; image binaries continue to live in
    content-addressed `images` store. Migration scans every existing project's
    legacy `inputs` array and seeds the library on first read.
  - **`state.loadInputsLibrary()`** (idempotent) — hydrates library specs into
    `state._inputs` via `hydrateInput(spec)` (image-from-dataURL + splitIntoTiles).
    Called once at app start (after `applySettingsToState`) and again at the
    end of `state.deserialize` so legacy-migrated entries hydrate immediately.
  - **`addInput` / `removeInput` / `updateInput`** sync the library entry alongside
    `state._inputs`. `serialize()` no longer writes an `inputs` field — projects
    carry only pool refs / overrides. `deserialize` ignores `obj.inputs` for state
    population (legacy field is migrated to the library, then `loadInputsLibrary`
    hydrates any new specs).
  - **Effect:** every project sees every uploaded source on load. Creating a
    fresh project doesn't blank the inputs panel anymore.
  - `cleanUnusedImages()` walks both the library AND the legacy project-blob
    `inputs` arrays so library-only references aren't classed as orphans.

- **2026-05-21, refactor:** `templateCreator.js` (776 lines) → `view/templateCreator/`
  (10 modules). Same public exports (`initTemplateCreator`, `resetCreatorView`,
  `looksLikeTemplateJSON`, `importTemplateFromObject`); internal split:
  - `index.js` (init orchestration) · `refs.js` (DOM + sync flags) ·
    `guards.js` (`ensureEditable` / `commitInPlaceEdit`) · `layout.js`
    (data utils: `patternDims`, `slotAt`, `makeEmptyArray`, `isStageActive`,
    `updateMeta`) · `toolbar.js` (name/cellShape/delete + `paramCtx` + `fullSync`) ·
    `resize.js` (`onResize` + button factory) · `slotBlock.js`
    (`buildSlotBlock` + `refreshSlotOverlay`) · `interaction.js` (paint state +
    handlers) · `render.js` (editor grid layout math) · `io.js`
    (snapshot/export/import/save).
  - **`shape.renderOverlay?(block, slot, cellSize, rows, cols, template)` hook**
    added to cellShape contract. `overlayBridges` (saddle-bridge SVG, was inline
    in templateCreator) moved into `cellShapes/square.js#renderOverlay` so future
    shapes can declare their own decorative overlays without touching the editor.
    `slotBlock.js` just calls `shape.renderOverlay?.(...)`.

- **2026-05-21, feature:** Texture · global panel — registry-driven per-pool
  bitmap pipeline. New right-panel section with two-level UI (categories →
  ops), 11 ops in 5 categories, per-pool params (A / B independent), sticky
  preview in wide mode.
  - **`view/render2/textureOps/registry.js`** — single source of truth.
    `TEXTURE_OPS = [{ name, label, category, apply(c, k, p), controls: [...] }]`
    drives state defaults (`buildOpDefaults()`), the slotComposite source-bitmap
    chain, and `view/texOpsPanel.js` UI generation. Adding a new op = one entry +
    one `<opName>/{index,impl}.js` directory. **`TEXTURE_OP_CATEGORIES`** array
    defines visible groups (`edgeMatch`, `edgeAccent`, `color`, `detail`, `effects`).
    `controls` schema supports `slider` + `select` types.
  - **Op directories** under `view/render2/textureOps/`:
    `autoTileable` (mirror/average edge blend, width%/mode/axis),
    `boundarySnap` (pixel-exact match, width%),
    `edgeColorAbsorb` (band fades into border-average colour, width%/strength%),
    `innerShadow` (gradient darken or lighten band, width%/opacity%/polarity),
    `colorAdjust` ("RGB tonal": brightness/contrast/gamma/R/G/B),
    `hslAdjust` (hue/saturation/lightness in HSL space),
    `hslJitter` (per-block random HSL perturbation, hue±/sat±/light±/scale),
    `gaussianBlur` (canvas-filter blur in edge band, width%),
    `sharpen` (unsharp-mask, amount/radius/threshold),
    `noiseOverlay` (deterministic grain, amount/type/scale),
    `gradientOverlay` (linear darken/lighten across 4 directions, strength/direction/polarity).
    Each op caches per `(srcCanvas, poolKey, ...params)` via WeakMap; identity-param
    short-circuit returns the input canvas unchanged.
  - **`state._globalTextureOps = { A: buildOpDefaults(), B: buildOpDefaults() }`**
    in `controller/state/params.js`. API: `getGlobalTextureOp(poolKey, opName)` +
    `setGlobalTextureOpParam(poolKey, opName, key, value)`. Event:
    `texture-ops:changed { poolKey, op, key }`. Serialized in `serialize.js`
    via `cloneOpsPool` / `mergeOpsPool` (= forward-compatible: older saves
    missing new ops get defaults; unknown keys are dropped).
  - **`view/texOpsPanel.js`** — UI host. Builds the panel from registry, wires
    sliders/selects, syncs controls when active pool switches A↔B. Per-category
    reset button (↺ in cat-header) writes defaults for that category's ops in
    the active pool. Panel header reset clears every op in the active pool.
    Two-mode preview: Tiles (3×3 raw pool bitmaps, adjacent — width 100% no gaps)
    or Preview (snapshot of `.main-template` canvas, aspect-matched). View-switch
    + pool-switch + 🎲 shuffle in toolbar.
  - **Wide-mode auto layout.** `ResizeObserver` toggles `.tex-ops.is-wide` when
    panel width > `window.innerWidth / 2`. In wide mode: grid-template-areas
    splits panel into `toolbar` (full row) + `stage` (left half, sticky to
    scroll top) + `ops` (right half, CSS columns with `column-width: 260px;
    column-fill: balance` — auto-balances category heights between columns;
    `break-inside: avoid` keeps categories intact). Categories + ops
    auto-expanded in wide mode (CSS overrides `is-collapsed`); collapse
    state is preserved for the return to narrow.
  - **Pipeline chain** in `view/render2/slotComposite.js#sourceBitmap`:
    iterates `TEXTURE_OPS`, applies each op's `apply` fn in order. Same chain
    re-used in `view/export/tile.js#applyPoolTextureOps` for export Layout +
    PNG bundle sources.
  - **Resolution-independent params** — all `width` values are `widthPercent`
    of shorter source dim. 10% on a 32px tile = 3 px, on 256px = 26 px — same
    visual.

- **2026-05-21, feature:** Layout / mode topbar overhaul.
  - **`config.js`** (project root) — `export const DEBUG = true;`. Single
    app-wide flag, dependency-free. Disables in-progress features when off:
    the legacy Map tab (now relabelled **Debug**) hides, `cellShapes/triangle`
    + `square`'s `Sides` terrain option get `disabled` attribute. Future
    incomplete features should opt into the same flag.
  - **`Texture` mode tab** added between `Template` and `Debug`. On enter,
    saves Split sizes + hides `.gutter[1]`, sets sizes to
    `[left, 0, 100-left]` (left panel stays at its current width because
    Sources / Inputs editing remains useful in Texture mode). Restores on
    exit. Independent of the standalone ☰ / ⛶ toggles — all three can
    coexist without state corruption.
  - **`modeTabs.js`** default mode flipped from `map` → `preview` (`map`
    is debug-only now). `texture` added with body class `texture-active`.

- **2026-05-17, feature:** Triangle cellShape (pinwheel) + per-shape strategy split.
  - **`view/cellShapes/` strategy modules** — `square.js`, `triangle.js`, `index.js` registry. Each shape exports:
    `defaultValue(draft)`, `fullValue(draft)`, `slotDims(patternN, draft)`,
    `hitTest(el, e, draft)`, `nextValue(cur, mode, region, draft)`,
    `applyVisual(el, value, draft)`, `valueEquals(a, b)`, `renderParams(host, draft, ctx)`.
    Adding a new shape = drop one file + 1 line in `index.js`. `templateCreator.js` orchestrates;
    žádná shape-specific logika tam nezůstala (paint, hit-test, visual, Settings UI).
  - **Triangle pinwheel geometry** — per slot = 1 cell, cell value = array `[center, w0…w(N-1)]` (length 1+N).
    Vizuálně: conic-gradient s N wedges + linear-gradient center square + SVG divider overlay
    (N corner-to-center lines + center square outline, `vector-effect: non-scaling-stroke`).
    Hit-test: central square (CENTER_FRACTION = 0.4) → `"c"`; outside → angular bucket via `atan2(rx, -ry)` →
    wedge index 0..N-1 (CW from north).
  - **Cardinal N** (= triangle subdivisions): options 4/8/16/32. Default 4. Settings:
    `triangleCardinals` on draft / template. Each step halves wedge angle (= more wedges of smaller angle).
    Switching N is destructive (wipes content; confirm dialog if user has anything painted) — array shape
    changes, no clean mapping. `from -wedgeWidth/2 deg` rotates conic so wedge 0 centers on north.
    **Render fallback** (still in `grid_outline.js`): any non-zero / any-element-truthy array = cell "on",
    so triangle templates render as full squares until the diagonal-edge walker lands.
  - **Per-shape settings UI** — each shape's `renderParams(host, draft, ctx)` builds its own controls
    into a single `#creator-shape-params` host div in Settings. Square = Pattern input (range 2-7,
    UI-clamped). Triangle = Cardinal `<select>` (4/8/16/32). Cell shape `<select>` populated from
    `listCellShapes()` so it auto-picks up new shapes. ctx = `{ onChange, hasContent, confirm,
    makeEmptyArray }` — shared concerns templateCreator owns, shape calls them.
  - **`SLOT_MAX_PX = 240`** in `renderEditor` cell sizing — slot visual size constant across modes
    (square 3×3 → 80 px/cell, triangle 1×1 → 240 px/cell). User sees same physical slot footprint
    regardless of cellShape.
  - **Drag-paint within cells** — added `mousemove` listener on each cell + `lastPaint = {el, region}`
    tracker that no-ops same-region moves. Square mode unaffected (region always `"*"`); triangle drag
    flips bit of each region (center + N wedges) crossed.
  - **Persistence** — `cloneTemplateDraft` + `draftToTemplate` deep-clone cell values
    (`Array.isArray(v) ? v.slice() : v`) so array cells don't alias across drafts. `normalize` and
    `saveUserTemplate` in `templates/index.js` propagate `cellShape` + `triangleCardinals`. Legacy
    numeric triangle data (bit-packed nibble from earlier impl) coerces to array via
    `ensureArray(value, cardinals)` on render.
  - **CSS** — `.curve-panel__field[hidden] { display: none }` rule added because UA `[hidden]` was
    losing on tie with `.curve-panel__field { display: grid }` (= author wins on equal specificity).
    `.creator-grid__cell` has `position: relative` + `overflow: hidden` to anchor + clip the SVG divider.
  - **Open / next:** proper triangle renderer — new `core/cellShapeRenderers/triangle.js` (or extension
    to `grid_outline.js`) that walks perimeter through center + wedges, produces `paper.Path` with mixed
    axis-aligned + diagonal segments. Dispatcher in `buildSlotOutline` (templateRenderer.js) branches by
    `template.cellShape`. After that, Cardinal N>4 generates more wedge boundaries in the outline.

- **2026-05-17, feature:** Pan/zoom in template creator via shared Stage.
  - **`templateCreator.js`** mountuje `createStage(canvasEl, { fitToContent: false, zoomOrigin: "center", isActive: isStageActive })`. Po každém `renderEditor()` (resize, paint, dim change, +row/+col) zavolá `stage.setContent(editor)` aby transform přežil rebuild. `fitToContent: false` — cellPx auto-fit logika v renderEditor zůstává, Stage layeruje user wheel zoom navíc.
  - **Reset view:** export `resetCreatorView()` delegates do `stage.resetView()`. `main.js` view-reset handler rozšířen o `creator-active` branch (předtím jen export-active vs preview).
  - **CSS:** `body.creator-active #view-reset { display: none }` rule odstraněn — tlačítko teď viditelné i v creator mode protože dává smysl (mass pan/zoom funguje).
  - Cell click/paint handlers nejsou ovlivněné — DOM hit-test funguje natively přes CSS transform. Stage's middle-mouse pan a creator's LMB/RMB paint button-conflict nemají (různé `e.button` hodnoty).

- **2026-05-17, refactor:** Stage chrome + checker bg + flat export rail (3 unifications).
  - **Shared `view/stage.js` (~165 ř.):** `createStage(host, opts)` extracts pan/zoom + auto-fit + middle-drag + view-reset that mainView a export panel before had as 2 separate implementations (~340 ř. total). Opts: `fitToContent`, `zoomOrigin`, `minZoom/maxZoom/wheelStep`, `isActive` gate, `onNoisePause` callback. API: `setContent`, `setContentSize`, `resetView`, `displayScale`, `isPanning`, `clientToContent`, `destroy`.
  - **`mainView.js`** spadl z 261 → 135 řádků. Lokální zoom/fit/pan vars + handlers pryč; stage spravuje. Hit-test používá `stage.clientToContent()`. `resetMainView()` delegates to `stage.resetView()`.
  - **Export panel:** `panZoom.js` (80 ř.) smazaný. `xs.exportZoom/Offset/Panning` state odstraněn z `_state.js`, nahrazen jedním `xs.stage` ref. `layout.js` po každém re-renderu volá `xs.stage.setContent(grid)` aby Stage re-attached transform na fresh `.layout-grid__full`. `isActive()` propagated do Stage's `isActive` opt — wheel uvnitř inactive stages se neaktivuje.
  - **Checker bg sjednocen:** všechny tři stages (`.main-stage`, `.export-stage`, `.creator-canvas`) + `.export-preview canvas` používají shared `--checker-bg` token (`styles/tokens.css`). Jeden `conic-gradient` tvořící 4 alternující quadranty → tiles do klasického square checkerboardu. Pure square (ne diamond) přes `0/25%/50%/75%/100%` stops. Kontrast `#353535` vs `#1e1e1e` (~23 levels lightness) → vidět na první pohled. Map overlay zachován solid (záměrně — info widget, distinkce od main canvas).
  - **Flat export rail:** Outer "Export · variants" wrapper `<section>` + `.parameters` wrapper div + 4× `.export-group` inner blocks NAHRAZENO 4 sibling `<section class="panel-section panel-section--fixed" data-mode="export">` přímo v `panel--right`. Každý reuse `.panel-section__header--collapsible` (= shared generic handler v main.js — žádný per-mode click delegation needed pro collapse) + `.curve-panel` body (= identický s preview Curve/Noise). Net: ~50 řádků CSS pryč, `.export-group*` třídy úplně smazané, `xs.exportGroupCollapsed` Set pryč (collapse persist v DOM přes `.is-collapsed`). Žádný extra padding/wrapper — visuálně identický s preview rail.
  - **Left panel padding align:** `.pool-rows` + `.input-card` margin horizontálně sjednoceny na `var(--space-3)` (12px) aby matchnuly `.curve-panel`. Levý + pravý panel-section bodies teď sit at stejném indentu od edge.
  - **mainView render:** `transparentBg: true` v `renderTemplate` call → stage checker prosvítá pixely co nejsou pokryté sources. Stejný kontrakt jako export tiles.
  - **`addToPool` deduplicates:** silent reject pokud `(inputId, tileCol, tileRow)` už v poolu existuje. `+` button v sourcePanel disabled pro selected tile co je už v poolu. Žádný visible noise vs random distribuce.
  - **`randomizeSlotPoolOverrides(key)`:** novou metodu state — pro každý slot v aktivní template hodí `Math.random()` přes pool, uloží override. Index 0 (master) collapsuje na `null` (sémanticky shodné — fallback na master), což dropdown UI ukazuje jako "master (default)". 🎲 button per pool v sourcePanel. Disabled pro pool.length < 2 nebo žádné sloty.

- **2026-05-17, feature:** Multi-project storage + settings split + template library.
  - **`controller/storage.js`** — backend-agnostic facade (`projects`, `templates`,
    `settings`, `storageUsageBytes`). localStorage backend now; API narrow
    enough for IndexedDB swap later. Auto-migrace ze starého `tileset.project`
    klíče do prvního entry manifestu.
  - **Settings split:** `state.serialize()` už nevrací `renderMode`,
    `mapVisible`, `renderFreeze` — ty jsou v `storage.setting.*` a
    perzistují mimo project blob (= switch projektu nemění user prefs).
    `controller/settings.js` se stará o boot + listener wiring.
  - **Topbar project combo:** `<input>` jméno projektu nahrazen
    read-only `<button id="project-name-display">` (= zobrazuje aktivní
    name, klik otevře dropdown). Vedle něj chevron tlačítko. Dropdown
    (`view/projectPicker.js`) má: rename input nahoře (jediné editovatelné
    místo pro jméno), `+ New project` / `Delete current` actions, seznam
    saved projektů s relativním časem a kliknutím-na-load, footer s usage.
    CSS přepnutý z `hidden` attributu na `.is-open` class (display: flex by
    overridoval hidden).
  - **Templates v storage:** builtin (= Blob-16, Blob-47) jsou read-only z
    kódu, user-saved jdou do `templates.<id>`. `listTemplates()` merge,
    `templateRegistry` EventTarget pro live-refresh dropdownů.
    Canvas-toolbar `<select>` má dvě `<optgroup>` (Built-in / User).
  - **Template creator integrace:** vstup do Template módu seedne draft
    ze `state.template` (= "propojení" — user tweakuje co vidí), místo
    z prázdného 3×3. Nový "Load from…" select s {↻ Current preview,
    + Blank, builtin, user} options. Save-to-library detect builtin id
    collision → confirm "Duplicate as 'X (copy)'". Po Save volá
    `state.refreshTemplate(fresh)` — in-place update pokud stejné id/layout,
    jinak full setTemplate switch. Delete tlačítko v creator toolbaru
    (nikde jinde — v preview módu nedává smysl).
  - **Drag&drop JSON router:** main.js sniff `looksLikeTemplateJSON(obj)`
    → routne na `importTemplateFromObject` (+ auto-switch do Template
    módu) nebo na `loadProjectFromObject`. Template má importní tlačítko
    i v creator toolbaru.
  - **Toast notifications:** `view/toast.js` lehoučký bottom-right stack
    s fade-in/out, success/info/error kinds. Save, import, delete,
    quota errors → toast místo `alert`.
  - **Save button label:** dynamický — "Save as new" když je projekt
    importovaný / nový (= `activeProjectId === null`), jinak "Save"
    (= overwrite existing entry).
  - **Open** — viz TODO sekce výš: IO toky mezi topbar / creator /
    export panelem mají překryvy a nejasné labely; čeká redesign.

- **2026-05-16, refactor:** Smart pack = minimum-area s multi-shape skupinami.
  - **Bylo:** smart packoval každou skupinu jen jako 1×N (row) nebo N×1 (col) a optimalizoval na target aspect ratio. Aspect slider byl matoucí.
  - **Teď:** každá skupina má seznam candidate rectangle shapes (1×N, N×1, plus near-square w×h s ≤ 25% waste). Packer projde každý outCols od t.cols nahoru, pro každý zkusí placement; vybere kombinaci s **minimální plochou** (outCols × outRows), tiebreaker = nejblíž square.
  - **Aspect UI dropnut.** State `_exportTargetAspect` zachován pro backward-compat starých snapshotů, ale algoritmus ho nepoužívá.
  - **Group shape `{ w, h, dir }`** — `dir: "row"` (1×N), `"col"` (N×1), `"block"` (w×h s row-major flow). `variantCellInGroup(g, idx)` helper sjednocený mezi renderLayout + runExport.
  - Block dir umožní velkým skupinám packnout do awkward cornerů co by strip-only packer nechal volné.

- **2026-05-16, ui:** group marker = always-on per-group hue + black outline.
  - Žluto-černý jednotný triangle (předchozí iterace) ztrácel info o tom který variant patří ke kterému source.
  - **Teď:** marker triangle vždy viditelný (= `placeTile` přidá marker pro každý tile ve skupině, ne jen pro selected). Outer triangle pure black (visibility outline), inner triangle = per-group hue (golden-angle HSL, 85 % sat, 60 % light, set inline přes `--slot-group-color`).
  - Group identity = barva trojúhelníku (každá source má unique hue). Černý outline garantuje visibility na light i dark tile.
  - `slotGroupColor` helper + `colorBySlotIdx` Map vrácené z předchozího clenup pass.

- **2026-05-16, ui:** group marker triangle = one shape, dva kontrastní tóny.
  - Per-group hue (`slotGroupColor` HSL) vyhozen → každá active group měla jiný odstín ale uživatel chtěl unifikovaný marker viditelný na čemkoliv.
  - **Triangle (jeden druh):** outer 18px tmavý (`#111`) + inner 12px světlý (`#fff`) inset o 2px. Dvě pseudo-elementy `::before` (outer) a `::after` (inner) na `.tile-group-marker` divu. Kontrast garantuje visibility na light i dark tile.
  - Cleanup: `slotGroupColor`, `colorBySlotIdx`, `--slot-group-color` CSS var pryč. `slotHasVariants` Set nahradil mapu pro check zda selected slot má group.

- **2026-05-16, ui:** group indicator = corner triangle (žádný border shift).
  - **Bylo:** `.has-variant-group` přidávalo 2px colored border na canvas → měnilo effective velikost tilů (box-sizing border on canvas posunul sousedy o 1px).
  - **Teď:** sibling `<div class="tile-group-marker">` placený v same grid cell jako tile canvas. CSS pseudo `::after` kreslí 10×10 px right-triangle v top-right rohu (border-trick). Canvas size netknutý. Pointer-events off na markeru, tile pod ním zůstává klikatelný.
  - Sibling pattern (ne `::after` přímo na canvas) protože canvas je replaced element a pseudo-elementy se na něm nerenderují.
  - `is-selected` žlutý outline na canvasu zachovaný — slouží jako "selected within group" indikátor.

- **2026-05-16, ui:** group colour jen pro selected group + subtle template frame.
  - **Bylo:** každý template tile s variants měl colored border permanent → vizuálně hodně, hlavně u většího počtu skupin. Source a variants splývaly.
  - **Group color teď gated by selection:** `activeGroupIdx = state.selectedSlotIndex` (pokud má variants). Pouze tiles téhle group (template + jeho varianty) dostanou colored border (`--slot-group-color` + `.has-variant-group`). Ostatní groups plain. Klik na slot → jeho group se rozsvítí; klik mimo → vše tlumené.
  - **Template frame:** absolutně-pozicovaný `<div class="template-frame">` overlay v `.layout-grid__full` (= `position: relative`). 1px `--color-border` rámec s 3px halo okolo template area. Pointer-events none. Tells "tady je source, mimo jsou variants" bez vlivu na grid layout.
  - **`.layout-grid__full { position: relative }`** anchor + CSS rule pro `.template-frame`.

- **2026-05-16, refactor:** layout = SINGLE CSS grid + Smart 2D bin-pack.
  - **Bylo:** template a variants byly dva separátní CSS gridy s gap 6 vs 8 px → permanentní drift napříč hranicí. Smart navíc pakoval jen "below template" → pravý strip vedle template zůstával prázdný i když by se tam vešel.
  - **Refaktor renderLayout:** jeden CSS grid (`.layout-grid__full`) pro celý output. Template tiles na (slot.col, slot.row), variant tiles na (col, row) co vybral 2D packer. Stejná column rhythm pro všechny cells → pixel-perfect alignment, žádný drift.
  - **Smart 2D packer (`smartPack2D`):** scan outCols od t.cols nahoru; pro každý try greedy row-major placement, zkoušet horizontal 1×N pak vertical N×1. Pick (outCols, outRows) s nejmenším `|log(ratio / target)|`. Groups stay together — buď jako 1×N (`dir=row`) nebo N×1 (`dir=col`). Variants teď zaberou jak pravý strip vedle template, tak prostor pod ním.
  - **Single `g.dir`** v group placement (row | col) — sjednocené pro smart i legacy down/right modes. renderLayout + runExport sdílí stejnou conversion `(g.col + v - 1, g.row)` nebo `(g.col, g.row + v - 1)`.
  - **CSS cleanup:** `.layout-grid__template` + `.layout-grid__variants` rules vyhozeny (už neexistuje sub-grid hierarchy). Jeden `.layout-grid__full { display: grid; gap: 6px }`.

- **2026-05-16, fix:** layout grid alignment — variant tiles teď přesně align s template gridem.
  - **Bylo:** `.variant-group` wrapper měl 2px border + 4px padding okolo svých tiles → group's outer width != span N grid columns. Auto-sized columns v `repeat(N, auto)` se navíc resolvuly per-cell content, takže template grid a variants grid drifted relative to each other.
  - **Fix:**
    - Vyhozený `.variant-group` wrapper z DOM i CSS. Variant tiles placene přímo do `.layout-grid__variants` jako grid cells přes inline `gridColumn` / `gridRow`.
    - Group color identity = per-tile colored border (`--slot-group-color` set inline + `.has-variant-group` class). Visible: template tile + jeho varianty mají stejný barevný border.
    - Oba grids (`.layout-grid__template` + `.layout-grid__variants`) používají **fixed pixel column width** `repeat(N, ${LAYOUT_TILE_DISPLAY_PX}px)`. Žádné `auto` sizing → cells align pixel-for-pixel napříč gridy.
    - Smart mode má vlastní `flex-direction: column` CSS rule (předtím chyběl, smart layout fallnul na default row).

- **2026-05-16, feature:** Smart layout (aspect-target wrap) — default direction.
  - **Direction enum** rozšířený na `"smart" | "down" | "right"`. Smart je default; down/right zůstávají jako legacy. State key `_exportTargetAspect` (0.25..4, default 1.0). Serialize round-trip.
  - **`computeLayout(t, slotsWithVariants)`** v `exportPanel.js` vrátí `{ mode, groups: [{slotIndex, col, row, length}], outCols, outRows }`. Smart mode: scan max-row-width W from `maxGroup` do `totalVariants`, pro každý spočítat `wrapGroupsToWidth(counts, W)` a vybrat W kde `|log(outCols/outRows / target)|` je nejmenší (log scale = symmetric). Groups stay together — group bigger than W gets own row.
  - **`renderLayout`** + **`runExport`** sdílí stejnou layout funkci → vyžaduje preview matchne PNG byte-for-byte. Smart mode v CSS gridu používá explicit `gridColumn: span N / gridRow: M`; down/right zůstává flex flow.
  - **UI:** Direction select má 3 options (Smart / Down / Right). Když Smart, ukáže se další field "Aspect" se slider + editable input (range 0.25..4 step 0.05).
  - **Custom DnD** layout (per uživatel) odložen — bigger feature, samostatná story.

- **2026-05-16, feature:** template draft persistence — uloží se s projektem.
  - **State:** `_templateDraft = { name, rows, cols, slotGrid }` (default null). Getter/setter + event `template-draft:changed`. Serialize/deserialize round-trip.
  - **Deserialize** dělá deep-ish clone (`cloneTemplateDraft`) aby editor mutating in-place nepoison-l loaded snapshot.
  - **`templateCreator`** používá local `let draft` co je live reference na `state.templateDraft`. Mutace per cell paint / resize / name change jdou přímo na ten objekt (silent, žádné eventy = no overhead) — serialize captures latest. Dim change přes `state.setTemplateDraft(newDraft)` fires event → re-render.
  - **Listener `template-draft:changed`** picks up new reference po project load → re-pointuje local `draft`, re-renderuje pokud je creator tab active.
  - Save/load/import projekt teď zachová celý draft (jméno, dims, layout, every painted cell).

- **2026-05-16, feature:** topbar restructure — IO group s ikonami + 3 stage mode tabs.
  - **Topbar layout** (4 groups, space-between):
    1. Project name (left).
    2. **IO group** s ikonami: 💾 Save, 📂 Load, ⬇ Export, ⬆ Import. Sjednocený `btn--io` styling — pill pozadí, kompaktní.
    3. **Mode tabs** (Preview / PNG / + Template). Active tab má accent fill. Klik přepíná body class. Žádné Exit buttons v jednotlivých stages — návrat = klik na Preview tab.
    4. Render mode + Freeze (right).
  - **`view/modeTabs.js`** = single source of truth pro mode state. `getMode()`, `onModeChange(fn)`, `setMode(mode)`. Toggles `body.export-active` / `body.creator-active` mutually exclusive. Preview = no class.
  - **Template creator inline** (no modal). Klik na "+ Template" tab nasází default draft (3×3 pattern, 1×1 layout). Toolbar má teď inline: Name input, Rows input, Cols input, Export JSON button. Změna Rows/Cols regeneruje draft (destruktivní reset, confirm jen pokud user už něco namaloval). Wizard modal HTML smazán.
  - **`exportPanel` enter/exit** funkce smazány — místo nich `onModeChange("export")` → renderAll. `btn-export-png` / `export-exit` handlery pryč. Escape handler pryč (mode switch je tab klik).
  - **`templateCreator` openWizard/closeWizard/onCreate/exitStage** smazány. Modal-related DOM lookups pryč. Mode-tab handler seeds draft pokud neexistuje.

- **2026-05-16, ui:** editovatelné value field i v export panelu (variability, variant count, per-param min/max).
  - Stejný pattern jako curve / noise — `<input type="number">` místo `<span>`. Commit na `change`. Slider drag updatuje input live.
  - Per-param min/max teď ukazují **magnitudu** (0..100 = % z variability), ne signed effective delta. Sign je implicitní z toho, kterého inputu se týká ("min" = negative, "max" = positive). Vyhozené `formatDelta` helper.
  - Variant count + variability mají editable inputs s clamp na slider range.

- **2026-05-16, ui:** editovatelné value field vedle všech curve/noise sliderů.
  - **Bylo:** `<span>` jen zobrazoval. **Teď:** `<input type="number" class="curve-panel__value--editable">` — user může tahem slideru NEBO typeováním do inputu nastavit hodnotu. Sliders i inputs jsou sync přes shared `syncWidgets(key, slider, valueEl, state01)` helper.
  - **Outline slider** přepnut z `min=0 max=100 step=1` na `min=0 max=10 step=0.1` → slider value = px přímo (žádné mapování × 10). uiToState pro outline `value / effectScale (=10)`, pro ostatní `value / 100`.
  - **CSS** `input.curve-panel__value--editable` — kompaktní 44px wide, mono font, accent border on focus. Native browser spin arrows skryty (přiliš noisy v tight row).
  - **Commit timing:** input firenuje `change` event (= Enter / blur), ne `input` (= každý keystroke), aby partial typing jako "-" nebo "0." nesnap-l slider na 0.
  - **`formatValue` helper** vyhozen, nahrazen `uiFromState` / `uiToState` (= explicit slider↔state conversion bez stringového format kroku).

- **2026-05-16, fix:** outline byl po smooth-mode exportu zúžený.
  - **Bug:** smooth-mode export renderuje na `2× native` a pak downsampluje. Outline width je v ABSOLUTNÍCH pixelech (`owPx = ow × 10`), takže 5 px slider → 5 px outline v internal renderu → po `÷2` downsamplu = 2.5 px v PNG. Preview ukazoval 5 px (renders at native), export 2.5 px. Inkonzistence.
  - **Fix:** `renderTemplate` přijme `pxScale` opt, propaguje do `drawSlotComposite` který násobí `owPx × pxScale`. Smooth export passuje `pxScale: 2` → outline kreslí na 10 internal px → downsample na 5 px native. Preview a export teď match.
  - Ostatní params (smoothness, wave, inflate, noise) jsou relativní k cellu / slot — scalují automaticky a žádnou úpravu nepotřebují.

- **2026-05-16, fix:** export PNG nereflektoval pixel/smooth.
  - **Root cause:** v exportu se vše renderovalo na native slot size a pak kopírovalo 1:1. Při 1:1 drawImage `imageSmoothingEnabled` nemá vliv (smoothing se aplikuje jen při scaling). Source bitmapy v obou módech vyšly byte-identical, jediný rozdíl by mohl být v Bezier strokes (snap on/off) — pro většinu obsahu invisible.
  - **Fix:** smooth mode renderuje preview canvas na `2× native` (`renderScale = 2`). `out` canvas je stále na native (= výsledné PNG dims), takže každé `drawImage(previewV, src=2x, dst=1x)` provede bilinear downsample = bakes AA do exportovaných bytů. Pixel mode zůstává 1× → crisp 1:1.
  - `ctx.imageSmoothingEnabled = isSmooth` + `imageSmoothingQuality = "high"` na out canvasu.

- **2026-05-16, ui polish:** panel-section--grow + render mode flow + slot↔variant color coding.
  - **`.panel-section--grow` modifier** (CSS `flex: 1 1 auto; min-height: 0`). Aplikováno na Selected slot (preview mode) a Export · preview (export mode). `:last-child`-based grow nefungoval kvůli data-mode hiding sourozenců — explicit class řeší.
  - **Export preview canvas auto-fit:** `renderPreview` počítá display size jako `min(availW, availH)` z `previewEl` clientWidth/Height. ResizeObserver na previewEl triggeruje re-render při dragu panelu.
  - **Render mode (Pixel/Smooth) propaguje do export tiles:** `buildSlotBlock` volá `applyRenderModeClass(canvas)` → canvas dostane `.render-pixel` nebo `.render-smooth` třídu → CSS `image-rendering` se aplikuje. Vyhozené hardcoded `image-rendering: pixelated` z `.layout-tile` a `.export-preview canvas`. Listener `render-mode:changed` triggeruje renderLayout + renderPreview v export modu.
  - **Slot↔variant color coding:** sloty s variantami dostanou deterministický unique color (golden-angle hue per index). Template tile s variantami má colored border (2px solid), variant group wrapper má stejný color border + padding. Sloty bez variant zůstávají bez color (žádné visual noise). CSS var `--slot-group-color` setnutá inline.

- **2026-05-16, feature:** per-variant seed offset → reroll one tile bez ovlivnění ostatních.
  - **Use case:** user generuje N variants, jedna se nepovede. Místo měnit global seed (= reroluje vše) ovlivní jen tu jednu.
  - **`variantRng(projectSeed, slotIndex, variantIdx, offset)`** — offset přičten k projectSeed před mixem (offset +1 → wholly different simplex slice, ne jen drobný nudge).
  - **State:** `_exportConfig.get(slotIdx).variantOffsets = { 1: -2, 3: 1, ... }` sparse map. API `getVariantSeedOffset / setVariantSeedOffset / adjustVariantSeedOffset(slot, variant, delta)`. Persist v serialize/deserialize.
  - **UI:** dva buttony `‹ ›` v header `Export · preview` sekce + meta label (`var 3 · +2`). Klik volá `state.adjustVariantSeedOffset(idx, selectedVariantIdx, ±1)` → fires `export-config:changed` → renderLayout + renderPreview se okamžitě updatují. Buttony disabled pokud user prohlíží template (variantIdx === 0; template nepoužívá rng).

- **2026-05-16, fix:** outline smooth ramp — sub-pixel fade + fractional outer band.
  - **Bylo:** `N = Math.round(owPx)` → 0→1 px byl hard jump (0 = nic, 1 = full color solid 1 px). Mezi integer hodnotami další skoky kvůli round.
  - **Teď:** `drawOutlineGradient(ctx, boundary, owPx, color)` helper s dvěma režimy:
    - `owPx ≤ 1`: jeden 1-px stroke tintnutý `lerp(white, outlineColor, owPx)` = opacity-style fade-in (0.1 px ≈ 10 % outline color, 1 px = solid).
    - `owPx > 1`: `N = floor(owPx)` integer bands (current "1/N step lighter per step out") **+** fractional outer band na pozici `N+1` s tint scaled by `(owPx - N) × 1/(N+1)`. Smooths integer crossings.
  - **Slider label** ukazuje 1 decimal (`0.5 px`, `3.2 px`) — sub-pixel ramp je vidět při tahu.
  - Slider step zůstává 1 (state 0.01 = 0.1 px) — 10 sub-pixel kroků na pixel, dostatečné rozlišení.

- **2026-05-16, ui:** seed inline v header + variants clickable + preview reflektuje variant.
  - **Seed v header:** sekce Seed body kompletně pryč. Input + reset + random buttony teď v `panel-section__header` (input flex-1, buttons jako standardní header actions). Ušetří ~50 px vertikálního prostoru. Nová class `.panel-section__inline-input`.
  - **Variants clickable:** `.layout-tile.is-variant` má teď `data-variant-idx`, `cursor: pointer`, není ignorováno v `onLayoutClick`. Klik na variantu nastaví local `selectedVariantIdx` + ujistí se že parent slot je vybraný.
  - **Preview reflektuje variant:** `renderPreview` použije `buildSlotBlock(slot, isVariant, selectedVariantIdx)`. Klik template = preview parent (override null). Klik variant = preview s override pro tu variantu (seeded random za delta range). Highlight (žluté outline) přesune se na vybraný tile (template OR variant).
  - **Reset `selectedVariantIdx`** na 0 při `slot-selection:changed` a `template:changed`. Clamp v `renderPreview` pokud variant count klesl.

- **2026-05-16, feature:** big preview sekce v right panelu pro selected slot.
  - Nová sekce `Export · preview` (data-mode="export") nad existující `Export · variants`. Host `<div id="export-preview">` s placeholderem.
  - `renderPreview()` v exportPanel: reuse `buildSlotBlock(slot, false)` pro selected slot, jen CSS `width/height = PREVIEW_DISPLAY_PX (240px)`. Respektuje aktuální View (cuts/textures) + Show islands toggle.
  - Listenery: každý event co re-rendruje layout volá taky renderPreview. Plus source/input/curve/noise changes pro případ změny zvenku (project load, drop nový source).
  - CSS `.export-preview` = centered host + canvas s pixelated upscale.

- **2026-05-16, feature:** layout view mode picker — "cuts" vs "textures".
  - **`state._exportLayoutView`** = `"cuts" | "textures"` (default `"cuts"`). Select widget v params panelu.
  - **Cuts mode** (default): `drawDebugView` na canvasu — cell tint + cut/closure colored edges. Funguje **bez sourcu** (textury nepotřeba). Geometrické změny z variant deltas okamžitě viditelné, žádný texture clutter.
  - **Textures mode:** `drawSlotComposite` — final A/B clip + outline (= co exportuje PNG).
  - **Show islands** toggle nezávislý na view mode, ovlivňuje obě.
  - Persist v serialize/deserialize. Listener `export-layout-view:changed` → renderLayout.

- **2026-05-16, feature:** layout tiles = composite render (cuts always, noise opt-in).
  - **Bylo:** každý layout block byl mini CSS grid 0/1 cells (template-creator-style pattern visualization).
  - **Teď:** každý block = `<canvas>` s real composite render přes `buildSlotOutline` + `drawSlotComposite`. Native slot size (= co exportuje PNG), CSS-scaled na fixed `LAYOUT_TILE_DISPLAY_PX` (64 px) s `image-rendering: pixelated` → WYSIWYG s exportem.
  - **Noise default OFF** v layoutu (drahá per-tile pass × `templateSlots + variants` tiles by mohlo zadrhávat). State `_exportShowIslands` (default false) + checkbox "Show islands" v params panelu. Když off, buildSlotOutline dostane `noiseOverride: { side: "off" }`.
  - **Variant tiles** spočítají vlastní override přes `buildVariantOverride(slot.index, v)` (seeded random za delta range) → každá varianta vypadá jinak.
  - **CSS:** `.layout-tile` (canvas) místo `.layout-slot` (grid div). Variant tiles mají dashed muted outline pro odlišení od template.
  - **Listenery:** `export-show-islands:changed` → renderLayout. `seed:changed` → renderLayout (seed panel je v export modu viditelný, změna seed posune variant random picks).

- **2026-05-16, fix:** random ranges button po prvním klu nefungoval.
  - `rerenderRanges()` rebuildoval **celý** `.export-ranges` block včetně title divu — nový button neměl listener navázaný. Druhý klik no-op.
  - Fix: `rerenderRanges()` teď drop-uje **jen** `.export-range` rows (přes `remove()` + `insertAdjacentHTML`) a nechá title (a jeho 🎲 button + listener) netknutý.

- **2026-05-16, ui:** float sliders + random ranges button.
  - **Float support:** all export sliders (variability, min/max ranges) `step="0.1"`, parsing via `parseFloat`. Value labels přes `formatNum` / `formatDelta` (round to 1 decimal, drop trailing zero — `10 → "10"`, `10.5 → "10.5"`, `0.04 → "0"`).
  - **Random button** 🎲 v `.export-ranges__title` flex row vedle nadpisu "Variability — min / max per param". Affects all 5 variable params (smoothness, wave amp/freq, density, scale) na selected slotu. Per param: `dMin = -(rng × variability)`, `dMax = +(rng × variability)` — nezávislé draws pro asymmetric ranges. `Math.random()` (non-deterministic), match konvenci ostatních 🎲 buttonů; seed je pro variant render, ne pro picking initial ranges.

- **2026-05-16, refactor:** export ranges = **% of variability per side** (positive 0..100, sign implicit).
  - **Mental model (user):** global `Variability` = např. ±10 (slider points). Per param **min slider** říká "kolik % z variability na DOLNÍ stranu od current" (0..100, positive). **max slider** říká "kolik % na HORNÍ stranu" (0..100, positive). Sign je implicitní z toho, kterého slideru se týká. Příklad: variability=10, min=50 → dMin=-5, max=75 → dMax=+7.5, effective range = [current-5, current+7.5].
  - **State storage:** signed `{ dMin, dMax }` v state units (-1..1). UI ↔ state convert:
    - state → UI: `sMin = Math.round(-dMin / variability * 100)`, `sMax = Math.round(dMax / variability * 100)`.
    - UI → state: `dMin = -(sMin / 100) * variability`, `dMax = (sMax / 100) * variability`.
  - **Value label** vedle slideru ukazuje **effective delta v slider points** (signed: `-5`, `+7.5`), takže user vidí "co slider reálně přidává/odebírá" bez mental math. Variability re-render přepočítá labely.
  - **Global `state.exportVariability`** = 0..1 (default 0.1). Slider v export-params panelu pod direction picker. Persist v serialize/deserialize.
  - **Render variant:** `value = uniform(current + dMin, current + dMax)`, clamped na `[paramMin, paramMax]`. Když user posune main slider, variant range se posune s ním (intent "±X kolem current" se zachová).
  - **`rerenderRanges()`** helper rebuildne jen `.export-ranges` block (= když variability změní scope nebo reset jeden row). Zachová variability/direction/count slidery aktivní.

- **2026-05-16, ui polish:** variant count semantika + side-by-side min/max + global marker.
  - **Variant count = počet DALŠÍCH variant** (= co se objeví v layout's variants region). 0 = jen original, 1 = original + 1 var, atd. Slider range 0..10. State pořád ukládá total (=  extra + 1) takže ostatní pipeline (`> 1` filter pro variants region, export pass loop) zůstává.
  - **Min/max sliders side-by-side** v jedné row místo dvou. Layout per range: header (label · current value badge · reset) + 1 row [min tag] [min slider+marker] [min val] [max tag] [max slider+marker] [max val].
  - **Current global value marker:** 2px vertikální accent-color tick na slider tracku v pozici `(current - paramMin) / (paramMax - paramMin) × 100 %`. CSS var `--marker-pct` setnutá inline ze stylu. Pozice je aproximace (nekompenzuje thumb edge padding), ale dostatečně přesná pro orientaci.
  - **Current value badge** v headeru ukazuje `Math.round(cur × 100)` jako malý monospace box vedle labelu — explicit číselná reference vedle vizuálního markeru.

- **2026-05-16, ui:** export params přepsané z number inputů na slidery.
  - **Variants count:** slider 1..10 step 1 + value label. Defaultní `min="1"` (= 0 by nedávalo smysl v kontextu generace tilu).
  - **Per-param ranges:** dva slidery per row (min + max), každý scale matching main slider toho paramu (× 100): unipolar 0..100, bipolar -100..100. Value labels per slider. Layout vertical: header (label + reset) + min row + max row.
  - **Important plumbing:** `export-config:changed` event teď triggeruje **jen `renderLayout()`**, ne `renderAll()`. Důvod: každý slider input event fires state mutation → event → render. Pokud by se rerenderoval params DOM, slider element by se nahradil novým a user by ztratil drag focus = drag nefunguje. Layout grid se updatuje (extra variant cells), params panel zůstává dotčen jen na slot-selection-changed / project:loaded / explicit reset click.
  - Reset button explicit `renderParams()` call — jediná params-side interakce co vyžaduje DOM refresh (sliders snap zpět na current global, button flips na disabled).

- **2026-05-16, feature:** gradient outline + UI clarity + export persistence.
  - **Gradient outline:** outline už není 1 solid stroke s hard hranou, ale N concentric strokes přes `globalCompositeOperation = "multiply"` (širší first, užší last). Tint per band = `lerp(white, outlineColor, t)` kde t roste od `1/N` (outermost = nejsvětlejší multiply) po `1` (innermost = full outline color). Multiply darken zachovává underlying source colors → gradient fade-in místo hard edge. `ctx.rect(slot).clip()` zabraňuje multiply bleed do sousedů.
  - **UI clarity** `outlineWidth`: value indicator vedle slideru ukazuje **"N px"** místo raw 0..100. `formatValue(key, state01)` helper v `curvePanel.js`. Pro `outlineWidth` mapuje `state01 × effectScale (=10) → "N px"`. Ostatní sliders zatím raw value.
  - **Export config persistence:** `serialize()` přidalo `exportConfig` (Map → object) a `exportVariantDirection`. `deserialize()` načte zpět + dispatch eventy `export-config:changed` / `export-direction:changed`. Save/load/import teď zachová variant counts, ranges per slot a direction.
  - `lerpHex(a, b, t)` helper v `templateRenderer.js` pro band tinting.

- **2026-05-16, refactor:** preview = pixel-perfect WYSIWYG s exportem.
  - **Cíl:** preview MUSÍ ukázat přesně stejné pixely jako vyjde z exportu PNG. Žádná jiná varianta není přípustná. Pixel mode = bez AA, musí to sedět.
  - **Změny:**
    - **mainView render = native slot size** (`state.nativeSlotSize`, sdíleno s exportPanelem). Žádný viewport-fit slot size. Canvas CSS dimensions = `nativeSize × cols`, často mnohem menší než stage area.
    - **CSS scale-up:** `transform: translate(pan) scale(displayScale)` kde `displayScale = fitScale * zoom`. `fitScale` se počítá per refresh aby canvas fitnul stage; `zoom` je user wheel multiplier. Pixel mode má `image-rendering: pixelated` na canvasu → crisp pixel-art look po scale-upu.
    - **`dpr: 1`** v mainView renderTemplate call — match exportu byte-for-byte. HiDPI uživatelé dostanou chunkier preview canvas, ale CSS scale + pixelated řeší ostrost displayu.
    - **`transform-origin: 50% 50%`** + flex centering ve stage = scale stays centred bez ručního recentring math. Wheel zoom = jen `zoom *= factor`, žádné cursor-centered (zjednodušení; pan ručně).
    - **`state.nativeSlotSize` getter** v state.js — DRY mezi mainView a exportPanel.
  - **Outline width refactor:**
    - `outlineWidth` už **není cell-relative** ale **absolute pixels**. `outlinePx = ow × effectScale` kde `effectScale = 10` (= slider 0..100 → 0..10 px). Pixel mode rounds; smooth mode keeps fractional.
    - Důvod: cell-relative outline = mizel v exportu při tenkých hodnotách. Absolute = identický pixel count v preview i exportu = WYSIWYG match.
  - **Smoothness / wave / inflate** zůstávají cell-relative (= scale s velikostí slotu). Při native render je cell menší → effective menší. User musí slidery víc vytočit pro stejný look jako dřív. Trade-off za WYSIWYG.
  - **Selection frame:** `selectionScale: 1` → frame 1 canvas px = `displayScale` screen px tlustý. Chunky ale konzistentní s pixel-art stylem.

- **2026-05-16, revert:** outline 1-px minimum fix rozbil WYSIWYG mezi preview a exportem.
  - **Bug fixu:** vynucený `Math.max(1, ...)` v pixel mode dělal export proporcionálně tlustší než preview. Preview slot=300 ow=0.05 → 1 px outline (0.33 % slotu). Export slot=64 ow=0.05 → forced na 1 px (1.56 % slotu) = ~5× tlustší.
  - **Návrat:** `outlinePx = Math.round(ow × minCell × 0.25)` bez minima. Honest WYSIWYG: stejná frakce slotu v preview i exportu. Při ow ~5–10 % na malém native slot size se může outline zaokrouhlit na 0 = neviditelný. User musí slider zvýšit (ow ≥ 0.094 na 3×3 patternu při slot=64) nebo akceptovat že tenký outline se v exportu nevykreslí.

- **2026-05-16, feature:** per-slot variability — min/max ranges + seeded variant random.
  - **5 varovatelných paramů:** smoothness, waveAmplitude, waveFrequency (curve), density, scale (noise). Registry v `core/variant_params.js` (key + label + source + absolutní min/max z `GLOBAL_CURVE_PARAMS` / `NOISE_PARAMS`).
  - **State:** per-slot `ranges: { paramKey: { min, max } }` v `_exportConfig`. API `getExportRange(slotIndex, key)`, `setExportRange(slotIndex, key, min, max)`, `clearExportRange(slotIndex, key)`. Ranges entries jsou sparse — chybí = "no variation, use current global". `setExportVariantCount(c=1)` zachová ranges když existují (flip count → 1 nebrání zachovat ranges pro budoucí použití).
  - **PRNG:** `core/random.js` — `mulberry32(seed)` factory + `variantRng(projectSeed, slotIndex, variantIdx)` helper pro deterministický random per `(slot, variant)` pair.
  - **Renderer overrides:** `buildSlotOutline` přijme `curveOverride` / `noiseOverride` (merged on top of state). `renderTemplate` přijme `slotOverrides: Map<slotIndex, { curve, noise }>` a předá per slot.
  - **Export action:**
    1. Pass 1 = full template render bez overrides → crop sloty na exact (col, row).
    2. Pro každý variant index V (1..maxCount-1): build `slotOverrides` mapu pro sloty co mají V < count, render full template s těmi overrides, crop jen aktivní sloty do variant region.
    3. Wasteful (re-render full template per V), ale one-shot export → fine.
  - **Per-variant override** logika v `buildVariantOverride(slotIndex, V)`: pro každý variable param vezmi range (pokud existuje a min ≠ max), `value = min + rng() * (max - min)`. Bez range = omit (renderer fallne na live state).
  - **UI v export-params panelu** (když slot selected): pod variant count je `.export-ranges` block s row per param: label + min input + max input + reset button. Defaultní hodnoty = current global value (= žádná variace). Reset button vymaže entry → fallback na current global.
  - **CSS:** `.export-ranges`, `.export-range`, `.export-range__input` v main.css.

- **2026-05-16, refactor:** seed promotion — `noiseParams.seed` → top-level `state.seed`.
  - **Důvod:** seed se bude používat i pro variant random (export feature), ne jen pro noise. Patří na top-level, ne do noise namespace.
  - **State:** `_seed: number` (default 42, range 0..99999). API `state.seed`, `state.setSeed(v)`. Event `seed:changed`. Serialize/deserialize: top-level `obj.seed`. Backward-compat: starý `obj.noiseParams.seed` se přečte pokud `obj.seed` chybí.
  - **`core/noise.js`** signatury aktualizovány: `buildNoiseMask(..., params, seed)`, `buildNoiseIslands(..., params, seed)`. Core zůstává pure, žádný state import.
  - **`templateRenderer.js`** předává `state.seed` přes call site.
  - **UI:** vyhozená Seed row z "Noise · islands" sekce v `index.html`. Nová samostatná "Seed" sekce úplně nahoře v pravém panelu (visible v obou modes — global setting). Modul `view/seedPanel.js`.
  - **Listenery `seed:changed`** přidané do `mainView`, `mapView`, `slotEditor`.
  - **`NOISE_PARAMS`** v `core/noise_params.js` už neobsahuje `seed`; přibyly konstanty `DEFAULT_SEED`, `SEED_MIN`, `SEED_MAX`.
  - **Dead `key === "seed"` větev** v `noisePanel.applyRandom` odstraněna; NUMBER_KEYS loop a `numbers` Map pryč (jediný NUMBER key byl seed).

- **2026-05-16, feature:** export stage — template grid + separated variants region + direction picker.
  - **Mapa zůstává na původní pozici** (top-right floating `.map-overlay`). DOM se nepřesouvá; rule `body.map-hidden:not(.export-active)` zaručuje že je v export módu vždy viditelná. Předchozí "physically move map" approach byl wrong, je revert.
  - **`#export-stage`** = jen `.layout-grid` (full-area). Mapa overlay-uje top-right roh gridu.
  - **Layout `.layout-grid[data-direction="down"|"right"]`** flex column / row. Uvnitř `.layout-grid__template` (CSS grid s sloty na **přesných** `(slot.col, slot.row)` — varianty ho **nikdy nemodifikují**) a `.layout-grid__variants` (separátní region pro variant groupy).
  - **Variant placement:** jeden `.variant-group` per slot-s-variants, obsahuje (count-1) variant blocků v lineárním sledu. Skupiny stacknuté kolmo na osu variant (down → groupy stack vertical, varianty horizontal v group; right → opačně).
  - **Direction picker** v export-params right panelu jako `<select>`: `down (extra rows)` / `right (extra cols)`. State key `_exportVariantDirection`, event `export-direction:changed`, default `"down"`.
  - **State:** `_exportConfig: Map<slotIndex, { variantCount }>` (sparse, default count=1 → no entry). API: `getExportVariantCount`, `setExportVariantCount`. Auto-clear na `setTemplate`.
  - **Sdílená selection** s preview mode (`state.selectedSlotIndex`). Klik na mapě (mapView's existing handler) i na template slot block volá `selectSlot`/`clearSlotSelection`.
  - **Right panel swap** přes `data-mode` attr na sekcích — preview-mode sekce (curve / noise / selected slot) hidden v export-active, export sekce visible. CSS: `body:not(.export-active) [data-mode="export"], body.export-active [data-mode="preview"] { display: none !important }`.
  - **Slot blocks:** `.layout-slot` = mini grid cells (`.layout-slot__cell` / `--on` per 0/1) jako template-creator. Selected = žluté outline. Variant blocks `.is-variant` faded + neclickable.
  - **Export action:** preview canvas → crop sloty per placement. Pass 1 = template at exact `(col, row)`. Pass 2 = variants per direction (down → extra rows; right → extra cols), jedna row/col per slot-s-variants. Variant cells crop **stejný** slot N× (placeholder; per-variant param ranges later).
  - **TBD:** range sliders pro wave amp/freq/density/scale, per-variant render přes overridnuté params, "right" mode visual polish.

- **2026-05-16, fix:** export slot size = **native source tileSize**, žádný upscale.
  - **Důvod:** scale multiplier (1×/2×/4×) by jen upscaloval bitmap → loss of quality (browser bilinear or pixel duplication). Nemá smysl. Source A/B mají native rozlišení (např. 64 px per tile); drawImage do same-size slotu = 1:1, žádné resamplování.
  - **Logika:** `nativeSlotSize()` v `exportPanel.js` vezme `max(sourceA.tileSize, sourceB.tileSize)` — větší source wins aby ani jeden nebyl downscaled. Žádný source = fallback 64 px.
  - Scale state / opt z renderTemplate ponechán (může se hodit jindy), ale export ho už nepoužívá.

- **2026-05-16, feature:** PNG export — stage takeover (no modal).
  - **Topbar:** nový button `PNG` (existující `Export` zůstává na JSON projekt).
  - **Stage takeover pattern** (mirror template-creator) místo modalu — klik na PNG flipne `body.export-active`, main preview + map overlay se skryjí, ukáže se `canvas-toolbar__export` group (PNG export label + Export + Exit) a prázdná `#export-stage` div pro budoucí parametry.
  - **CSS:** `body:not(.export-active) .canvas-toolbar__export, .export-stage { display: none !important; }` + body.export-active hides `.canvas-toolbar__field`, `#map-toggle`, `.map-overlay`, `.main-template`. Pravidla sdílené se selectorovým chainem `body.creator-active, body.export-active` aby DRY.
  - **`view/exportPanel.js`** — `initExportPanel()` registruje enter/exit/runExport. Esc exits. enter() odebere `creator-active` first (mutually exclusive). runExport: offscreen canvas → `renderTemplate({ slotSize, slotGap: 0, freezeNoise: false, dpr: 1 })` → `canvas.toBlob('image/png')` → download. Default filename = `state.projectName`.
  - **`templateCreator.enterStage`** taky odebere `export-active` (symetrická exclusion).
  - **`renderTemplate` dostal `opts.dpr`** override — `null` (default) = follow `window.devicePixelRatio`, `1` = pixel-exact pro offscreen export.
  - **Otevřené pro další iteraci:** parametry uvnitř `#export-stage` (variabilita, per-tile varianty, output layout, výběr tilů podle mapy, scale picker).

- **2026-05-16, cleanup:** dead-code sweep (−80 lines, žádná funkční změna).
  - **`core/geometry.js`:** smazané dead exports `pathToSvgD`, `cutOutlineToPath2D`, `pathSegmentCount`. `effectivePos` import inlined na `point.pos`.
  - **`core/grid_outline.js`:** `effectivePos` helper (1-line passthrough) smazán.
  - **`view/templateRenderer.js`:** unused import `cutOutlineToPath2D` + stale "Future modification hook" komentář pryč.
  - **`view/noisePanel.js`:** stale top-of-file doc (Side jako select) opraven na radio; mrtvý `sectionEl` lookup pryč.
  - **`index.html`:** vyhozený CDN script tag pro `seedrandom@3` — knihovna se nikde nepoužívá, `simplex-noise@2` přijímá seed string přímo.

- **2026-05-16, fix:** "o" / "c" outline artefakty u cut hrany — round 2–4.
  - **Symptom:** "stale se objevuji boundry do tvaru o nebo c" i po area-threshold filteru. Sub-paths měly substantial area, ale parent fill byl stejný na obou stranách jejich hrany (= žádná A/B transition) — paper.js boolean nechával "ghost" loopy se zrušeným winding contribution.
  - **Round 2:** `isGhostSubPath(sub, parent)` — sample `parent.contains` na obě strany normály jednoho segmentu. Rozbilo valid outlines (false positives).
  - **Round 3:** skip ghost test pro `subs.length === 1`. Pomohlo, ale problém přetrvával — single-segment probe selhával když valid sub-path měl jeden segment blízko jiného sub-pathu (probe zachytil fill z toho sousedního a špatně flagnul).
  - **Round 4 (current):** probe **každý** segment, flag ghost jen pokud **ALL** segmenty selžou na transition testu. Reálný outline má aspoň některé segmenty daleko od ostatních sub-paths — najde transition na nich. Ghost loop selže všude. Plus area threshold 1.0 px² jako cheap pre-filter.

- **2026-05-16, cleanup:** noise `shrink` param vyhozen.
  - Slider nepřinášel užitečný efekt — straddling contours teď padají do stejné union-pass jako interior, žádná asymmetric scale.
  - **Vyhozeno:** `shrink` z `NOISE_PARAMS`, slider z `index.html`, `"shrink"` z `SLIDER_KEYS` v `noisePanel.js`. `applyNoiseToFill` zjednodušeno z 2-pass (interior + straddling) na 1-pass union-then-boolean.

- **2026-05-16, refactor:** noise side — dva bools → jeden enum.
  - **Důvod:** uživatel zjistil, že kombinace `sideA + sideB` (holes + patches současně) dělala boundary artefakty u cut hrany a nepřinášela velký vizuální zisk. Mutual exclusion vynucená datovým modelem je čistší než UI checkpointy.
  - **Změny:**
    - `NOISE_PARAMS.side: { type: "enum", values: ["off", "holes", "patches"], default: "off" }` nahrazuje `sideA` / `sideB` bools.
    - `index.html` — 3 radio inputy `name="noise-side"` (off / A holes / B patches) místo 2 checkboxů. CSS `.noise-side__opt:has(input:checked)` funguje pro radio identicky.
    - `noisePanel.js` — `CHECKBOX_KEYS` pryč, místo nich radio listener + sync v `noise:changed` handleru. `applyRandom` dostal `enum` větev.
    - `templateRenderer.js` — gating `noise.side !== "off"`, `applyNoiseToFill` switchuje na `isHoles` / `isPatches` (vyřazena větev pro "both").
    - `state.deserialize` backwards-compat: starý `sideA: true / sideB: true` snapshot → `side: "holes"` (preferuje sideA pokud byly oba).

- **2026-05-16, fix:** freeze flagy gatují **jen noise**, ne celý repaint.
  - **Bug:** předchozí varianta měla v každém view na začátku refresh-u `if (state.renderFreeze[view] && state.noisePaused) return;` → během dragu se neaktualizovalo NIC (ani curve / drag / sliders), buttony tedy efektivně dělaly black-out.
  - **Fix:** view passes `freezeNoise: state.renderFreeze[view]` do `renderTemplate({...})` → `buildSlotOutline(slot, x, y, size, { freezeNoise })`. Noise gating teď: `noiseActive = ... && !(freezeNoise && state.noisePaused)`. Curve / inflate / wave / smooth / drag pipeline běží vždy — jen noise islands se přeskočí.
  - Early-returny z `mainView.refresh`, `mapView.refresh`, `slotEditor.paint` odstraněny. `render-freeze:changed` listenery zachovány (toggle button → re-paint s novou hodnotou flagu).

- **2026-05-15, UI polish:**
  - **Map style:** 300→**250 px**, `top: 0; right: 0` (flush s rohem main area, žádný margin), `border-left + border-bottom: 2px accent` (vnitřní hrana výraznější — vnější hrana je už okraj okna). Stronger shadow.
  - **Slot editor cell grid:** `drawSlotGrid(ctx, slot, x, y, size, opts)` exportovaný z `templateRenderer.js`. Slot editor ho volá mezi source render a `drawOutlineDebug` → cell grid + slot frame visible přes source artwork, closure modré edges + dots ze `drawOutlineDebug`. `drawCurveDebug` v mapView taky používá stejný helper (s `tint: true`).
  - **Main view zoom + pan:**
    - Mouse wheel = zoom (mult `1.15` per tick, clamp `0.25..8`), **centered on cursor** (matematika: keep canvas-space point under cursor invariant napříč scale change).
    - Middle-mouse drag = pan. Listeners na `window` aby drag pokračoval i mimo canvas.
    - Implementace přes CSS `transform: translate() scale()` na canvas elementu. Žádný re-render při zoom → vector outline pixeluje při zoom-in, source bitmaps zachovají `image-rendering: pixelated` look. Slot hit-test konvertuje client coords zpět do canvas coords děleno `scale`.
    - `click` handler suppress-uje klik který přišel z dokončeného panu (`if (panning) return`).
    - `transform-origin: 0 0` aby offset math sedněla.

- **2026-05-15** — UI restruct: merge canvas + preview → main view + map overlay.
  - **Bylo:** center column měl vertikální split — top = debug overlay canvas, bottom = preview (final composite). Dvě view okna, oboje rozdělená.
  - **Teď:** center column je **jedna oblast** s preview-style renderingem (= source A clipped + outline). Stretch na max. Map overlay v top-right rohu (`position: absolute`, fixní 300×300 px) drží debug overlay z původního canvasu — minimapa nad preview.
  - **HTML:** `.center-column` → `.main-area`. `#canvas-stage` + `#preview-grid` → `#main-stage` (= sám canvas pro hlavní view) + `.map-overlay` > `#map-stage` (= canvas pro map). Vertical Split.js odstraněn.
  - **`view/canvasView.js` → `view/mapView.js`** (renamed). Targets `#map-stage`, renders s `showCurveDebug: true`. Klik vybere slot (zachováno).
  - **`view/previewPanel.js` → `view/mainView.js`** (renamed). Targets `#main-stage`, renders s `showCurveDebug: false`. **Nově má click handler** pro select slot (preview už není read-only, klik na ní vybere slot stejně jako klik na mapu).
  - **CSS:** `.canvas-area`, `.preview*` třídy odstraněny. Nové `.main-area`, `.main-stage`, `.map-overlay`, `.map-stage`, `.map-template`. `--preview-header-height` token vyhozen.
  - **`main.js`** importy aktualizovány (`initMainView`, `initMapView`).

- **2026-05-15** — **save / load / export / import** zapojené.
  - **State serialize/deserialize:** `state.serialize()` snapshotuje `projectName`, `template.id`, `sourceA/B`, `inputs[]` (image jako PNG dataURL přes canvas), `globalCurve`, `tileOffsets` (Map → plain object). `state.deserialize(obj)` async — dekóduje image dataURLs paralelně přes `Promise.all`, re-split `splitIntoTiles`, pak rebuild state + emit všechny příslušné events (template, input:added per vstup, source:changed, global-curve:changed per key, tile-offsets:changed, project-name:changed, project:loaded). Pořadí events: template první (renderers vědí kterou template čekat), inputs, sources, curve, offsets, project meta.
  - **Robustnost:** deserialize načte inputs **před** clearem state — pokud image decode selže, state zůstane nedotčený. Defaulty z `defaultGlobalCurve()` merge přes obj.globalCurve, takže starý snapshot bez nového param klíče se načte čistě.
  - **`view/projectBar.js`** drží UI: project name input (two-way binding přes `project-name:changed`) + 4 buttons. localStorage key `tileset.project`. Export downloaduje `<projectName>.tilesetproj.json` přes Blob + `<a download>`. Import file picker → JSON → deserialize.
  - **Auto-load** v `main.js` po init všech views — `autoLoad()` zavolá `loadFromLocalStorage()` bez `await` (startup zůstane synchronní, decode probíhá na pozadí, views re-render jak inputs dorazí).
  - **`curvePanel.js`** přidal listener `global-curve:changed` — slider/picker se aktualizuje při state change zvenku (= po deserialize). Dříve šlo jen one-way slider → state.
  - **HTML topbar:** "untitled" `<span>` nahrazen za `<input type="text" id="project-name">`. CSS `.topbar__project-name` (transparent border, hover/focus highlight).
  - **Žádný versioning** podle dohody — pokud schéma změníme, dodáme migrate funkci pozdě.
  - **Empty localStorage = silent no-op** — Load button bez uložené verze prostě nic neudělá.

- **2026-05-15, cleanup:** noise odpojený (semantic mismatch s user vizí).
  - **Důvod:** displacement-based noise (jak jsem implementoval) vypadal vizuálně velmi podobně jako wave (just non-periodic). Userova vize noise = **islands** (= generování disconnected pockets opačného terénu uvnitř původního) je topologicky úplně jiná operace — vyžaduje multi-region path (CompoundPath s holes), marching-squares contour extraction nad noise mask, atd. Větší feature.
  - **Vyhozeno:** `noise` z `curve_params.js`, noise slider z `index.html`, `noise` z `SLIDER_KEYS` v `curvePanel.js`. `applyCutDisplacements` zase rozdělené zpět na `applyWavePaper` (jen wave). `makeNoise2D` helper odebrán.
  - **Vyhozeno také:** `mods: { smooth, wave }` placeholder field z grid points (dead, nepoužité).
  - **Future "islands" noise** přijde jako separátní state klíč (možná `noiseIslands` nebo `terrainNoise`) s vlastní implementací — po save/load.

- **2026-05-15** — noise modifier zapojený přes kombinovaný `applyCutDisplacements`.
  - **Vyhozeno `applyWavePaper`**, nahrazeno `applyCutDisplacements(path, opts)` co handluje **wave + noise v jediném subdivision passu**. Separátní passy by subdividily 2× → ~400 sub-vertices per cell. Pro každý sub-vertex: `offset = (waveTerm + noiseTerm) × fade`.
  - **Vlastní noise (no CDN dep):** `makeNoise2D(seed)` — 32-bit hash + bilinear interpolation + smoothstep. ~30 řádků. Pro cosmetic jitter na cut chains stačí (není simplex quality, ale konzistentní a deterministické).
  - **Cross-tile coherence:** noise vzorkovaný v paper.Path absolute coords (= world space pro daný canvas). Sousední tily renderované v jednom canvasu sdílí same noise field → konzistentní jitter napříč slot edges.
  - **Slider mapping:** `noise.effectScale = 0.5` (max amplitude = ½ cell), `noiseScalePx = minCell * 0.5` (~2 noise periody per cell), `noiseSeed = 42` (fixní pro stable result; lze později expose do state).
  - **Sign:** signed slider, negativní = inverted noise (= phase flip). Same as wave.
  - **Pipeline:** `... → roundCorners → (smoothBoundaryTangents OR applyCutDisplacements)`. Boundary tangents perpendicular se použije **pouze pokud žádné displacement není aktivní**. Wave+noise v fadě stejně zafadnou u boundary, takže perpendicular by konfliktovala.

- **2026-05-15, fix:** wave + smoothness → 45° edge místo arc (passthroughSegSpec smazala handles).
  - **Symptom:** se zapnutou smoothness JEDNOU pracovala, ale po přidání wave (waveAmp i waveFreq oba non-zero) se arc změnila na rovnou 45° diagonálu. User log z roundCorners ukázal, že V1/V2 handles jsou nastavené správně (`hOut=(0,1.29)` apod.). Bug byl v `applyWavePaper`.
  - **Root cause:** `passthroughSegSpec(seg)` helper **hardcoded `hix=hiy=hox=hoy=0`** ignoroval skutečné `seg.handleIn` / `seg.handleOut`. V roundCorners to bylo neškodné (vstupní segmenty měly handles 0), ale když `applyWavePaper` volá tu samou helper pro V1/V2 (= rounded corner endpoints s arc handles), tak ji **vynuluje arc** → Bezier kolapsuje na chord.
  - **Fix:** `passthroughSegSpec` teď preservuje `seg.handleIn` a `seg.handleOut`. V1/V2 procházejí přes applyWavePaper s arc handles netknutými.
  - Diagnostický `window.__ROUND_DEBUG__` log v `roundCorners` byl použit k identifikaci bugu, pak odebrán.

- **2026-05-15, fix:** wave + smoothness teď nedělá kinky v rozích.
  - **Bug:** kombinace wave + smoothness produkovala viditelný uhel u V1/V2 rounded corners. Poslední wave sub-vertex (k=K-1, t=0.95) měl fade `sin(0.95π) ≈ 0.156` — pořád 16% amplitudy. Mezi tím sub-vertexem (offset) a V1 (na původní cut axe) byla rovná čára s naklonem → tangenta při V1 nekorespondovala s arc handle tangentou → kink.
  - **Fix A — pin endpointů:** `k = 1` (první sub-vertex po `seg.point`) a `k = K-1` (poslední před `nextSeg.point`) mají offset **vynulovaný explicitně**. Line z endpointu na první sub-vertex (a z posledního sub-vertexu na endpoint) jde přesně po cut ose → tangenta sedí s arc handle (V1/V2) nebo s libovolným jiným handle na endpointu.
  - **Fix B — `sin²(π·t)` fade** místo `sin(π·t)`. Mnohem strmější útlum u krajů (`sin²` při `t=0.05` je 0.024 = 2.4% místo 15.6%). Wave se víc soustředí doprostřed segmentu, méně ripple kolem endpointů. Max amplitude v t=0.5 zůstává 100%.

- **2026-05-15, fix:** wave `isArc` check + skip `smoothBoundaryTangents` při wave (jinak by se rušily).
  - **Bug:** v předchozí pipeline (`roundCorners → smoothBoundaryTangents → applyWavePaper`) `smoothBoundaryTangents` nastavil non-zero handles na slot-edge cut segmentech (perpendicular tangenta). `applyWavePaper.isStraight` check (= oba handles musí být zero) pak ten segment skipnul. Pro plus pattern jsou VŠECHNY cut segmenty buď arc (z roundCorners) nebo slot-edge-přilehlé (z smoothBoundaryTangents) → wave aplikuje na **0 segmentů**. Slider nedělal vůbec nic.
  - **Fix A — `isArc` check místo `isStraight`:** arc segment má `seg.gridPointIdx === nextSeg.gridPointIdx` (oba V1/V2 dědí stejné ID z původního corner V). Subdivide pokud `isCut && !isArc`. Cut s jednostranným handle (slot-edge perpendicular) se teď subdividuje normálně; fade na sub-vertexech ho přirozeně neruší.
  - **Fix B — `smoothBoundaryTangents` se skipne když wave > 0:** obě transformace sahají na handles slot-edge cutu a chtějí konfliktní věci (perpendicular vs. oscilaci). Plus `smoothBoundaryTangents` handle magnitude `0.3 × cell.w` versus malá vzdálenost k sub-vertexu (`cell/K`) vytvořila overshoot ve smyčce u boundary. Wave-mode = bez perpendicular tangenta; non-wave-mode = perpendicular tangenta jako dřív.
  - **Pipeline teď:** `gridOutlineToPaperPath → roundCorners → (smoothBoundaryTangents XOR applyWavePaper)`. Slovo "XOR" — jeden nebo druhý, ne oba.

- **2026-05-15, fix:** pipeline reorder + wave fade (3 bugy v jednom).
  - **Bug 1 — smoothness přestala fungovat:** pipeline měla wave PŘED roundCorners. Wave subdividuje cut hrany na K~20 sub-segmentů → roundCorners pak najde corner V, ale `prevSeg.point` a `nextSeg.point` jsou nejbližší sub-vertex (cca cell/K = ~5 px). r = `min(radiusPx, dPV/2, dVN/2)` se zclampuje na ~2.5 px → rounding neviditelný i pro `smoothness=1`.
  - **Bug 2 — wave přetéká hranice tilu:** poslední sub-vertex před slot-edge V byl displacovaný plnou amplitudou; V samotné fixní na slot edge. Mezi nimi visible kink + wave "uniká" za boundary.
  - **Bug 3 — uzly v rozích po rounding:** totéž — poslední sub-vertex před V1 plná amp, V1 zpět na původní lince → kink u arc startu.
  - **Fix A — reorder pipeline:** `gridOutlineToPaperPath → roundCorners → smoothBoundaryTangents → applyWavePaper`. Rounding a tangent perpendicularization běží na grid-derived geometrii s plnými cell distances. Wave subdividuje na konci, vidí curved segmenty (z roundCorners arc, z smoothBoundaryTangents handles) jako non-straight a skipne je.
  - **Fix B — fade `sin(π·t)`:** ve `applyWavePaper` při generování sub-vertexu na pozici `t ∈ (0, 1)` násobíme `offset *= sin(π × t)`. Fade jde 0 → 1 → 0 přes hranu. Wave amplitude tedy:
    - **= 0** na obou koncích každé subdivided hrany.
    - **= max** uprostřed.
  - Důsledek: slot-edge body, V1/V2 endpointy rounded corners, i regular grid vertexy uprostřed cut chainu zůstávají na své pozici. Mezi nimi vlna naturálně nabíhá a zpátky se uklidňuje na 0. Žádné kinky, žádné leaky past tile boundary.

- **2026-05-15, fix:** smoothness vrácený na **unsigned** + wave přepsaný na **paper-side subdivision**.
  - **Smoothness revert:** `min: 0, max: 1, default: 0` v `curve_params.js`. Slider v `index.html` zpět na `min="0"`. Reason: outward rounding nemá clean implementaci v současné V1/V2 chord topology, takže negativní hodnoty byly no-op = matoucí dead zone v slideru. Lepší držet smoothness unsigned.
  - **Wave bug:** při |frequency| na grid-aligned multiples (`0.5`, `1.0`, `1.5`, ...) byla wave neviditelná. Příčina: phase při interior bodech = `arcLen × freq × 2π / minCell`; pokud arcLen je integer × cell.w a freq dává half-integer počet periods/cell, phase je integer × π → `sin = 0`. Pro plus pattern jsou všechny 4 cut-interior body na arcLen integer × cell, takže slider extremes `±1`, `±0.5` všechny dávaly sin=0 → žádná visible displacement.
  - **Fix:** nový `applyWavePaper(path, amplitudePx, periodsAcrossCell, minCell)` v `geometry.js`. Pracuje na **paper.Path level** — pro každou STRAIGHT cut hranu subdividuje na K≈20 sub-segmentů, každý sub-vertex displacuje `sin(arcLen × freq) × amplitude` po lokální outward normále (perpendicular k cut směru). Wave je teď renderována **spojitě** napříč hranou, ne jen v koncových bodech.
    - K=20 samples per cell znamená Nyquist limit ~10 period/cell — žádné aliasing pro náš range max 2 period/cell.
    - Sub-vertexy mají `data.type = "cut"` (aby je `cutOutlineToPath2D` strokovala) ale **bez `gridPointIdx`** → `roundCorners` je passthrough přes nový filter `hasGridOrigin`. Hit-test v slotEditoru čte z `outline.points` (jen grid model), takže drag handles zůstávají v logických grid pozicích a nehoupou se s vlnou.
    - Pipeline order: `gridOutlineToPaperPath → applyWavePaper → roundCorners → smoothBoundaryTangents`. Wave subdivide cut hran když jsou ještě straight; rounding a tangent perp běží potom na grid-derived segmentech.
  - **Vyhozeno:** `applyWave` z `grid_outline.js` (grid-level wave, nahrazený paper-side variantou).
  - **Vlevo / vpravo slider stále signed** pro waveAmplitude (negativní = phase flip, propagated do amplitudePx).

- **2026-05-15** — všechny curve parametry **bipolární** (-1..1, default 0).
  - **`curve_params.js`** updatovaný: každý numerický param má `min: -1, max: 1, default: 0`. Komentáře dokumentují semantiku negativní hodnoty per param.
  - **HTML slidery** (`index.html`) přepnuté na `min="-100" max="100" value="0"` pro všech 6 (smoothness, waveAmp, waveFreq, noise, inflate, outlineWidth). Slider midpoint = state 0 = no effect.
  - **`curvePanel.js`** komentář updatován; mapping `slider/100 → state` stejný — slider value -100..100 přirozeně → state -1..1.
  - **`buildSlotOutline`** — `clamp01` nahrazen `clampSigned` (`[-1, 1]`) pro params které podporují negativní:
    - **`inflate`**: signed pass-through. `inflateOutline` math už funguje s negativním amountPx → push opačně podél outwardNormal → region shrinks. **Deflate**.
    - **`waveAmplitude`**: signed pass-through. Negativní = phase flip (sin → -sin); vizuálně velmi podobné pro symetrické patterny, ale technicky odlišné.
    - **`waveFrequency`**: `Math.abs` (sign-flip by zdvojnásobil amplitude flip → redundantní).
    - **`smoothness`**: negativní treated as **no-op** (= 0). Outward rounding nemá čistý smooth implementaci s naším V1/V2 chord topology — arc na opačné straně chordu by potřeboval kink na V1/V2 nebo úplně jinou topologii. Future task pokud bude potřeba.
    - **`outlineWidth`**: |slider| řídí thickness; **sign řídí stranu**:
      - `> 0`: outline OUTSIDE (clip stroke na region complement přes evenodd rule, viditelné na source B straně)
      - `< 0`: inline INSIDE (clip stroke na fillPath, viditelné na source A straně)
      - `= 0`: žádný stroke
      - Stroke at `thickness × 2` clipped na zvolenou stranu = visible `thickness` na té straně.

- **2026-05-15** — centralized parameter ranges (`core/curve_params.js`) + wave frequency feel smoother.
  - **Nový `core/curve_params.js`** drží `GLOBAL_CURVE_PARAMS` s `{min, max, default, effectScale}` per parameter. Effect scales jsou multiplier ze sliderové hodnoty 0..1 na physical effect (typicky × min(cell)):
    - `smoothness.effectScale = 0.5` — radius až po ½ cell.
    - `waveAmplitude.effectScale = 0.5` — amplitude až po ½ cell.
    - `waveFrequency.effectScale = 2` — max 2 periody per cell (down z 5, viz níže).
    - `inflate.effectScale = 0.5` — push až po ½ cell.
    - `outlineWidth.effectScale = 0.25` — stroke šíře ¼ cell max.
    - `outlineColor` — jen `default: "#000000"`.
  - **`state.js`** importuje `defaultGlobalCurve()` a inicializuje `_globalCurve` z config. Žádné inline defaulty.
  - **`templateRenderer.js`** importuje jako `P` a používá `P.<param>.effectScale` všude místo magic numberů (smoothness, wave amp, inflate, outline width).
  - **`applyWave`** refaktorovaná: bere fyzické hodnoty (amplitudePx, periodsAcrossCell) místo slider 0..1. Slider→physical mapping žije v `buildSlotOutline`, ne v grid_outline.js.
  - **Wave frequency max snížený z 5 na 2 period/cell.** Při freq=5 měl slider "seedovaný" feel — slider step měnil počet vln nesouhlasně s chain length, mezi celočíselnými hodnotami chaotic. S max=2 (= slider sweepuje 0–2 periody) je vizuální transition mnohem plynulejší.
  - **Změna defaultu / range / scale = jeden edit v `curve_params.js`**, žádný hunt přes view/state.

- **2026-05-15** — **wave modifier** zapojený (sinusoidal displacement na cut chains).
  - **`applyWave(outline, amplitude01, frequency01)`** v `grid_outline.js`. Pro každý outline bod **strictly interior to a cut chain** (= not on slot edge, oba adj `cut`) posune po jeho `outwardNormal` o `sin(arcLen × freqRadPerPx) × amplitudePx`. Slot-edge body a closure-přilehlé body skipne.
  - **Phase = cumulative arc length around the loop.** Per-tile reference, žádná cross-tile phase coherence — wave nenavazuje napříč sousedními tily. Pro tu konzistenci by bylo třeba world-space coordinate jako fázi (TODO až bude potřeba).
  - **Slider mapping:**
    - `amplitude01 × min(cell)/2` → amplitude v pixelech (max ½ cell).
    - `frequency01 × 5 × 2π / min(cell)` → max 5 wave period per cell.
  - **Pipeline slot:** `applyTileOffsets → applyWave → inflateOutline → clamp → toPaperPath → roundCorners → smoothBoundaryTangents`. Wave je na drag-deformovaných pozicích, inflate pak rippled outline rozšíří.
  - **State & UI:** `waveAmplitude` a `waveFrequency` v `_globalCurve` už existovaly, slidery v `curvePanel.js` byly nezapojené — teď live.

- **2026-05-15, cleanup:** dead-code sweep.
  - **Vyhozeno:** `forEachEdge` (export v `grid_outline.js`, nikdy nevolané), `_scope()` (export v `geometry.js`, escape hatch, nepoužité).
  - **Un-exportované (interní):** `cellsAround`, `classifyCorner` v `grid_outline.js` — používá je jen `buildGridOutline` ve stejném modulu.
  - **Single source of truth potvrzen:**
    - **`buildSlotOutline`** v `templateRenderer.js` = jediné místo kde pipeline žije. Pořadí: `buildGridOutline → resetPositions → applyTileOffsets → inflateOutline → clampOutlineToSlot → gridOutlineToPaperPath → (smoothness ? roundCorners) → smoothBoundaryTangents`. Všechny views (canvasView, slotEditor, previewPanel) jdou přes ni.
    - **`core/grid_outline.js`** = pure data (no paper). Drží grid pointy, outline loops, transformace pozic.
    - **`core/geometry.js`** = paper layer. Konverze grid→paper, modifikace paper.Path (rounding, boundary tangents), serializace (pathToPath2D, pathToSvgD, cutOutlineToPath2D).
    - Přidání nového modifikátoru = jedna funkce v jednom z těchto modulů + jedno volání v `buildSlotOutline`.

- **2026-05-15** — cut tangenty na slot edges teď **kolmé na hranici** (kontinuita s sousedním tilem).
  - **Bug:** dragged interior vertex tilted the cut, takže na slot edge cut hit pod úhlem. Sousední tile bez deformace má cut perpendicular k té samé sdílené hraně → mismatch na boundary, viditelný úhel mezi tily.
  - **Fix:** `smoothBoundaryTangents(path, outline)` v `geometry.js`. Pro každý slot-edge segment (`onTileEdge=true`) nastaví Bezier handle na cut-straně tak, aby tangenta byla **kolmá k slot edge** (= podél inward normály do slotu). Magnitude proporcionální vzdálenosti k sousednímu vertexu (faktor 0.3).
    - Pro un-deformovaný axis-aligned cut: handles míří podél stejné osy jako cut → straight line zůstane straight. **No-op**.
    - Pro deformed cut (po dragu): cut tvoří plynulý Bezier oblouk co se k boundary natáčí kolmo. Sousední tile by měl mít cut taky kolmý → na sdílené hraně tily navazují bez úhlu.
  - **Slot corners** (oba `r` i `c` na edge) skipnuté — žádný jednoznačný kolmý směr.
  - **Always-on, no slider** — "drobná inherentní deformace" co zaručí konzistenci napříč tilesetem.
  - **Pipeline:** `... → roundCorners (pokud smoothness > 0) → smoothBoundaryTangents → render`.

- **2026-05-15, fix:** halo handles **jen v slot editoru**, overview canvas kompaktní.
  - **Bug:** předchozí změna zvýrazňovala dots globálně přes `drawOutlineDots` — propsalo se to i na velký canvas (= "mapa / preview", kde se needraguje a halo zbytečně rušilo).
  - **Fix:** `drawOutlineDebug(ctx, paperPath, outline, opts)` přibyl `opts.prominentDots` flag.
    - `canvasView` volá bez opts → compact dots (4 px barva + tmavý outline). Vrácený původní vzhled.
    - `slotEditor` volá s `{ prominentDots: true }` → halo handles (7 px white halo + 5 px color fill + dark outline). Plus konečně předává `outline` (= dots z grid modelu, jeden bod per grid point i po V1/V2 zaoblení).
  - Slot-edge body 2 px solid bez halo v obou views.

- **2026-05-15** — drag dots výraznější (white halo + dark outline).
  - Po zaoblení rohů arc bulguje do jiné pozice než kde je `outline.points` grid bod, takže dot stojí často "vedle" zobrazené geometrie a proti barevnému source A/B se ztrácel.
  - **Změna v `drawOutlineDots`:**
    - Draggable bod: poloměr 5 px (barva podle cornerType) + **white halo ring** poloměr 7 px (vně) + **dark outline 1.5 px**. Halo zajistí čitelnost proti libovolnému pozadí.
    - Slot-edge bod: poloměr 2.5 px (z 2), beze halo — pořád signalizuje "locked".
  - Hit-test radius 10 px ponechán — visual handle je nyní ~14 px diameter, takže hit zóna sedí kolem.

- **2026-05-15, fix:** `roundCorners` přepsaný na **V1/V2 insertion** (zauzlování na rohu pryč).
  - **Bug "zauzlování na hraně":** předchozí varianta nastavovala `handleIn = unit(N-V)*r`, `handleOut = unit(P-V)*r`. To **zakřivilo cuty** (Bezier control points uvnitř rohu), ale **samotný corner vertex V** zůstal sharp — tangenty incoming/outgoing se v něm protnuly s 90° kinkem. User to popsal jako "místo rohů se zakulacuje to co má barvy jako cut" — cuty se ohnuly, ale roh ne.
  - **Fix:** true chord-style smooth rounding přes **insertion dvou vertexů** V1 a V2:
    - `V1 = V + (P-V).unit * r` (na incoming hraně, distance r od V).
    - `V2 = V + (N-V).unit * r` (na outgoing hraně, distance r od V).
    - V1.handleOut a V2.handleIn směřují k V s magnitude `r * 0.5523` (Bezier-circle approximation constant). Mezi V1 a V2 tak vzniká **smooth quarter-circle Bezier**.
    - Originální V je z paper.Path **odebrán**. Grid model (outline.points) ale V drží dál — je to user-facing drag handle.
    - Oba V1 a V2 dědí `data` od V (gridPointIdx, cornerType, onTileEdge, type). Hit-test mapuje oba zpět na V's grid bod.
    - Radius clamped na `min(|VP|/2, |VN|/2)` aby V1/V2 nezasahovaly za midpointy.
  - **Důsledek:** smooth Bezier arc kolem každého rounded rohu, žádný kink. Chord-style direction zachována (handles point toward V from V1/V2 = inward).
  - **`drawOutlineDebug` updated** — bere navíc `outline` parameter. Edges kreslí z `paper.Path` (handles Bezier curves correctly), **dots z `outline.points`** (jeden bod per grid point, na V's pozici). Bez toho by user viděl 2 dots per rounded corner (V1 a V2 jsou paper segments).
  - **`slotEditor.hitTestVertex`** přepsán — iteruje `outline.points` přímo místo paper segmentů. Jeden hit-test target per grid bod, drag intuitivní.

- **2026-05-15, fix:** `smoothCutChains` (paper-based) nahrazen vlastním `roundCorners` — řeší 3 problémy najednou.
  - **Bug 1 (slider binární):** `paper.smooth({type:"asymmetric"})` saturuje rychle. Slider 0.01 = nezaoblené, slider > 0.01 = plné kolo, žádný viditelný gradient.
  - **Bug 2 (špatný směr ↖ místo ↘):** paper.smooth dělá Bezier curve s tangentou podél bisektoru, což produkuje **outward** bulge — pro outer-convex je to NW (od cell SE), pro outer-concave NW. Uživatel ale chce **inward** (chord-style): outer-convex se zaokrouhlí směrem do cell (cut off corner), outer-concave do empty cell.
  - **Bug 3 (drag-deformed midpointy se nezaobluje):** `cornerType` je statický z patternu. Strip `000/111/000` má `(1,1)` jako `cornerType: "edge"` (flat midpoint). Když user posune `(1,1)`, geometrie má skutečný roh, ale tag pořád říká `edge` → ignoruje se. User chce aby se to zaokrouhlilo i po dragu.
  - **Fix — nová `roundCorners(path, radiusPx)` v `geometry.js`:**
    - **Filtr:** rounduje vrcholy které mají `!onTileEdge` **A** obě adj `cut` **A** `cosθ(P→V, V→N) < 1 - ε` (= sousední hrany nejsou parallelní). Angle check místo `cornerType` checku — pickne i drag-created rohy.
    - **Handles (chord-style):** `handleIn = unit(N-V) * r` (směr k NEXT bodu), `handleOut = unit(P-V) * r` (směr k PREV bodu). Swap (handleIn keyed off N, handleOut off P) způsobí, že obě přilehlé Bezier curves bulguje **na stejnou stranu** rohu — INWARD. Outer-convex roh se "cuts off" do cell, outer-concave do empty cell. Magnitude clamped na `min(|VP|/2, |VN|/2)`.
    - **Slider mapping lineární:** `radius = smoothness * min(cell.w, cell.h) * 0.5`. Slider 0 = sharp roh, slider 1 = max radius (polovina cell). Lineární progresí.
  - **Důsledek pro testovací patterny:**
    - **`000/010/000`** (jeden cell): 4 outer-convex rohy. Slider 0 = ostrý čtverec, slider 0.5 = mírně zaoblený, slider 1 = max kruh (radius = cell/2). Plynulý gradient. ✓
    - **`000/011/010`** (L-shape): `(1,1)` outer-convex zaobluje SE (cut off corner do region), `(2,2)` outer-concave zaobluje SE (rounds into empty cell SE). "Jeden dovnitř, druhý ven" jak user popsal. ✓
    - **`000/111/000`** (strip): pre-drag `(1,1)` a `(1,2)` mají kolineární sousedy → angle check fails → nezaoblí. Pokud user posune `(1,1)`, sousedi přestanou být parallel → zaoblí se. ✓
  - **Vyhozeno:** `smoothCutChains` (paper.smooth wrapper). Cca 30 řádků.

- **2026-05-15, fix:** smoothness zaobluje **jen skutečné rohy** (`outer-convex` / `outer-concave`), ne flat midpointy.
  - **Bug "prohyb do středu" na strip patternu** (`000/111/000`): vertexy `(1,1)` a `(1,2)` v middle row mají `cornerType: "edge"` (= flat midpoint dvou sousedních 1-cells na rovné hraně regionu). Předchozí strict-interior pravidlo brala `edge`-type vertexy jako "interior chainu" → paper.smooth jim přidal Bezier handles → curve bulged do prázdných cellů nad/pod strip.
  - **Fix:** `cornerType` check v `smoothCutChains`. Smoothable = `(outer-convex OR outer-concave) AND obě adj cut AND !onTileEdge`. `edge` cornerType (flat midpoint) a `saddle` (ambiguous) zůstávají rovné. Slot-edge vertexy a chain endpointy taky.
  - **Důsledek pro L-shape** (`000/011/010`): smoothuje se `(1,1)` outer-convex (zakulatí vnější roh ven) a `(2,2)` outer-concave (zakulatí vnitřní zářez dovnitř). `(1,2)` a `(2,1)` edge midpointy zůstávají rovné. "Jeden dovnitř a druhý ven" — přesně co uživatel chtěl.
  - **Slider range bumpnutý 0..1 → factor 0..2.** Pro krátké chainy (1–2 segmenty) je vizuální rozdíl mezi `factor=0.3` a `factor=0.9` malý. Rozšíření rozsahu dává slideru víc viditelného pohybu od off do "strong rounding".
  - **Open:** `smoothness` jméno je matoucí. Lepší by bylo `cornerRoundness` / `roundCorners` (semantika = zaoblení rohů, ne smoothing celé křivky). Renaming = `state._globalCurve` key + UI label v `index.html` + slider id + handler v `curvePanel.js`. ~5 míst. Zatím odloženo do potvrzení.
  - **Saddle (cornerType)** se ve standardních patternech (minimal16, blob47) neobjevuje — saddle vyžaduje diagonal in/out (např. checkerboard `100/010`). Není to bug, jen vzácný case. Pro vyzkoušení saddle code path lze přidat custom test pattern.

- **2026-05-15, fix:** smoothness aplikuje jen na **striktní vnitřek** cut chainu + debug paleta rozšířená.
  - **Bug "burtíky u hran":** předchozí reset handles v `smoothCutChains` nullovala jen `handleOut` na vertexech kde outgoing je closure, a `handleIn` kde incoming je closure. Pro slot-edge vertex s cut příchozí + closure odchozí (typický rohový vertex slot-edge) zůstal `handleIn` nenulový → curve se ohýbala u slot edge → bulge ("burtík").
  - **Fix:** striktní pravidlo — smooth jen pokud vertex je **plně uvnitř cut chainu**, tj. **NENÍ** na slot edge **A** obě přilehlé hrany jsou `cut`. Cokoliv jiného (chain endpoint, slot-edge vertex, closure vertex) má oba handles vynulované → curve přichází/odchází rovně. Cut chains se zaoblí jen ve svém vnitřku, u boundary zůstávají rovné.
  - **Slider range:** podle uživatele se chová binárně. Po strict-interior fixu se smoothing aplikuje jen na vertexy ve vnitřku chainu — pro krátké chainy (plus pattern má chainy délky 1 segment) je rozdíl mezi `factor=0.3` a `factor=0.9` vizuálně mírný. Slider stejně předává `0..1` přímo do paper smooth factor. Pokud po fixu pořád feeling binární, můžeme zkusit jiné smooth type (`catmull-rom`) nebo non-linear mapping.

- **2026-05-15** — debug palette dokumentovaná + rozlišení draggable/locked vertexů.
  - **Komentář s legendou** v `templateRenderer.js` (DEBUG_EDGE_COLOR + DEBUG_VERTEX_COLOR) — každá kategorie má jednu jasnou barvu, lze referovat "ten oranžový bod" atd.
  - **Edges**: cut=červená, closure=modrá, internal=šedá, unknown=fuchsia.
  - **Vertexy podle `cornerType`**: outer-convex=žlutá, outer-concave=oranžová, edge=šedá, saddle=fuchsia.
  - **Vertexy podle deformability**:
    - **`onTileEdge`** (locked nebo slides along its edge): malý solid bod (radius 2 px).
    - **Interior** (plně draggable): větší disc s tmavým ring kolem (radius 4 px) — vypadá jako "handle", signalizuje že je interaktivní.

- **2026-05-15** — smoothness slider zapojený (corner rounding na cut chains).
  - **`smoothCutChains(path, factor)`** v `geometry.js`: na každý sub-path zavolá `paper.smooth({ type: "asymmetric", factor })` (Catmull-Rom-like — křivka prochází body, tangenty navazují přes sousedy), pak vynuluje `handleIn`/`handleOut` na segmentech jejichž **přilehlá** hrana není `cut`. Closure segmenty zůstávají rovné, cut chains se zaoblí. Přechody cut↔closure jsou C0 (poloha spojitá), ne C1 (handles vynulované z jedné strany).
  - **`cutOutlineToPath2D`** updatováno: emituje `bezierCurveTo` když má segment handles, jinak `lineTo` (backwards compatible se smoothness=0).
  - **`drawOutlineDebug`** taky updatováno aby kreslilo Bezier — jinak by debug overlay ukazoval rovné čáry zatímco renderer kreslí křivky (mismatch).
  - **`buildSlotOutline`** pipeline: `... → inflateOutline → clampOutlineToSlot → gridOutlineToPaperPath → smoothCutChains`. Smooth je poslední (paper-side) krok, na deformovaných pozicích.
  - **Slider mapping:** `state.globalCurve.smoothness` (0..1) předané přímo jako paper smooth `factor`. Pro 0.5 = standardní Catmull-Rom, vyšší = silnější ohyb. Pokud se UX ukáže špatně, lze tunit.

- **2026-05-15, fix:** post-inflate clamp na slot bounds.
  - **Bug:** drag offset je clampnutý na hranice slotu, ale `inflateOutline` se aplikuje **až po** drag offsetu, takže bod nakonec mohl skončit za hranou slotu (např. drag na slot edge + inflate posunul ho po normále ven).
  - **Fix:** nová funkce `clampOutlineToSlot(outline)` v `grid_outline.js`. Po inflate (poslední krok pipeline) zarovná každý `inOutline` bod do `[origin, origin + size]` per osa. Drag handle nikdy nevypadne ze slotu, outline nikdy neleakuje ven.
  - **`buildSlotOutline`** v templateRenderer: pipeline teď končí `inflateOutline → clampOutlineToSlot → gridOutlineToPaperPath`.

- **2026-05-15, fix:** drag se clampuje na slot bounds.
  - **Bug:** drag bodu uvnitř tilu šel přetáhnout mimo slot canvas. Po release uživatel nemohl bod chytit zpět, protože drag handle byl mimo viditelnou plochu.
  - **Fix:** `slotEditor.onMouseDown` zachytí `bounds` per dragovaný bod podle jeho `r`, `c` vs. `outline.rows`, `cols`. V cell-fraction jednotkách:
    - `dx ∈ [-c, cols - c]` (= effektivní x ∈ `[0, size]`)
    - `dy ∈ [-r, rows - r]`
  - `onMouseMove` clampuje obě složky před voláním `setTileOffset`. Storage drží jen reálné dosažitelné hodnoty — bod je vždy uvnitř slotu.

- **2026-05-15, dead code sweep:** vyhozen `paperjs-offset` CDN tag z `index.html` (knihovna se v render pipeline už nepoužívá), aktualizovány stale komentáře co referovaly paperjs-offset jako live dependency. Kód je čistý.

- **2026-05-15, fix:** inflate teď nechává slot-edge body **klouzat podél své hrany** (oprava "burtík" efektu).
  - **Bug:** předchozí `inflateOutline` skipoval **všechny** `onTileEdge` body. Důsledek: vnitřní rohy (outer-concave) se hezky vypouchly do prázdných cellů, ale slot-edge body zůstaly přesně na svém `basePos` → ramena plus tilu zůstala rovná a úzká, zatímco střed se vypoukl → "burtíky" se schodištěm mezi ramenem a středem.
  - **Fix:** `inflateOutline` rozliší tři režimy:
    - **Slot corner** (`r` *i* `c` na hraně, např. `(0,0)`, `(0,cols)`, `(rows,0)`, `(rows,cols)`) — zamčený dvěma boundary, nehne se.
    - **Slot edge interior** (jen jedno z `r`/`c` na hraně, např. `(0,1)`) — drží se na slot edge (kolmá osa pinnutá `basePos`), ale **klouže podél hrany** o `amountPx * sign(outwardNormal.projection)`. Bez miter faktoru: na tomhle rohu je jen jedna cut hrana aktivní (druhá je closure podél boundary, který neroste perpendicular).
    - **Interior outline bod** — full miter push (`amountPx * √2` pro 90° rohy, `* 1` pro flat edge midpointy, `0` pro saddle).
  - **Důsledek pro plus pattern (`010/111/010`)**:
    - `(0,1)` (vrchol levého horního cutu): `outwardNormal = NW`, projekce na top edge je x-složka = -1/√2 → sign = -1 → push x by `-inflate`. Bod jde na `(133-inflate, 0)` ✓ pořád na slot top edge.
    - `(0,2)` (vrchol pravého horního cutu): projekce sign = +1 → push x by `+inflate`. Bod jde na `(266+inflate, 0)` ✓.
    - `(1,1)` (outer-concave interior): full miter NW → `(133-inflate, 133-inflate)`.
    - Horní rameno: closure (0,1)→(0,2) se rozšíří z `[133, 266]` na `[133-inflate, 266+inflate]`. Cut (1,1)→(0,1) zůstává vertikální v `x=133-inflate`. Rameno **roste do šíře**, zachovává tvar.

- **2026-05-15, fix:** vyhozen paperjs-offset z render pipeline, inflate teď na grid úrovni.
  - **Bug:** debug logy ukázaly že paperjs-offset **redukuje segment count** i pro malé hodnoty (např. 8→4, 6→4 při `inflate=0.2 px`). Collapsuje near-degenerate edges. Důsledek: mým NN přiřadit `data.type` mezi dvěma konsekutivními post segy hledalo edge mezi non-sousedními grid body → `"unknown"` → outline mizí, drag handles ztracené. Pro libovolně malý inflate.
  - **Fix:** `inflateOutline` v `core/grid_outline.js` — pushne každý outline bod podél jeho `outwardNormal` o `amountPx * miterFactor`. Slot-edge body skipne (zachovají `basePos`). Saddly skipne (nemá well-defined normálu).
    - `outwardNormal` se pre-computuje při `buildGridOutline` z `cellsAround`: každý quadrant pushe normálu k empty cellům, in cells pushe pryč. Norm.
    - `miterFactor` = `√2` pro outer-convex / outer-concave (90° rohy), `1` pro edge midpoint, `0` pro saddle / inside / outside.
    - Normála se pro každý bod počítá z **statického patternu**, ne z post-drag geometrie. Pro nedeformované 90° rohy je to přesný miter offset. Pro post-drag rohy je to aproximace — ale stabilní: sharp post-drag úhly nezpůsobí explozi (paperjs's true miter by exploudoval na miter limit a přepnul na bevel).
  - **`buildSlotOutline`** v `templateRenderer.js`: `resetPositions → applyTileOffsets → inflateOutline → gridOutlineToPaperPath`. Žádné post-paper kroky. paper.Path se buduje až jako poslední krok, ze už-deformovaného grid modelu. Tagy (cut/closure/gridPointIdx/cornerType/onTileEdge) projdou přímo přes `gridOutlineToPaperPath` bez ztráty.
  - **Vyhozeno:** `inflateRegion` (paperjs-offset wrapper), `tagInflatedPath` (post-paper NN re-tag), `snapTileEdgePoints` (snap), import `PaperOffset` z `geometry.js`. Cca 200 řádků.
  - **`paperjs-offset` zůstává jako CDN dependence** (v `index.html`), ale není používán v render pipeline. Můžeme později vyhodit i CDN tag pokud nebude potřeba. Pro teď zachovat — jistý use-case může být.
  - **Důsledek:** inflate stabilní pro libovolný amount (až do `cell/2`, pak rohy by se mohly self-intersectovat). Žádný segment collapse, žádné mizení outline, žádný drag-handle loss. Plus pattern + drag + inflate funkční ve všech kombinacích.
  - **`main.js` smoke test** updatován: testuje `gridOutline.inflateOutline` místo `geom.inflateRegion`. Output: `[grid] inflateOutline(L-shape, +8): segs N → N` (segment count se nemění).

- **2026-05-15, fix:** snap on slot edges teď drží **obě** souřadnice, NN tolerance zvednutá, debug logy.
  - **Bug 1 (úskok do strany):** předchozí `snapTileEdgePoints` snapnul jen tu souřadnici co je kolmá k slot edge (např. `y=0` pro top edge), ale podél hrany x zůstalo na hodnotě po paperjs-offset diagonálním pushi → slot-edge body se posouvaly podél své hrany. Fix: snap pin obě souřadnice na `gp.basePos` — slot-edge body jsou plně uzamčené (jen výchozí pozice je legitimní pozice). Cuty co vedou ze slot-edge bodu do interior stále rostou ven (interior endpoint posunut o inflate), ale slot-edge endpoint je fix.
  - **Bug 2 (outline mizí):** NN tolerance `inflate * √2 + 2` podcenila miter factor pro **ostré konkávní úhly po dragu**. paperjs-offset pro takový roh produkuje push o víc než `inflate*√2` (miter factor exploduje). Post seg pak skončí dál než tolerance → `tagInflatedPath` nepřiřadí `data` → outline ten segment přeskočí → kus outline mizí. Fix: tolerance = `min(cell.w, cell.h) / 2`. V rámci poloviny cell je vždy jen jeden grid bod nejbližší → NN je jednoznačný a tolerance pokryje i extrémní miter factor (do té doby paperjs-offset přepne na bevel a nebude se snažit dále).
  - **Diagnostika:** `window.__TILESET_DEBUG__ = true` v konzoli zapne:
    - `console.warn` ve `tagInflatedPath` když NN match selže — vypíše pozici seg, current tolerance, nearest grid point a vzdálenost. Užitečné pro debugging "outline mizí" případů.
    - `console.log` v `buildSlotOutline` per slot s inflate > 0 — inflate px, segment count před / po inflate, tolerance. Sleduje co paperjs-offset udělal (přidal/odebral segmenty, atd).

- **2026-05-15, fix:** post-inflate tagging cestou grid-point matching (oprava regression z `carryTagsThroughInflate`).
  - **Bug:** předchozí fix (`carryTagsThroughInflate` se same-topology fast pathem) předpokládal, že `paperjs-offset` zachová pořadí segmentů. Nezachovává — může výsledný path rotovat nebo otočit winding. 1:1 copy podle indexu pak přiřadila tagy špatným segmentům, `snapClosuresToBoundary` snapnul **cut endpointy** na slot edge (myslel si že jsou closure), což zkolapsovalo geometrii ke hraně tilu. Symptom: i bez dragu se na plus patternu (`010/111/010`) tile rozlamoval — outer-concave inner corners se táhly k okrajům.
  - **Příčina:** any reliance on segment correspondence between pre- and post-inflate path. paperjs-offset to negarantuje.
  - **Fix:** nové dvě funkce v `core/geometry.js`, obě používají grid model jako ground truth:
    - **`tagInflatedPath(postPath, outline, tolerance)`** — pro každý post-inflate segment NN-matchne nejbližší grid bod v `outline.points` (kde `inOutline=true`). Z grid bodu přiřadí `gridPointIdx`, `cornerType`, `onTileEdge` na `seg.data`. Pro `data.type` použije bidirectional edge-type lookup (`fromIdx → toIdx` i opačně) — funguje i když paperjs-offset otočil winding.
    - **`snapTileEdgePoints(path, outline)`** — projde segmenty, pro každý s `data.gridPointIdx` najde grid bod, a pokud má `onTileEdge=true`, snapne `seg.point` na slot edge podle `gp.r` (top/bottom) / `gp.c` (left/right). Žádná závislost na `data.type === "closure"`, žádné rozhodování horizontal/vertical z geometrie — rovnou z grid identity.
  - **Vyhozeno z `geometry.js`:** `carryTagsThroughInflate` (fragile), `snapClosuresToBoundary` (závisí na `data.type` po unreliable carry), `classifySegments` + helper `classifyEdge`/`classifyByCells`/`cellValue` (nepoužívané, midpoint test nefungoval na deformovaných segmentech). Ušetřeno ~120 řádků.
  - **`buildSlotOutline`** v `templateRenderer.js`: `inflateRegion → tagInflatedPath → snapTileEdgePoints`. Tagging i snap teď používají `outline` (grid model) jako ground truth, ne paper-side dat.
  - **Důsledek:** drag i outline funkční po inflate, bez kolapsování geometrie. Plus pattern, který predtím šel "k okraji", zůstává správný tvar.

- **2026-05-15, fix:** tagy přežívají inflate (drag i outline opět funkční po inflate).
  - **Bugy:** (1) po `inflate > 0` na slotu s tile-dragem nelze ten slot dál editovat — drag handles zmizí. (2) Na slotu s tile-dragem se po inflate ztratí outline stroke (cut čáry).
  - **Příčina obou:** paperjs-offset vrátí nový `paper.Path` jehož segmenty nemají `data` tagy. Náhradní `classifySegments` v geometry.js používá midpoint test — funguje na axis-aligned segmenty, ale deformované (po drag offsetu) jsou šikmé → tag = `"unknown"`. `cutOutlineToPath2D` filtruje `data.type === "cut"` → deformované segmenty nestrokuje (bug 2). Hit-test v `slotEditor.js` filtruje `data.gridPointIdx != null` → deformované segmenty nemají grid mapping, drag nezačne (bug 1).
  - **Fix:** nová funkce `carryTagsThroughInflate(prePath, postPath, tolerance)` v `core/geometry.js`. Snapshot tagů na pre-inflate path, po inflate nacopy z pre na post. Fast path: same-topology (= miter offset zachovává segment count) kopíruje 1:1 podle indexu. Fallback: nearest-neighbor v rámci tolerance. Tolerance = `inflate * √2 + 2 px` (max miter posun u 90° rohů).
  - **`buildSlotOutline`** v `templateRenderer.js` teď volá `carryTagsThroughInflate` místo `classifySegments` po inflate. `snapClosuresToBoundary` zůstává (čte `data.type === "closure"` z nesených tagů a snapne endpointy zpět na slot edge).
  - **Důsledek:** drag handles na deformovaných slotech jsou hittovatelné i po inflate (carried `gridPointIdx`). Cut outline strokuje i deformované segmenty (carried `data.type === "cut"`). Segmenty co paperjs-offset přidal navrch (round joints — u nás default miter, takže nepřichází) zůstávají bez tagů → nestrokují / nedají se drag-nout (correct, nejsou v gridu).

- **2026-05-15, fix:** tile offsety v jednotkách cell, ne pixelů.
  - **Bug:** drag o pár pixelů v slotEditoru posunul bod na velkém canvasu o desítky pixelů — offset se ukládal v editor-canvas pixelech, ale velký canvas má menší cell, takže ten samý dx v px = mnohem větší zlomek tilu na overview.
  - **Fix:** `tileOffsets[key] = { dx, dy }` jsou teď v **cell-fraction units** (`dx = 0.5` znamená "půl šířky cell"). `applyTileOffsets` v `grid_outline.js` násobí `cell.w` / `cell.h` na čtení. `slotEditor` na writeu dělí mouse delta `cell.w` / `cell.h`. Drag delta v px se převádí podle editor cell size; render aplikuje podle view-specific cell size. Důsledek: drag o N px v editoru = posun o N px **při stejném zoom**, ale na menším overview se proporcionálně škáluje.

- **2026-05-15** — Per-tile drag editor v pravém panelu + debug overlay sleduje inflate.
  - **Role views vyjasněny:** velký canvas zůstane jako overview / budoucí "mapa" (= zobrazení celé šablony). **Editace konkrétního tilu žije v pravém panelu** (`view/slotEditor.js`), ne na velkém canvasu. Debug overlay zůstává na velkém canvasu — užitečné jako overview "co se kde děje" napříč všemi tily.
  - **Debug overlay fix:** dřív kreslil z grid loops (pre-inflate body), takže při `inflate > 0` se rozjelo s rendererem. Teď kreslí z `built.paperPath` segmentů (post-inflate i post-reclassify). `gridOutlineToPaperPath` přidává `data.onTileEdge` na segmenty aby vertex dots věděly, kdo je draggable a kdo ne, i po offsetu. Sdílený `drawOutlineDebug(ctx, paperPath)` helper exportován z `templateRenderer.js` — používá ho canvasView i slotEditor (jedna implementace barev).
  - **`view/slotEditor.js` přepsán** z 120×120 statické vizualizace na full-panel editor:
    - Auto-fit canvas na čtverec `min(availW, availH)`. ResizeObserver na stage.
    - Renderuje stejnou pipeline jako preview: source B background → source A clipped → debug overlay (cut/closure edges + vertex dots) navrch.
    - **Drag interakce:** `mousedown` na vertex dot (hit-test radius 10 px, ignoruje `onTileEdge` body a body bez `gridPointIdx` — to zachycuje post-offset segmenty bez grid kotvy) → `state.setTileOffset(slotIdx, key, dx, dy)` na každém `mousemove`, dokud uživatel nepustí. Pravý klik na bod → `state.clearTileOffset` (reset zpět na 0). Mouse handlers jsou na `window` aby drag pokračoval i mimo canvas.
    - `pointKey(r, c)` z `core/grid_outline.js` pro serializaci offsetů.
  - **`buildSlotOutline` v `templateRenderer.js` teď exportované** — slotEditor přes něj sdílí přesně stejnou pipeline (zero duplikace mezi velkým canvasem, preview a editorem).
  - **CSS:** `.slot-editor__stage` (flex grow, center child), `.slot-editor__canvas` (cursor grab/grabbing). `.parameters` přepnut na `flex: column` + `min-height: 0` aby stage uvnitř mohl správně grow.
  - **Známý drobný behavior s inflate:** drag delta v canvas coords se mapuje 1:1 na grid offset. Po `inflate > 0` je hit-test proti post-inflate pozicím (correct), ale drag amount se aplikuje na grid bod (= miter inflate ho dál odsune). V rovných partiích to sedí 1:1, v rozích lehce „klouže" o miter coefficient. Akceptabilní pro teď; čistý fix přijde s vlastním inflate na grid úrovni (per-bod outward normála) — TODO až s wave/noise.

- **2026-05-15, hotovo:** refaktor na grid-based outline model **proveden**.
  - **`core/grid_outline.js`** — nový modul, pure data layer (žádný paper import). API:
    - `buildGridOutline(pattern, cell, origin) → { points, loops, rows, cols, cell, origin }` — (rows+1)×(cols+1) grid bodů + uspořádané loopy hran. Saddle bod (diag in/out) je split na 2 loopy.
    - `resetPositions(outline)` — `pos = basePos`. Volat na začátku každé pipeline pass.
    - `applyTileOffsets(outline, tileOffsets)` — drag deformace. Body s `onTileEdge=true` se ignorují (slot edges fixní).
    - `effectivePos(point)` → vrací `point.pos`. Konzumováno `gridOutlineToPaperPath` v geometry.js.
    - `pointKey(r, c)` → `"r{r}c{c}"`. Stabilní ID pro serializaci tileOffsets.
    - `classifyCorner(cells)` → `"inside"|"outside"|"outer-convex"|"outer-concave"|"edge"|"saddle"`. Z `cellsAround(pattern, r, c)`.
    - `forEachEdge(outline, fn)` — iterace přes všechny edges + endpointy.
  - **`core/geometry.js`** — paper layer. Změny:
    - **Přidáno:** `gridOutlineToPaperPath(outline)` — konzumuje grid model, produkuje `paper.Path | CompoundPath`. Segmenty si nesou `data.type = "cut" | "closure"` ze hran. Po offsetu/booleanu tagy nepřežijí — pak musí proběhnout `classifySegments`.
    - **Vyhozeno:** `buildRegionFromPattern` (cca 30 řádků), `getSegmentsByType` (nevyužité).
    - **Ponecháno:** `classifySegments`, `snapClosuresToBoundary`, `inflateRegion`, `pathToPath2D`, `pathToSvgD`, `cutOutlineToPath2D`, `pathSegmentCount`, `_scope`. Stále potřeba pro post-inflate cestu (paper offset zničí grid tagy → midpoint reclassifier je obnoví).
  - **`view/templateRenderer.js`** — sjednocený `buildSlotOutline(slot, x, y, size)` jako jediný preprocess (~30 řádků). Renderer (`drawSlot`) i debug overlay (`drawCurveDebug`) ho oba volají; rozcházejí se až ve výstupu. Modifikační pipeline (smooth/wave/noise) má jeden hook bez duplicity:
    ```
    buildGridOutline → resetPositions → applyTileOffsets
       → (TODO applyWave / applyNoise)
       → gridOutlineToPaperPath
       → (TODO smooth)
       → inflateRegion → classifySegments → snapClosuresToBoundary
    ```
    Debug overlay teď kreslí outline edges z grid loopů přímo (cut=červená, closure=modrá) a vertex dots s barvou per `cornerType` (`outer-convex` žlutá, `outer-concave` oranžová, `edge` šedá, `saddle` fuchsia). `onTileEdge` body mají menší dot — vizuální signál "nedraggable".
  - **`controller/state.js`** — `_tileOffsets: Map<slotIndex, Record<pointKey, {dx,dy}>>` + `getTileOffsets/setTileOffset/clearTileOffset/clearTileOffsetsForSlot` + event `tile-offsets:changed`. Auto-clear na `setTemplate`. UI ne, jen storage — renderer pipeline ho už čte.
  - **`canvasView.js` + `previewPanel.js`** — naslouchají `tile-offsets:changed` (re-render až přijde drag UI).
  - **`main.js`** — smoke test přepsaný na `gridOutline.buildGridOutline` + `geom.gridOutlineToPaperPath` + `inflateRegion`. `window.geom` + `window.gridOutline` jako REPL hooks. Včetně nového patternu `vertical 1x2 column` (case co uživatel vytáhl při diskuzi per-tile drag).
  - **Otevřené pro další iteraci:**
    - Drag handles na vertex dots + hit-test na canvasu → state.setTileOffset. Zoom-in/detail mode po výběru tilu (větší canvas, vidí jen vybraný tile s handles).
    - Smoothness — `path.smooth({ type: "continuous", factor })` po `gridOutlineToPaperPath`, jen na cut chains.
    - Wave + noise — vlastní mutace `point.pos` v grid pipeline (před paper konverzí), simplex-noise + seedrandom z CDN.
    - Lepší inflate — vlastní per-bod outward (normála z `cellsAround`) → tagy přežijí, není potřeba post-inflate classifier. Až bude smooth + wave funkční.
    - Vizualizace `point.mods` — až přijde druhý modifier; teď debug overlay kreslí jen `cornerType`.

- **2026-05-15** — 🔄 Rozhodnutí: refaktor na **grid-based outline model** (paper.js zůstává, ale jen jako helper).
  - **Problém:** současný model (`buildRegionFromPattern` → paper unite → midpoint `classifySegments`) škálí špatně pro per-tile drag deformace. Po posunutí vertexu midpoint test ztratí orientaci (segment už není axis-aligned → tag = `"unknown"`). Plus `subdivideAtInteriorGridPoints` by byl crutch nad crutchem, a vstupy normal-based classifieru jsou další ohyb.
  - **Nový model:** **`(rows+1)×(cols+1)` grid bodů** jako source of truth (pro 3×3 pattern → 4×4 = 16 bodů). Každý bod má **stabilní identitu `(r, c)`** a metadata:
    ```
    point = {
      r, c,
      basePos: { x, y },                       // grid intersection in pixels
      offset: { dx, dy },                      // per-tile drag (default 0)
      flags: { onTileEdge, inOutline },
      cornerType: "outer-convex" | "outer-concave" | "edge" | null,
      mods: { smooth: 0, wave: 0, noise: 0 }, // tagy modifikací — debug může barvit
    }
    ```
    Outline = uspořádaná sekvence indexů do pole bodů (po obvodu 1-regionu, smyček může být víc — disjoint regiony / díry).
  - **Klasifikace teď žije na bodech, ne segmentech.** Spočítá se z patternu **čistě combinatoricky** (`cellsAround(r, c)` = NW/NE/SW/SE 0/1/OOB → cornerType). Drag/wave/noise ji nepoškodí — bod si flagy nese.
  - **Stack zůstává:** paper.js + paperjs-offset + (později simplex-noise + seedrandom). **Žádná další knihovna** — procházel jsem d3-shape (Catmull-Rom), bezier-js, martinez; nic nedá víc, než co paper umí.
  - **Paper.js = compute engine** pro: inflate (PaperOffset), smooth corners (`path.smooth`), SVG export, boolean ops (později). Grid model je vstup, paper.Path se generuje na demand.
  - **Pipeline:**
    ```
    pattern + state.tileOffsets[slotIdx]
       ↓
    buildGridOutline      (vlastní — body + outline loops + flags)
       ↓
    applyTileOffsets      (vlastní — drag deformace)
       ↓
    applyWave / applyNoise (vlastní — jen na body s onCutEdge)
       ↓
    gridOutlineToPaperPath (konverze: segmenty si nesou data.type, gridPointIdx)
       ↓
    applySmooth (paper)    ← jen pokud smoothness > 0
       ↓
    inflateRegion (paper)  ← jen pokud inflate > 0
       ↓
    ┌──────────────┬──────────────────────────────────────┐
    │ Renderer:    │ Debug:                                │
    │ clip+draw +  │ kreslí body + segmenty barvou        │
    │ stroke cuts  │ podle edge.type / point.cornerType   │
    └──────────────┴──────────────────────────────────────┘
    ```
    Renderer i debug overlay sdílí pipeline až po `gridOutlineToPaperPath` — `buildSlotOutline(slot, params, tileOverrides?)` je jediné místo kde se preprocess provádí. Sjednoceno (cíl uživatele).
  - **Co vypadne z `geometry.js`:** `buildRegionFromPattern`, `classifySegments`, `snapClosuresToBoundary`, `getSegmentsByType`, `cutOutlineToPath2D`. Cca 200 řádků.
  - **Co zůstane v `geometry.js`:** `inflateRegion`, `pathToPath2D`, `pathToSvgD` — pure paper helpers + `_scope()` pro diagnostiku.
  - **Per-tile drag — storage teď, UI později.** `state.tileOffsets: Map<slotIndex, { [pointKey]: {dx, dy} }>` kde `pointKey = "r1c1"`. Drag handles, hit-test, zoom-in detail mode → další fáze.
  - **Tag model modifikací:** `point.mods = { smooth, wave, noise }` jako 0..1 čísla. Debug overlay teď jen kreslí podle `cornerType` (cut/edge/corner) — `mods` se začne barvit až přijde druhá modifikace (jednoduchá vizualizace, ne na dvou frontách).
  - **Edge body co se NESMÍ tahat:** `onTileEdge=true` (r=0, r=rows, c=0, c=cols). Slot edges jsou fixní → propojení tilů v tilesetu nevyžaduje synchronizaci. Velký win, ušetří shared-vertex pattern.
  - **Implementační kroky (TaskCreate #1–#5):**
    1. Update AGENTS.md (tenhle log entry).
    2. `core/grid_outline.js` — datový model, builder, edge chaining, paper konverze.
    3. Přepsat `view/templateRenderer.js` na grid model. Sjednocená pipeline pro renderer + debug.
    4. `state.tileOffsets` storage (bez UI).
    5. Vyhodit dead kód z `geometry.js`, updatovat smoke test v `main.js`.

- **2026-05-14** — ✅ Paper.js adopce, sekce 1 + 2 + 3.1 + 2.4 + 11 hotové. Pipeline funguje.
  - **Sekce 1 (setup):** CDN `paper@0.12.18` + `paperjs-offset@1.0.8` přidané do `index.html` jako klasické UMD `<script>` tagy. Načítají se synchronně **před** ES modulem `main.js`, takže `window.paper` a `window.PaperOffset` jsou k dispozici. (Pozn: `simplex-noise` a `seedrandom` zatím nepřidané — přijdou se sekcí 4.)
  - **`core/geometry.js`** je jediný modul co importuje `window.paper` + `window.PaperOffset`. Inicializace: `new paper.PaperScope()` + `scope.setup(new scope.Size(1, 1))` (data-only mód — bez canvasu, dummy 1×1 project). Path konstruktory volané s `insert: false` aby neeskalovaly do project tree.
  - **Veřejné API** `geometry.js`:
    - `buildRegionFromPattern(pattern, cell, origin) → paper.Path | CompoundPath | null` — unite všech 1-cell `Path.Rectangle`. Holes/disjoint regiony → `CompoundPath`.
    - `inflateRegion(path, amount, { jointType }) → path` — wrapper kolem `PaperOffset.offset` (default miter join). Po offsetu volat re-classify.
    - `classifySegments(path, pattern, cell, origin) → path` — každému segmentu nasaaí `data.type = "cut" | "closure" | "internal" | "unknown"` podle midpointu. Midpoint test: zjisti zda je segment horizontální/vertikální, najdi cell-grid line (round), klasifikuj podle cells na obou stranách (out-of-bounds = `closure`, 1↔0 = `cut`, 1↔1 = `internal`).
    - `getSegmentsByType(path, type) → Segment[]` — iterace pro outline / debug.
    - `pathToSvgD(path) → string`, `pathToPath2D(path) → Path2D` — serializace.
    - `cutOutlineToPath2D(path) → Path2D` — buduje Path2D jen z `"cut"` segmentů jako otevřené polylines. Rotuje iteraci tak aby chaina začínala po non-cut transition (chains se nezalomí přes konec pole).
    - `pathSegmentCount(path)`, `_scope()` — diagnostika.
  - **Známé limity classifieru:**
    - Po offsetu jen pro `amount < min(cellW, cellH) / 2` (midpoint test rounduje na nejbližší cell line). Slider `inflate` dává `0..minCell/2`, takže na max je to borderline.
    - Po nelineárních modifikacích (round-join offset, smooth, displacement) jsou segmenty curve → `"unknown"`. Fix: normal-based classifier (sample inside/outside, použij `path.clockwise` orientaci). TODO.
  - **Sekce 11 (integrace):** `view/templateRenderer.js` spadl z ~480 řádků na ~280. `drawSourceClippedToRegion` teď je 5-step pipeline:
    ```
    buildRegionFromPattern(pattern, cell, origin)
      ↓ (volitelně) inflateRegion(region, inflatePx)
    classifySegments(region, pattern, cell, origin)
      ↓
    pathToPath2D(region)        → ctx.clip() + drawImage(source A)
    cutOutlineToPath2D(region)  → ctx.stroke()
    ```
    Sources A/B se kreslí stejně jako dřív (B background, A clipped). Outline `lineCap`/`lineJoin: round`.
  - **Sekce 2.4 (debug overlay):** `drawCurveDebug` v `templateRenderer.js`. **Canvas (editor) vždy** kreslí curve debug (segmenty barvami podle typu + vertex tečky + faint cell tint + grid). **Preview** kreslí finální render. Žádný globální debug flag — split podle role view.
    - Barvy: `cut=#ff4757` (červená), `closure=#3498db` (modrá), `internal=#9aa0a6` (šedá), `unknown=#e040fb` (fuchsiová).
    - `DEBUG_SHOW_ARRAY` const odstraněn z `main.js`. `initCanvasView()` už nepřijímá parametry.
  - **Co se vyhodilo z `templateRenderer.js`:**
    - `buildBoundaryOps`, `emitCellRect`, `emitInnerBulges`, `emitBulge`, `sideType`, `buildPathFromOps`, `isInnerConcaveCorner`, `cols`, `drawArrayDebug` — celý ručně psaný boundary builder. Cca 250 řádků pryč.
  - **Funkční sliders:** `inflate` (přes PaperOffset), `outlineWidth`, `outlineColor`. **TODO:** `smoothness`, `waveAmplitude`, `waveFrequency`, `noise`.
  - **`main.js` smoke test** (geometrySmokeTest IIFE) loguje výsledky pro 5 patternů + ověřuje `inflateRegion`. `window.geom` vystavený jako REPL hook — odstranit až bude renderer plně stable.

- **2026-05-14, fix:** closure segmenty zůstávají na hranici slotu i při inflate.
  - **Bug:** `PaperOffset.offset` posouval *všechny* segmenty rovnoměrně ven, takže i closure (slot-edge, terén pokračuje do sousedního tile) se odsunul o `inflate` mimo slot. Modrá debug čára vizuálně "ujela" za okraj tile, a fill region by leakoval do sousedního tile při skládání tilesetu.
  - **Fix:** nová funkce `snapClosuresToBoundary(path, pattern, cell, origin)` v `geometry.js`. Po `classifySegments` najde každý closure segment, určí jeho orientaci (horizontal/vertical) podle |dx| vs |dy|, a SNAPne oba endpointy zpátky na nejbližší slot edge (top/bottom pro horizontal, left/right pro vertical). Sousední cut segmenty endpoint sdílí (`segment.point` je shared object napříč sousedy v Paper.Path) — jejich konce se přizpůsobí automaticky.
  - **Volá se v rendereru** za `classifySegments` když `inflatePx > 0`, jak v `drawSourceClippedToRegion` tak v `drawCurveDebug`.
  - **Výsledek:** modré čáry vždy na slot edge, červené (cut) plavou ven podle inflate, rohy kde se potkávají sedí na slot edge ale posunuté po cut axis.

- **2026-05-14, TODO refaktor:** sjednotit renderer + debug overlay.
  - `drawSourceClippedToRegion` (renderer) a `drawCurveDebug` (debug overlay) momentálně dělají **skoro to samé**: oba volají `buildRegionFromPattern` → optional `inflateRegion` → `classifySegments` → optional `snapClosuresToBoundary`. Pak se rozcházejí: renderer kreslí `clip + drawImage + stroke`, debug kreslí segmenty barevně + vertex dots.
  - Vzniká **duplicita** té pipelinové části. Pokud přidáme smoothness / wave / noise, musí se to zaduplikovat na obě místa nebo to půjde out-of-sync.
  - **Plán:** extrahovat shared helper, např. `buildSlotRegion(slot, x, y, size) → { region }` co dělá ten celý preprocess. `drawSourceClippedToRegion` a `drawCurveDebug` ho oba volají a jen jinak vykreslí výstup. Modifikační pipeline (inflate/smooth/wave/noise) je pak v jediném místě.
  - Případně jít dál a mít `prepareRegions(template) → Map<slotIndex, region>` co se přepočítá při `template:changed` / `global-curve:changed`, view jen čte. To by zase oddělilo Paper.js volání od view loopu (perf benefit při častém re-renderu).

- **2026-05-14, plán dalších kroků:**
  1. **Smoothness (sekce 3.2 / 3.3):** corner rounding na **jen cut** segmentech. Dvě možnosti:
     - `path.smooth({ type: "continuous", factor: smoothness })` aplikovaný na cut chains (najít chain, dočasně izolovat, smooth, vrátit). Bezier handles, ne mění body.
     - Vlastní `roundOuterCorners(path, radius)` — pro každý outer convex roh nahradit dvěma body + quarter-arc.
  2. **Wave/noise (sekce 4):** přidat `simplex-noise` + `seedrandom` z CDN, `displaceCutSegments(path, params)` — resample cut chain na N bodů, posunout podle 2D simplex noise s amplitudou. Po displacement re-classify ne — `data.type` se přenese jako tag z původního segmentu (pře-resamplování zachová tag per nový bod).
  3. **Lepší classifier:** normal-based. Vzorkuj bod EPS uvnitř a EPS vně podél normály segmentu. `path.clockwise` určuje která strana je inside. Pak `pointInCell` lookup do pattern matrixu. Funguje pro libovolné modifikace + libovolný inflate.
  4. **Per-slot curve editor:** klik na slot v canvasu → pravý panel zobrazí editor segmentů pro ten slot (drag bodů, add/remove, tangent handles). Sekce 2.4 vertex dots jsou předkrok — stačí přidat hit-test + drag.

- **2026-05-14** — ⚠️ **DALŠÍ KROK: adopce Paper.js — celý současný boundary kód se vyhodí.**
  - **Rozhodnuto uživatelem:** ručně psaný outline algoritmus v `view/templateRenderer.js` (cell rect ops + inner-concave truncation + bulge wedges) **není správný přístup**. Funguje, ale nedá se rozumně rozšiřovat o wave/noise/Bézier/boolean. Místo dalšího ručního psaní použijeme **Paper.js + paperjs-offset + simplex-noise + seedrandom** z CDN.
  - **Plán je v `tools/tileset_generator/info.md`** (zůstává v repu jako reference). Sekce 1–4 jsou MVP cesta:
    1. **Setup** — CDN imports v `index.html`, `paper.install(window)` nebo lokální PaperScope **bez `paper.setup(canvas)`** (data-only mode, Paper si neukradne canvas). Vytvořit `core/geometry.js` jako **jediný** modul co importuje Paper. Zbytek aplikace nikdy nesahá na Paper přímo — jen přes funkce z `geometry.js` (= snadná výměna knihovny později).
    2. **⭐ Křivka jako obrys** (NEPRESKAKOVAT) — `buildRegionFromPattern(pattern, cellSize, origin) → paper.Path | CompoundPath` (sjednocení per-cell rectanglů přes `unite`), pak `classifySegments(path, pattern, cellSize, origin)` co každému segmentu nasaaí `data.type = "cut" | "closure" | "internal"` podle midpointu. Plus `pathToPath2D` / `pathToSvgD` / `pathToJson` pro různé výstupy. Toto musí **bezpodmínečně** sedět dřív, než se cokoliv dalšího řeší.
    3. **Modifikace** — offset (inflate), corners (round outer/inner), smoothing. Po **každé** modifikaci znovu `classifySegments` (tagy se ztratí při boolean / offset).
    4. **Distorze** — `displaceWithNoise` (2D simplex), sine wave displacement. Aplikovat **jen na `data.type === "cut"`** segmenty (closure / internal nedeformovat). Resample path před distorzí kvůli rovnoměrnému rozložení bodů.
  - **Integrace do rendereru** (sekce 11 v `info.md`): `renderTemplate(canvas, opts)` externí API se nemění. Uvnitř `drawSlot` se `buildBoundaryOps` + `buildPathFromOps` **nahradí** voláním `buildRegionFromPattern` + případně offset/smooth/distortion → `pathToPath2D` pro `ctx.clip()` + `getSegmentsByType(path, "cut")` pro `ctx.stroke()`. Debug mode (`showArrayDebug`) zůstává nezávislý.
  - **Co z dnešního refaktoru zůstane:** vůbec nic z boundary kódu. Tagovaný ops přístup byl OK jako mezikrok pro pochopení rozdělení cut/closure/internal, ale jako runtime řešení končí. Klasifikační logika (sideType, isInnerConcaveCorner) se hodí jako reference pro post-hoc `classifySegments` (midpoint test je analogický).
  - **Anti-patterns z `info.md`:** nemíchat paper.Path s ručně budovanými ops, nepřidávat preventivně další knihovny (ClipperLib, martinez, Bezier.js — až **konkrétní** limit), neměnit formát křivky uprostřed pipeline.
  - **Doporučené pořadí příště:** (1) CDN imports + `core/geometry.js` smoke test → (2) `buildRegionFromPattern` + `classifySegments` + debug overlay co kreslí segmenty barevně podle typu → (3) integrace do rendereru tak, aby fill+outline vypadaly stejně jako dnes → (4) až pak nové features (offset, smooth, noise).
  - **Estimovaný rozsah:** sekce 1+2 = 1–2 dny, sekce 11 (integrace) = 1 den. Po tom je terén připravený pro vše ostatní.

- **2026-05-14** — Unified ops-based boundary (bude vyhozen, viz výše):
  - `view/templateRenderer.js` přepsán z dual-path (`buildRegionPath` + `buildOutlinePath`) na **jediné ops pole**:
    - `buildBoundaryOps(pattern, ...) → ops[]` — emituje closed cell rects + bulge wedges
    - `buildPathFromOps(ops, "fill" | "outline")` — derivuje Path2D filtrováním podle `op.type`
    - Types: `"cut"` (viditelná hranice), `"closure"` (slot edge), `"internal"` (mezi 1-cells), `"wedge-edge"` (uvnitř bulge wedge)
  - Inner concave truncation `inflate + r` integrována do `emitCellRect` (L-shape step jako "internal" ops, aby fill cell rect zůstal uzavřený a outline ho přeskočil).
  - **Funguje vizuálně**, ale ručně psaný algoritmus nezvládne rozumně další features → nahradíme Paper.js (viz předchozí log entry).

- **2026-05-14** — Spec přečten, AGENTS.md založen. Žádný kód zatím není.
- **2026-05-14** — Upřesnění od uživatele:
  - Cíl ve specu je možná popsaný špatně. Import/export bude potřeba, **formát (SVG/PNG) zatím nerozhodnut**.
  - **UI je první priorita**, doladit ho. Hned po UI **import (drag & drop + RMB import)**. Vše ostatní podle domluvy.
  - Tool zůstane standalone, integrace do hlavního projektu = otevřená možnost na později.
  - **Commity řeší uživatel**, neřešit.
  - Standardní JS konvence. DRY: reusable UI (button, link, …) zabalit do wrapperů. Globální styl přes `:root`.
- **2026-05-14** — Layout scaffold hotový:
  - `index.html` — top bar, 3-column main (left panel / canvas / right panel), bottom preview grid
  - `styles/tokens.css` — design tokens (dark theme, spacing, radii, font)
  - `styles/main.css` — layout + .btn / .list / .placeholder primitivy
  - `main.js` — Split.js wiring (horizontal pro 3 panely, vertical pro preview), 47 placeholder tiles v preview gridu
  - Pouze CDN: Split.js.
- **2026-05-14** — Drag & drop import + grid split:
  - Decisions: drag & drop (window-wide overlay), tile size v px (default 32, v parametrech), každá vyříznutá dlaždice → položka v Inputs panelu.
  - Nové: `controller/state.js`, `core/source.js`, `view/{dropZone,inputsPanel,parametersPanel}.js`.
  - Flow: drop file → `loadImageFile` (off-DOM canvas) → `splitIntoTiles(tileSize)` → `state.setSource(source, tiles)` → Inputs panel re-renders s thumbnaily.
  - Funguje bez serveru (blob URL → `<img>` → canvas; same-origin, takže canvas není tainted a `toDataURL` projde).
- **2026-05-14** — Outline truncation u inner concave + plán architecturálního refaktoru:
  - Fix: outline cell edges se teď zkracují o `(inflate + r)` na endpointech, kde se napojuje bulge arc. Bez toho outline overshootovalo do bulge interior.
  - Helper `isInnerConcave(pattern, row, col, corner)` detekuje inner concave config (přesně 1 zero ze 4 cells kolem rohu, edge=1 rule).
  - **Architecturální plán (uživatelův požadavek "jedna krivka pro obojí"):** přejít z dual-path přístupu (separátní fill + outline Path2D) na **single boundary curve**:
    - Walk perimeter 1-regionu marching-squares stylem → array of segments (lines + arcs, tagged as cut vs slot-closure)
    - Wave/noise/výchylky aplikovat na cut segments jednorázově
    - Fill path = všechny segmenty včetně slot-closure (uzavřená smyčka pro clip)
    - Outline path = jen cut segmenty (otevřené sub-paths pro stroke)
    - To eliminuje duplicitu jakéhokoliv future-deformace
  - **Provedeme až s wave nebo dalším deformačním parametrem** — teď není kvůli čemu refaktorovat na 100+ řádkový boundary walker.

- **2026-05-14** — Outline po správné dráze (jen vnější hranice 1-regionu):
  - Předchozí outline strokeoval fill path, který obsahuje closed cell rects pro každý 1-cell → vnitřní edges mezi sousedními 1-cells byly viditelné (= bug).
  - Renderer teď staví **dva paths**:
    - `buildRegionPath` — closed cell rects + bulge wedges → použito pro `ctx.clip()` (fill)
    - `buildOutlinePath` — pouze external cell edges (faces 0) + outer corner arcs + inner concave bulge arcs → použito pro `ctx.stroke()` (outline)
  - Edge=1 pravidlo (terén pokračuje ven) platí pro outline taky: slot boundary edges se nestrokují.
  - Outline subpaths jsou nezávislé (každý side / arc je vlastní subpath). Sdílí endpointy s adjacent cells — `lineCap: "round"` blenduje vizuálně.
  - Wave/noise se budou aplikovat do `buildOutlinePath` + `buildRegionPath` (oba), aby outline a fill zůstaly konzistentní.

- **2026-05-14** — Global params: inflate + outline (width, color):
  - State přidalo `inflate` (0..1), `outlineWidth` (0..1), `outlineColor` (hex string, default `#000000`).
  - `inflate` posune outer edges 1-cells ven (do 0-cells) o `inflate * minCell * 0.5` pixelů. Edge cells (array boundary) se neinflatují (zachovává spojení s vedlejším tile).
  - `outlineWidth` strokuje boundary 1-regionu — width = `outlineWidth * minCell * 0.25` pixelů. Stroke `lineJoin = "round"`, `lineCap = "round"` pro hladší rohy.
  - `outlineColor` = CSS barva (color picker `<input type="color">`).
  - Renderer přešel z imperativního path-building (přímo `ctx.beginPath/lineTo/...`) na `Path2D` — jeden objekt, použitý pro `ctx.clip(path)` i `ctx.stroke(path)`.
  - Inner bulge anchor posunut o inflate směrem dovnitř 0-cell (kompenzace inflated 1-region edges).

- **2026-05-14** — Concave inner corner bulges:
  - Předchozí algoritmus zaobloval jen vnější rohy 1-regionu. Vnitřní concave rohy (L-shape ohýbající se kolem 0-cell) zůstávaly ostré.
  - Fix: pass 2 v rendereru iteruje 0-cells a přidává "bulge" subpath na každém rohu, kde dva sousední 1-cells obklopují roh (= L-shape inner concave point).
  - Bulge = wedge subpath uvnitř 0-cell, ohraničený dvěma rovnými edges (podél hranice cells) a čtvrtkruhem co se klene od inner corner do interiéru 0-cell. Spojený s 1-region cell rects přes canvas clip path nonzero rule.
  - Bulge se přidává jen pro **strict within-array** sousedy (žádné edge=1 pro inner check) — edges nemají reálné sousedy mimo array.
  - Výsledek: L-shape 1-regiony mají hladké vnitřní concave i vnější convex rohy.

- **2026-05-14** — Smoothness fix: array edge = "continues outward":
  - Předchozí algoritmus zaobloval hrany cells které jsou na kraji array. To dělalo "burtíky" v místě, kde dva sousední tily mají v sequenci pokračující terén (např. bitmask 4 nad bitmask 5 nad bitmask 1 — vertikální strip).
  - Fix: cell na kraji array se chová, jako by měl out-of-bounds souseda s hodnotou 1. Edge convention v 3×3 modelu = "terén pokračuje do sousedního tile", takže vnější hrany musí zůstat ostré.
  - Konkrétně: `top = row === 0 || pattern[row-1][col] === 1` (obdobně pro right/bottom/left).
  - Zaobluje se teď jen tam, kde 1-region skutečně končí UVNITŘ slot (skutečný outer corner).

- **2026-05-14** — Krok D (1/3): renderer aplikuje `smoothness`:
  - Renderer přešel z "per-cell rect clip" na "outline 1-regionu s rounded outer corners".
  - Source B kreslí celý slot jako pozadí, source A se přes to clipuje rounded outline 1-regionu.
  - Pravidlo pro rohy: roh slotu se zaoblí jen pokud **oba sousední cells jsou 0** (= true outer corner). Adjacent 1-cells sdílí ostré edge → vytváří jeden souvislý tvar.
  - Vnitřní concave rohy (1-1 sousedi, ale 0 diagonal) zatím zůstávají ostré — drobný visual compromise, jde dořešit pozdě.
  - `r = smoothness * min(cellW, cellH) / 2` — při smoothness=1 jsou rohy plně zaoblené (cell vypadá jako kruh nebo pill shape).
  - Canvas a preview poslouchají `global-curve:changed`.
  - **Otevřené v 2/3:** wave amplitude + frequency = sinusové deformace podél hran. **3/3:** noise = jitter.
  - **Poznámka:** `DEBUG_SHOW_ARRAY = true` přepíše renderer na debug overlay. Pro vidění smoothness efektu nastav v `main.js` na `false`.

- **2026-05-14** — UI restructure: left = inputs (vč. Sources), right = parametrizace:
  - Levý panel: **Sources** (fixed, side-by-side A/B) + **Inputs** (drag-drop + list).
  - Pravý panel: **Curve · global** (fixed, 4 slidery: smoothness, waveAmplitude, waveFrequency, noise) + **Selected slot** (fills remaining, slot editor).
  - Curve params rozšířené z 1 na 4 (všechny 0..1 v state, 0..100 v UI slider). Renderer je zatím nepoužívá (krok D).
  - Split.js inicialní velikosti: `[20, 54, 26]` s minSize `[200, 240, 240]`.

- **2026-05-14** — Krok C: scaffold pro global curve params:
  - State: nový `_globalCurve = { smoothness: 0 }` (0..1), getter `globalCurve`, setter `setGlobalCurveParam(key, value)`, event `global-curve:changed`.
  - HTML: nová sekce **"Curve"** v levém panelu mezi Sources a Inputs (fixed výška, nepřebírá prostor Inputs).
  - Slider 0–100 napojený na smoothness (mapuje na 0..1 ve state).
  - Nový view modul `view/curvePanel.js` — wire slider, update value indicator.
  - **Renderer ho zatím ignoruje** (sharp edges zůstávají). To bude krok D.
  - **Otevřené pro další krok (D):** renderer interpretuje `smoothness` jako zaoblení / vyhlazení hran v `array`. Možnosti: rounded-rect per cell (jednoduché ale dělá mezery), nebo path-tracing outline 1-regionu s Bézier rohy (čistší, složitější). Plus rozhodnout, jestli per-slot curve struktura se přidá teď nebo až s editorem.

- **2026-05-14** — Krok B: pravý panel reaguje na slot selection:
  - Nový view modul `view/slotEditor.js` — listenuje `slot-selection:changed` a `template:changed`, renderuje do `#parameters`.
  - **Bez selekce** → placeholder "Click a slot on the canvas to edit it."
  - **Slot vybraný** → 120×120 vizualizace `array` daného slotu (cells s 1 = accent barva, grid lines) + placeholder "Curve editor coming next." Žádné popisky col/row/index (zbytečný šum, viz user feedback).
  - CSS: `.slot-editor__preview` (flex centrace).
  - **Otevřené v dalším kroku (C):** datová struktura pro curve params (per-slot? template-wide? hybrid?) + (D) renderer který je aplikuje místo ostrých rect clipů + (E) ovládací prvky v levém panelu pro globální curve params.

- **2026-05-14** — Krok A: slot selection na canvasu (předkrok per-slot curve editoru):
  - State přidal `_selectedSlotIndex` + metody `selectSlot(idx)`, `clearSlotSelection()`, event `slot-selection:changed`.
  - Auto-clear selekce při změně šablony (slot indexy nepřežijí swap).
  - canvasView re-přidal click handler + `slotAt(x, y)`: click na slot → vybere (toggle pokud stejný), click mimo → vyčistí.
  - Renderer re-přidal `showSelectionFrame` flag a `drawSelectionFrame()` (2px žlutý inset rámeček, stejná barva jako selekce v Inputs panelu).
  - Canvas předává `showSelectionFrame: true`, preview neither (preview nemá selekci).
  - **Otevřené v dalším kroku (B):** pravý panel reaguje na `slot-selection:changed` a ukáže editor pro vybraný slot.

- **2026-05-14** — Cleanup po velkém refaktoru:
  - Mrtvé CSS classy odstraněné: `.canvas-toolbar__divider`, `.preview__actions`, `.input-card.is-selected` (žádná z nich už nikde nepoužívaná po cleanupu vrstev/transforem).
  - `previewPanel.js` aktualizovaný komentář (zmiňoval placements / active-layer state, které už neexistují).
  - `main.css` top comment popisuje aktuální layout (3-col horizontální + vertikální split v center column).
  - Preview header opraven (vyhozený hardcoded "47 tiles", teď jen "Preview").
  - **Plán dalších kroků (uživatel):**
    - Levý panel = globální nastavení (aktuálně Sources + Inputs — odpovídá).
    - Po kliknutí na slot na canvasu → výběr toho slotu → pravý panel zobrazí parametry pro úpravu **konkrétní křivky** v daném slotu.
    - Křivky modifikují vykreslení ostrých 3×3 hran v `array` na hladké přechody.
  - Záměrně ponecháno: `.btn:disabled` CSS (může být užitečné u budoucích tlačítek), topbar Save/Load/Export/Help (nefunkční ale očekávané akce), `canvas-template` `cursor: pointer` (canvas bude klikací v dalším kroku).

- **2026-05-14** — Source slots layout: kompaktní, side-by-side:
  - Dva source sloty jdou teď vedle sebe (`.source-slots` = flex row) místo pod sebou.
  - Velikost 72×72 px (cca jako tily v Inputs panel).
  - Žádné popisky uvnitř — jen malý A/B tag v levém horním rohu, thumb vyplňuje plochu, × pro clear v pravém horním rohu.
  - Hint text přesunutý do `title=""` atributu (tooltip).
  - **Plán pro křivky** (next): základ = template (její `array`), křivky se přidají jako další parametry slotu nebo template-wide, modifikují vykreslování ostrých 3×3 hran na hladké přechody. Implementace později.

- **2026-05-14** — Velký cleanup: pryč vrstvy, placements, transformy:
  - **Cíl modelu zjasněn:** nástroj generuje obrázek tilesetu pro Godot. Pro **přechody mezi 2 podklady** stačí 2 fixní source sloty (A, B) místo libovolné vrstvové infrastruktury.
  - **Pryč ze state:** `_layers`, `_nextLayerN`, `_activeLayerId`, `_selectedPlacement`, všechny layer/placement/transform metody, `_clearPlacementSelectionSilently`, eventy `placement:changed` a `layers:changed`.
  - **Pryč z UI:** layer toolbar (Active dropdown, Move to, +, ×), transform tlačítka (↻ ↔ ↕), selekce placement na canvasu (žlutý rámeček), click/right-click handlery na canvasu pro placement.
  - **Přidáno:** `state.sourceA`, `state.sourceB` (oba `{ inputId, tileCol, tileRow } | null`), `setSource(key, ...)`, `clearSource(key)`, event `source:changed` s detail "A"/"B". Dva source sloty v UI (`#source-slot-a`, `#source-slot-b`).
  - **Renderer** drasticky zjednodušený: pro každý slot vykreslí source A (clip podle cells==1) a source B (clip podle cells==0). Debug overlay zachován.
  - **Workflow:** drop image → click tile v Inputs → click Source A slot (nebo B) → tile se přiřadí. Žádné placements, žádné vrstvy, žádné transformy.
  - **Otevřené pro další kroky:** user-drawn curves co nahradí ostré hrany cells (Bézier editor v canvasu), případné rotace/flipy curves, případně 3+ sources pokud bude potřeba víc terénů.

- **2026-05-14** — Debug overlay: `DEBUG_SHOW_ARRAY`:
  - V `main.js` přibyla `const DEBUG_SHOW_ARRAY = true`. Když true, **canvas zobrazuje array každého slotu** jako barevný 3×3 (resp. NxN) mřížku — buňky s 1 mají accent barvu, buňky s 0 jsou pozadí slotu. Source / placements se v debug módu nevykreslují (jen `array` shape).
  - Užitečné pro **rychlou autoring/kontrolu template** — vidíš tvar každého slotu okamžitě bez nutnosti nastavovat source tile.
  - Předáno přes `initCanvasView({ debugShowArray })` → renderer flag `showArrayDebug`. Preview zůstává čistý (nepoužívá debug).
  - Vypnutí: změň konstantu v `main.js` na `false`.

- **2026-05-14** — Template čištění: bitmask/index pryč z JSONu, jen `{ col, row, array }`:
  - User pokyn: template má obsahovat **jen** `col`, `row` a `array` (2D 0/1 grid). Bitmask se vyhodil, není potřeba (auto-fill / další transformace přijdou jako samostatné kroky později).
  - `minimal-16.js` a `blob-47.js` slotové objekty teď drží pouze `col`, `row`, `array`.
  - `templates/index.js` přidává odvozený integer `index = row * cols + col` při loadu (interní placement key zůstává integer, JSON soubor je čistý).
  - Renderer používá `slot.array`.

- **2026-05-14** — Explicitní `clipPattern` per slot (univerzální definice):
  - Quadrant heuristika nahrazena. Každý slot má v template explicitní pole 0/1, ručně editovatelné.
  - `minimal-16.js` přepsaný na plně explicitní 16 entries — uživatel může u kteréhokoliv slotu přepsat 3×3 pole.
  - `blob-47.js` generátor zachován, ale ke každému slotu se počítá `clipPattern` z canonicalized bitmask (NW/N/NE/W/c/E/SW/S/SE bity → 3×3 1/0).
  - Renderer `drawSourceWithClipPattern` je generický — bere libovolnou velikost matrixu (3×3, 5×5, 8×8…), takže templates můžou mít různou rozlišení.
  - Bitmask zůstává jako metadata pro budoucí auto-fill, ale **renderer ho už nepoužívá** — drží se výhradně `clipPattern`.

- **2026-05-14** — Source tile slot + bitmask quadrant clip (první test "transition" workflow):
  - Levý panel dostal nahoře sekci **Source · active layer** s drop slotem.
  - State: každá vrstva má teď `sourceTile: { inputId, tileCol, tileRow } | null`. Metody `setActiveLayerSource(...)`, `clearActiveLayerSource()`, nový event `source:changed`.
  - UX: klikni tile v Inputs panelu (žlutý highlight), klikni source slot → tile se přiřadí aktivní vrstvě jako source. × tlačítko vymaže.
  - Renderer: pro každý slot v každé vrstvě → pokud má manual placement, kreslí ho (s transformem). Jinak: pokud má vrstva sourceTile, kreslí ho **s bitmask quadrant clipem** (`drawSourceWithBitmaskClip`). Jinak prázdno.
  - Clip rule pro 4-bit edge bitmask (minimal-16): kvadrant TL viditelný pokud N nebo W, TR pokud N nebo E, BR pokud S nebo E, BL pokud S nebo W. Pro blob-47 zatím funguje stejně — corner bits se přidají později, až bude jasné co s nimi.
  - Manual placement zůstává jako **override** — chceš v konkrétním slotu jinou texturu? Manuálně placneš. Source zůstává defaultem pro zbytek.
  - Auto-cleanup source: smazání inputu nebo zmenšení tileSize → source se vyčistí, pokud reference už neukazuje na validní tile.
  - **Otevřené pro další iteraci:** druhý canvas / druhá vrstva s druhým source pro skutečné A↔B transitions. Případně toggle "Clip by bitmask" pro vrstvy, kde uživatel chce source bez clipu (= pozadí).

- **2026-05-14** — Toolbar úklid:
  - Vyhozené labely "Active" a "Move to" — dropdowny mluví samy za sebe ("Layer N / M", "Move to bottom"...).
  - Move dropdown options přejmenované z "Position N" na **akční názvy**: "Move to bottom", "Move to position N", "Move to top".
  - **Transform tlačítka přesunuta do středu** toolbaru přes dva flex spacery: levá skupina (layer/move/+/×) ⇆ střed (↻ ↔ ↕) ⇆ pravá skupina (Template).
  - Pořadí v toolbaru: `[Layer ▼] [Move ▼] + ×  ──  ↻ ↔ ↕  ──  Template [▼]`.

- **2026-05-14** — Per-placement transformy (rotate / flip H / flip V):
  - 3 nová tlačítka v canvas toolbaru úplně vlevo: `↻` rotace +90° cyklicky, `↔` flip H, `↕` flip V. Disabled, dokud není vybraný placement.
  - Placements teď mají fields `rotation` (0/90/180/270), `flipH`, `flipV`. `placeSelectedAt` je initializuje na default.
  - State methods: `rotateSelectedPlacement()`, `flipSelectedPlacementH()`, `flipSelectedPlacementV()`. Pracují jen pokud existuje `selectedPlacement`.
  - Renderer: `drawTile` aplikuje transformaci kolem středu slotu (translate → rotate → scale ±1 ±1). Pokud je transform identity, kreslí přímo bez `save/restore` (mikro-optimalizace).
  - Toolbar poslouchá `selection:changed` aby přepínal disabled state transform tlačítek.
  - **Otevřené pro další iteraci:** layer / placement-level mask source (krok F.3), případně transform i nad selectedTile (transform PŘED placem) místo jen po něm.

- **2026-05-14** — Select placed tile na canvasu (předkrok pro transformy):
  - Nové state pole: `selectedPlacement = { slotIndex } | null` (vždy v aktivní vrstvě, vzájemně se vylučuje s `selectedTile`).
  - Click logika: pokud máš input vybraný → place. Jinak: click na slot s placement → vybere (nebo odznačí pokud je už vybraný). Click na prázdný slot bez selekce → vyčistí selekci.
  - Right-click stále = clear placement. Pokud byl vybraný, vyčistí i selekci.
  - Vizuál: žlutý 2px rámeček na vybraném slotu (stejná barva jako selekce v Inputs panelu — konzistentní mentální model "žlutá = vybráno").
  - Auto-clear selekce: změna aktivní vrstvy, smazání vrstvy, změna šablony, smazání inputu, smazání placementu. `_clearPlacementSelectionSilently()` pro případy, kde fire-uje coarser event (`layers:changed`).
  - Renderer dostal flag `showSelectionFrame` — canvas předá `true`, preview `false` (preview nemá selekci).
  - **Otevřené:** transform UI (rotace / flip) operující nad `selectedPlacement` — krok F.1+F.2 příště.

- **2026-05-14** — Minimal-16 template + template switcher:
  - Druhá šablona: 16-blob (4×4 grid, 4-bit edge bitmask N=1/E=2/S=4/W=8, slot index == bitmask). Konvence row-major.
  - `templates/index.js` jako registry (`allTemplates`, `defaultTemplate`, `getTemplateById`). Pro budoucí Wang / custom šablony stejný formát.
  - **Default změněn na minimal-16** (z původního blob-47), protože další práce (transformy / masky) bude probíhat nejdříve nad jednodušší šablonou.
  - Template switcher = `<select>` v canvas toolbaru, přitlačený `.canvas-toolbar__spacer` (flex-grow) úplně napravo.
  - `state.setTemplate` při změně šablony **maže placements** napříč všemi vrstvami (slot indexy se mezi šablonami liší). Vrstvy zůstávají.
  - **Otevřené pro další krok:** per-placement transformace (rotate 90°/180°/270°, flip H/V), per-layer/per-placement mask z jiné dlaždice, později Bézier custom shapes. Plánuji rozsekat na inkrementální kroky.

- **2026-05-14** — Layout refactor: boční panely full-height, canvas + preview stacked uprostřed:
  - HTML: `.workspace__main` zrušený, nahrazen `.center-column`. Boční panely (left Inputs, right Parameters) tak sahají od horní lišty až ke spodku.
  - Split.js: horizontální `panel-left | center-column | panel-right`, vertikální uvnitř `canvas-area | preview` (50/50 default).
  - Canvas dostal stejný ResizeObserver auto-fit jako preview (slot size 24–128 px), takže canvas i preview vždy maximálně využijí svůj prostor.
  - Removed: dead preview zoom tlačítka (`preview-zoom-in/-out`), dead canvas-stage placeholder text, jeho CSS rule.

- **2026-05-14** — Active layer switch = dropdown:
  - ◀ ▶ šipky odstraněny. Místo nich `<select>` "Active" s plnou pozicí (`Layer N / M`). Sjednoceno s "Move to" dropdownem.
  - State: `switchActiveLayer(±1)` nahrazen za `setActiveLayer(id)` (přímý pick podle id).
  - Toolbar má teď dva paralelní `<select>` (Active, Move to) + tlačítka +/−. Žádné šipky, čistší vizuál.

- **2026-05-14** — Layer view fixes + preview auto-fit:
  - **Canvas teď SKRÝVÁ vrstvy nad aktivní** (logické řešení dle uživatele: editor aktivní vrstvy by neměl být zakrytý vyššími). Renderer dostal druhý flag `hideAboveActive` vedle `fadeBelowActive`. Canvas předá oba `true`. Preview neither = plný kompozit.
  - **Preview auto-fituje** do dostupného prostoru přes `ResizeObserver` na `#preview-grid`. Slot size = max který fitne s ohledem na padding (8–96 px range). Když uživatel posune panel divider, preview se přepočte.
  - CSS: `.preview__grid { overflow: hidden }` aby ResizeObserver neflickoval scrollbary; centruje canvas v dostupném prostoru.
  - Removed: dřívější známá UX gotcha "horní vrstva covers aktivní" — vyřešena tím, že se horní vrstvy v canvas módu nekreslí.

- **2026-05-14** — Multi-layer UX polish:
  - **Canvas teď fade-uje vrstvy POD aktivní** (alpha 0.3). Renderer dostal `fadeBelowActive` flag, canvas předá `true`, preview `false`. Vrstvy NAD aktivní zůstávají při plné alpha (přirozeně překrývají).
  - **Preview je nezávislý na active layer** — stále jen kompozituje vše zdola nahoru s plnou alpha. Aktivní vrstva preview nemění (i když event-redraw proběhne, output je identický).
  - **Reorder = dropdown "Move to position X"**, místo dřívějších ▼▲ šipek. Pozice 1 = bottom, M = top. Pickni cílovou pozici, vrstva se přesune. State: nová metoda `moveActiveLayerTo(targetIdx)` (původní `moveActiveLayer(±1)` zachována, deleguje na ni).
  - Renderer přepsán z "top-wins resolvePlacement" na "draw bottom-up s alpha per layer". Stejný výstup pro plně neprůhledné placements, ale flexibilnější pro fade a budoucí blend modes.

- **2026-05-14** — Multi-layer (krok E):
  - Decisions: layer panel uvnitř **canvas toolbaru** (uživatelův pokyn — nahrazuje mrtvé Select/Pen/... buttony); reorder = šipky nahoru/dolů; delete = ano (× tlačítko, poslední vrstvu nelze smazat); názvy se nepřejmenovávají, počítají se z pozice (`Layer N / M`).
  - Stack konvence: `layers[0]` = dno, `layers[last]` = vrch. Topmost placement vyhrává.
  - State: `addLayer`, `removeActiveLayer`, `moveActiveLayer(±1)`, `switchActiveLayer(±1)`; nový event `layers:changed` (canvas + preview re-render).
  - Toolbar (`view/canvasToolbar.js`): label `Layer N / M`, [◀ ▶] přepnutí, [▼ ▲] reorder, [+ ×] add/delete. Tlačítka se disablují podle pozice (▶ disabled na topu, ▼ disabled na dně, × disabled při jedné vrstvě).
  - Placement se posílá vždy do aktivní vrstvy. Po `addLayer` se nová vrstva stává aktivní automaticky.
  - Známé UX gotcha: pokud má vyšší vrstva placement v daném slotu, click na slot v nižší vrstvě se sice projeví na state, ale vizuálně se nic nezmění (vyšší vrstva covers). Akceptováno jako standardní layer chování.

- **2026-05-14** — Template + tile selection + placement (kroky A–D):
  - Decisions: vrstvy patří **canvasu** (ne inputu, oprava proti spec sekci 3.3); placement = **live reference** (`inputId + tileCol + tileRow`); šablona jako data v JS modulu (`templates/blob-47.js`); canvas a preview sdílí `templateRenderer.js` (jen jiný `slotSize`); blob-47 jako 47 unikátních 8-bit peering signatur (korner se počítá jen pokud má obě sousední hrany).
  - State: přidáno `template`, `layers[]` (zatím 1), `activeLayerId`, `selectedTile`; nové eventy `template:changed`, `selection:changed`, `placement:changed`.
  - UX: LMB na input tile → selekce (žlutý highlight); druhý LMB na stejný = deselekce; LMB na canvas slot s vybraným tilem → placement; RMB na canvas slot → clear placement; stejný source tile lze umístit na N pozic.
  - State sám maže placement / selekci pokud input zmizí nebo tileSize ho přesune mimo grid.
  - **Otevřené:** layer management UI (E), masks (F), auto-fill nepřiřazených (G — kompletní compositor s bitmask). Bitmask v JSON je metadata pro G, A–D ho nepoužívají.
  - **Otevřené menší:** canvas toolbar (Select/Pen/Eraser/Zoom) jsou mrtvé placeholdery — vyřešit, až bude vektorový editing.

- **2026-05-14** — Refactor: multi-input, karty místo plochého listu:
  - Každý import = jedna karta v Inputs panelu: filename + delete + per-input tile size + canvas s obrázkem a grid overlayem.
  - State přepsán na seznam inputů (`state.inputs[]`), granular events `input:added` / `:removed` / `:updated`.
  - **Tile size patří per-input**, ne globálně. Parameters panel (vpravo) je teď prázdný — bude sloužit jen pro generování (uživatelův pokyn).
  - **Drop přidává**, nemaže předchozí. Vícero souborů = vícero karet.
  - Smazáno: `view/parametersPanel.js` (žádné stuby), `[+]` v Inputs headeru (nefunkční), celá Layers sekce v levém panelu (nepoužívala se).
  - **Pravidlo od uživatele:** než někam umístím nový ovládací prvek, **zeptat se**, kam patří. Parameters je vyhrazený pro generování.
  - **Otevřené následně:** click na jednotlivou buňku gridu v kartě → výběr tile (uživatel chce, ne-implementováno), drag tile do canvasu, viewer pro vybraný tile.
