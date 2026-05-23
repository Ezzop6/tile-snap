# AGENTS.md — Tileset Generator

Vlastní pracovní poznámky pro Claude. Specifikace = `tileset-generator-spec.md` (zdroj pravdy).
Tento soubor je navigace + rozpracované pochopení, **ne** kopie specu.

---

## TL;DR

Browser-only nástroj (jeden `index.html` + JS moduly z CDN) pro generování **vektorových tilesetů**.
Žádný build step, žádný npm. Vše z CDN.

**Účel nástroje (důležité — neztratit kontext):** generovat **artwork pro tileset** který se importuje do Godotu; Godot pak za běhu placuje skutečné dlaždice podle terrain pravidel. **Tool ne-řeší autotile / terrain logiku** (od toho je Godot), pouze produkuje statické zdrojové obrázky. Hlavní use-case = **přechody mezi 2 podklady** (tráva ↔ hlína atp.). Pro to potřebujeme: 2 source textury, transformace (rotate/flip) pro varianty stejného přechodu na různé strany, a **clip masky** definující tvar přechodu.

**Plánovaná architektura "dva canvasy":** každý canvas = jeden terén složený z N vrstev. Finální tileset = kombinace obou canvasů přes maškování. **Aktuálně máme jeden canvas** — pro experimenty s clip masky stačí, druhý přidáme později.

**Import/export bude potřeba**, ale formát (SVG / PNG / oba) **zatím není rozhodnut** — vyplyne až bude tool dál.

**Aktuální priorita: UI.** Doladit layout a interakce dřív, než se řeší generační logika.
Jakmile UI sedí, hned **import** (drag & drop + RMB → Import). Vše ostatní podle domluvy.

---

## Stack — quick reference

| Co | Knihovna | K čemu |
|---|---|---|
| Geometrie / Bézier / boolean ops | **Paper.js 0.12.18** | jádro rendereru (curve = paper.Path / CompoundPath) |
| Offset / inflate | **paperjs-offset 1.0.8** | `PaperOffset.offset(path, amount)` |
| Variace | **simplex-noise 4.x** + **seedrandom 3.x** | reproducibilní noise/wave |
| Resizable layout | **Split.js 1.6.x** | dělící panely |

Aktuálně používáme: **Split.js** (jen). Paper.js + paperjs-offset + simplex-noise + seedrandom **přidat až s adopcí** (viz `info.md`, sekce 1).

Vanilla: layout (CSS grid), event emitter (~30 řádků), context menu (~80 řádků), File API.

---

## Architektura — co musí zůstat

1. **3 vrstvy: view / controller / core.** Core = pure functions, žádný DOM, žádný globální state.
2. **Pure functions jako API contract** — vstup/výstup serializovatelné POJO/SVG string. Důvod: pozdější přesun do Pythonu nezmění volající kód.
3. **Reactive flow:** Tweakpane → `controller.updateParam` → emit event → listener volá `core.composeTileset` → render do preview.
4. **Šablona = data, ne kód.** Blob/Wang/custom popsané strukturou (`BLOB_47_TEMPLATE = { tiles: [...] }`).
5. **Layered tile model.** Každý input je kolekce vrstev (vector/bitmap/svg_import/procedural) skládaných přes blend/mask/boolean.

---

## PointGraph pipeline — principy

Nová abstrakční vrstva v `core/pointGraph/` má vlastní pravidla nad rámec hlavní architektury výše. Migrace dokončena — legacy renderer + `geometry.js` + `grid_outline.js` smazány, aktivní pipeline jede přes `view/render2/`.

1. **Per-step separation** — každý aspekt pipeline = vlastní soubor:
   `classifyCorner` / `classifyRole` / `sideOf` / `cellOn` / `assignPointLocks` /
   `assignChainIds` / `splitSaddleVertices`. Jedna funkce, jeden soubor.

2. **Per-kind branching via dispatcher** — `build/index.js` a každý
   `ops/<op>/index.js` jsou dispatchery; dnes všechny volají jediný `impl.js`
   (resp. `build/buildPointGraph.js`). Když se single + dual začnou
   chovat odlišně, dispatcher se rozdělí na `single.js` + `dual.js`
   a větví podle `graph.meta.kind` / `template.gridKind`. Volající
   importuje JEN z dispatcherů (`ops/<op>/index.js` exportuje `<op>(...)`),
   nikdy přímo z `impl.js`.

3. **Dispatchers stay even when impl is shared.** `assignChainIds/index.js`
   routuje na `connectedSaddle`. `build/index.js` mapuje `template.gridKind`
   na `opts.kind` parameter pro `buildPointGraph`, který stamps `graph.meta.kind`
   na výsledný graf.

4. **Pipeline pořadí** (`view/render2/buildSlotGraph.js#applyOps`):
   `buildPointGraph → applyTileOffsets → organic → cornerSoften → inflate
   → applyCutBowOverrides → wave → noise → merge → cutTransform`.
   tileOffsets = user-drag intent aplikované jako úplně první transformace.
   Inflate **musí** běžet po cornerSoften protože je polyline-offset
   chain-aware: bere už soften-shaped chain a offsetuje ji s concave
   clipping (= bevel) → žádné self-intersection z extrémních hodnot.
   cutTransform = pure geometric flip/rotate kolem slot center, runs LAST
   tak že všechny chains (cut, noise, merged-cut) se transformují
   konzistentně jako jedno celé. Každý op runs in-place na stejném grafu;
   downstream ops cascade na předchozí výsledek.

5. **Reference coordinate space** — graf VŽDY postavený v `REFERENCE_SLOT_SIZE = 96`
   (origin 0,0). Žádný view-specific scaling v grafu. Renderery aplikují
   `ctx.translate(origin) + ctx.scale(viewSize / REFERENCE_SLOT_SIZE)`
   přes `view/render2/viewTransform.js#withSlotTransform`. Důsledek:
   jeden logický bod = stejné coords ve všech views (mainView, mapView,
   slotEditor, mapMode, export). Hit-testing inverse-transform mouse → REF.

6. **Op coloring v debugu** — chainId prefix určuje barvu:
   curve cuts (chainId = `c_<from>_<to>` nebo `chain_..._segN`) = červená,
   noise (`noise_<col>_<row>_<i>`) = fialová, merge (`merged_<i>`) = oranžová.
   Boolean merge je separátní vrstva — curve + noise zůstávají v grafu vedle
   sebe + merged-cut chains. fill/outline preferuje merged-cut když je
   přítomný (= boolean výsledek), debug stroke ukazuje všechny tři.

7. **Per-template flagy:**
   - `gridKind` (`"single"` | `"dual"`) = pipeline / slot-edge semantika
   - `connectedSaddle` (`true` | `false`) = chain mode (split vs bridge)
   - `saddleBridgeOffset` (`0..1`, default `0.25`) = fraction cellSize, o kterou
     se každý bridge-corner pre-shift-ne směrem do prázdného rohu (jen když
     connectedSaddle = true). 0 = bridges coincident (= X-cross visual); 0.25 =
     původní hardcoded dual default; 1 = bridges na cell cornerech.
     Single + dual sdílí stejnou mechaniku přes `splitSaddleVertices`.
   Všechny 4 kombinace gridKind × connectedSaddle fungují, default per parity
   (sudý pattern → dual+bridge).

8. **Tile-boundary integrity** — body s `lock.x || lock.y` (= slot edges
   nebo corners) NESMÍ být přemístěny žádným op (organic, tileOffsets,
   roughness atd.). Jinak by sousední tiles přestaly navazovat.

9. **View-independent hashing** — organic + wave přidávají hash z
   `(slotCol, slotRow, seed)` k local-cell/chainId klíči, aby SAME slot
   produkoval IDENTICKÉ data napříč views (různý `viewSize` ne ovlivňuje
   hash). Noise už view-independent přes `REFERENCE_SLOT_SIZE` v
   `buildNoiseMask`.

10. **Komentáře** — jen netriviální WHY, max 2-3 řádky nad funkcí,
    žádný high-level design v kódu (= ten patří sem do AGENTS.md).

---

## Modulová mapa

> **Auto-maintain:** při každém přidání / přesunutí / přejmenování souboru v pipeline directories (`core/pointGraph/`, `core/`, `view/render2/`, …) okamžitě promítnout do stromu níž. Stejně tak při změně role souboru jeho popisek. Zastaralý strom = aktivně škodí.

### Aktuální stav v repu

```
tools/tileset_generator/
├── index.html                 — HTML scaffold (topbar + 3-pane workspace + drop overlay)
├── main.js                    — entry: Split.js + settings boot + view wiring + drag&drop router +
│                                top-level await on state.loadInputsLibrary() + Texture-mode handler
├── config.js                  — app-wide flags. `DEBUG` toggles legacy Map tab + in-progress
│                                features (triangle cellShape, Sides terrain mode). `VERSION` =
│                                tool version semver string stamped into every saved/exported JSON
│                                (project blob, template blob, template export, project export).
│                                Currently `"0.0.0"` — MVP / pre-1.0 (free to change schema, no
│                                migrations). Dependency-free.
├── controller/
│   ├── state.js               — shim → ./state/index.js (singleton + mixin composition)
│   ├── state/
│   │   ├── index.js           — composes inputs/pools/template/params/exportConfig/serialize
│   │   ├── inputs.js          — imported images (state._inputs) + selectedTile pick.
│   │   │                        addInput/removeInput/updateInput sync the global
│   │   │                        `inputsLibrary` storage. `state.loadInputsLibrary()`
│   │   │                        (idempotent) hydrates library specs at app start +
│   │   │                        after every deserialize (catches legacy-migrated entries).
│   │   ├── pools.js           — pools A/B + weights + slot/variant overrides
│   │   ├── template.js        — active template + slot selection + tileOffsets + cutBowOverrides +
│   │   │                        slotCutTransform + slotTextureTransform (per-slot D4 modifiers,
│   │   │                        project-level — template stays read-only outside Template mode) +
│   │   │                        dirty flag. remapSlotKeyedIndices(remap) survives layout resize +
│   │   │                        pack — also remaps _selectedSlotIndex (follows the slot when it
│   │   │                        moves, clears when the slot is dropped).
│   │   │                        setTemplate wipes slot-keyed maps + clears dirty (external switch).
│   │   │                        replaceTemplate swaps ref without wiping (builtin→copy, post-save).
│   │   │                        notifyTemplateChanged re-emits without ref swap (in-place edits).
│   │   │                        markTemplateDirty / markTemplateClean + template-dirty:changed event.
│   │   ├── params.js          — curve, noise, seed, renderMode, renderThrottle, projectName, mapVisible.
│   │   │                        Plus `_globalTextureOps = { A, B }` per-pool bitmap pipeline params
│   │   │                        seeded from `buildOpDefaults()` (= TEXTURE_OPS registry). API:
│   │   │                        getGlobalTextureOp(poolKey, opName) + setGlobalTextureOpParam(...).
│   │   │                        Event: `texture-ops:changed`.
│   │   ├── exportConfig.js    — per-slot variantCount/ranges/variantOffsets + global toggles +
│   │   │                        master-biased random share (`_exportMasterShare`, default 0.75)
│   │   ├── bundleOverrides.js — Bundle-wide override registry. `BUNDLE_OVERRIDE_KEYS` lists
│   │   │                        globalCurve params that can be force-applied to every bundled
│   │   │                        project at export time (currently outlineColor + outlineWidth).
│   │   │                        Per key `{ enabled, value }`. API: getBundleOverride /
│   │   │                        setBundleOverrideEnabled / setBundleOverrideValue /
│   │   │                        loadBundleOverrides / serializeBundleOverrides. Persisted via
│   │   │                        `setting.bundleOverrides` (= cross-session, not per-project).
│   │   ├── bundlePath.js      — Bundle atlas path prefix (`_bundleAtlasPath`). User-typed
│   │   │                        subfolder where the ZIP will live inside a Godot project; the
│   │   │                        combined `.tres` references atlases as `res://<path>/<atlas>.png`
│   │   │                        instead of bare filenames. Storage holds the raw user input;
│   │   │                        `normalizeAtlasPrefix(raw)` canonicalises at export time —
│   │   │                        tolerant of leading `res://`, leading/trailing slashes
│   │   │                        (`addons/myset` ↔ `/addons/myset/` ↔ `res://addons/myset` all
│   │   │                        collapse to `res://addons/myset/`). Empty input = bare filenames
│   │   │                        (root, relative to .tres). API: bundleAtlasPath getter /
│   │   │                        setBundleAtlasPath / loadBundleAtlasPath, event
│   │   │                        `bundle-path:changed`. Persisted via `setting.bundleAtlasPath`.
│   │   ├── importSettings.js  — Cross-project bulk import mixin: `importCurveAndNoiseFrom(obj)` +
│   │   │                        `importTextureOpsFrom(obj)`. Replace semantics: target's existing
│   │   │                        values are wiped to defaults first. Used by canvas-toolbar
│   │   │                        dropdowns "Import curve + noise" / "Import texture ops"; never
│   │   │                        touches pool refs, template, or per-slot data.
│   │   ├── projectDirty.js    — Project-level dirty flag (`_projectDirty`) + event
│   │   │                        `project-dirty:changed`. Bridge listener subscribes to all mutation
│   │   │                        events at app start (`attachProjectDirtyBridge(state)`) and marks
│   │   │                        dirty; deserialize wraps body in `_beginProjectLoad` / `_endProjectLoad`
│   │   │                        so the load burst doesn't mark dirty. save / markProjectClean reset.
│   │   │                        Topbar Save button reads via `.is-dirty` class.
│   │   └── serialize.js       — project-only JSON I/O. Writes pool refs + per-slot modifiers +
│   │                            globalTextureOps (via cloneOpsPool); reads back via mergeOpsPool
│   │                            (exported helper, reused by importSettings.js — forward-compat:
│   │                            missing ops get defaults, unknown keys dropped). Pool names
│   │                            (`poolNames.A/B`) serialise + restore. Inputs NOT in project blob
│   │                            anymore — live in global inputs-library. Legacy `obj.inputs`
│   │                            arrays migrate into the library on deserialize.
│   ├── exportBundle.js        — Self-contained project JSON helpers. `bundleFromCurrentState()` /
│   │                            `bundleFromSavedData(data)` assemble `{ inputs, template? }` where
│   │                            inputs include base64 dataURL and template is the full user-template
│   │                            object (builtin templates skipped — id is enough).
│   │                            `buildProjectExportPayload()` / `buildProjectExportPayloadForSaved(data)`
│   │                            wrap that into `{ ...serialize(), bundle }` — the canonical shape for
│   │                            every Export JSON download (Export-mode JSON, Export-mode ZIP's
│   │                            embedded JSON, modal per-row `⬇ JSON`). Single source of truth so the
│   │                            three paths can't drift. `hydrateBundle(obj)` is the import counterpart:
│   │                            writes embedded images into content-addressed storage, registers/updates
│   │                            inputsLibrary entries (collisions on id with DIFFERENT hash trigger
│   │                            remap of pool refs), saves embedded user template if absent (existing
│   │                            user template = user's version wins), strips the `bundle` field. Saved
│   │                            projects in localStorage stay lean (no bundle); only Export downloads
│   │                            produce the bundled form.
│   ├── storage.js             — backend-agnostic facade: projects/templates/settings + inputs-library +
│   │                            migrations. `inputsLibrary.{list,get,put,remove}` global metadata
│   │                            store. `projects.rename` syncs both `entry.name` + `entry.data.projectName`;
│   │                            `projects.load` self-heals legacy entries where the two diverged.
│   │                            `findFreeProjectName(base)` returns `base` or `base (N)` with smallest
│   │                            free N≥2 — used by New + Duplicate to keep names visually unique
│   │                            (IDs are unique anyway, this is purely for the user).
│   │                            `findUnusedInputs()` returns inputsLibrary entries with no pool ref
│   │                            in any saved project — UI-driven cleanup target. `cleanOrphanImage-
│   │                            Binaries()` removes images.<hash> entries no library entry points at
│   │                            (caller wipes library entries first via state.removeInput so the
│   │                            cascade is: library entries → orphan binaries).
│   └── settings.js            — applySettingsToState / bindSettingsListeners + lastProjectId
├── core/
│   ├── source.js              — loadImageFile, splitIntoTiles. Tile canvases
│   │                            get `willReadFrequently:true` on first getContext
│   │                            (tresBuilder reads center pixel for swatch).
│   ├── noise.js               — simplex/ridged/billowy/fbm/worley wrappers + buildNoiseMask + maskToContours
│   ├── random.js              — seeded RNG
│   ├── curve_params.js        — GLOBAL_CURVE_PARAMS registry + defaults (organic, inflate, cornerSoftness, cornerArcness, waveAmplitude, waveFrequency, waveJitter, waveSymmetric, outlineWidth, outlineColor)
│   ├── noise_params.js        — NOISE_LAYER_PARAMS + NOISE_LAYER_KEYS (A/B) + NOISE_LAYER_SIDE + seed range
│   ├── variant_params.js      — VARIANT_PARAMS (export variant axes, noise per-layer A/B)
│   └── pointGraph/            — NEW abstraction layer (parallel pipeline)
│       ├── types.js                       — Point / Connection / Curve primitives (SHARED)
│       ├── render.js                      — arcControlPoint (pure math) + CORNER_COLOR/LABEL + ROLE_COLOR.
│       │                                    Canvas drawing for debug view lives in view/render2/drawGraph.js
│       │                                    (kept out of core to honour "core = pure functions").
│       ├── build/                          — single + dual share one impl today.
│       │   │                                  Reintroduce single/ + dual/ subdirs (per-aspect files
│       │   │                                  duplicated) only when behaviour diverges.
│       │   ├── index.js                   — dispatcher: maps template.gridKind → opts.kind, calls buildPointGraph
│       │   ├── buildPointGraph.js         — orchestrator. Stamps graph.meta.kind from opts.kind
│       │   ├── classifyCorner.js          — cornerType + outwardNormal + miterScale per point
│       │   ├── classifyRole.js            — cut / closure / internal per connection
│       │   ├── sideOf.js                  — interiorSide helper
│       │   ├── cellOn.js                  — normalize cell value (scalar | triangle array)
│       │   ├── assignPointLocks.js        — per-axis lock based on slot edge position
│       │   ├── assignChainIds/            — chain id assignment
│       │   │   ├── index.js               — dispatcher on connectedSaddle
│       │   │   ├── split.js               — 4 chains at saddle
│       │   │   └── bridge.js              — 2 chains at saddle (pair by filled cell)
│       │   └── splitSaddleVertices.js     — bridge mode: split saddle → 2 bridge-corner vertices
│       │                                    pre-shifted by opts.bridgeOffset * cellSize along
│       │                                    outward normal (value from template.saddleBridgeOffset).
│       └── ops/                          — order: organic → cornerSoften → inflate → wave → noise → merge → cutTransform.
│           │                              Each op folder: index.js (dispatcher, exports public name)
│           │                              + impl.js (single + dual shared impl). Reintroduce
│           │                              single.js / dual.js + per-kind branch in index.js only
│           │                              when behaviour diverges.
│           ├── organic/
│           │   ├── index.js               — dispatcher (calls organicImpl)
│           │   └── impl.js                — pre-pipeline 2D random shift per non-locked grid point;
│           │                                hash from (localCellIdx, slotCol, slotRow, seed) → view-independent
│           ├── inflate/
│           │   ├── index.js               — dispatcher (calls inflateClipper)
│           │   └── clipper.js             — Clipper-based polygon offset (single + dual same code path)
│           ├── cornerSoften/
│           │   ├── index.js               — dispatcher (calls cornerSoftenImpl)
│           │   └── impl.js                — replaces chamfer + roundness. opts.softness (0..1 fraction of
│           │                                each leg, midpoint-clamped if neighbour also softens) +
│           │                                opts.arcness (0 flat chord = chamfer, 1 full bow through
│           │                                corner = roundness, in-between = partial arc). Geometric
│           │                                eligibility (cutDegree=2 + non-outer + cos < -0.99) +
│           │                                non-locked, so works on organic-perturbed graph.
│           ├── wave/
│           │   ├── index.js               — dispatcher (calls waveImpl)
│           │   └── impl.js                — arc-length-uniform sampling along whole chain; per-tile
│           │                                phase offset hashed from (chainId, slotCol, slotRow, seed).
│           │                                opts.jitter adds simplex phase perturbation along arc
│           │                                (per-chain y-hash). opts.symmetric=false → |sin| so bumps
│           │                                sit only on one side (sign follows amplitude). Anchor-based
│           │                                fade-to-zero (cellSize*0.4) at chain endpoints AND interior
│           │                                corners (segment tangent dot < 0.95) — kills perpendicular-
│           │                                offset self-intersection at sharp chain joins.
│           │                                Optimised inner loop: per-segment metadata precomputed
│           │                                (cutFrom/cutTo refs, isLine, interiorSign, linePerpX/Y);
│           │                                monotonic segIdx + anchorIdx pointers (O(N+S+A) instead
│           │                                of O(N×(S+A))); inline math fast path for line cuts (the
│           │                                common case after inflate) skips sampleCurve/sampleTangent
│           │                                object returns; sharpPower / scale inverses hoisted; one
│           │                                base hash string shared across the 4 noise/jitter offsets.
│           ├── noise/
│           │   ├── index.js               — dispatcher (calls noiseImpl)
│           │   └── impl.js                — buildNoiseMask + pre-mask by cut region (PIP) +
│           │                                marching squares trace → new closed cut chains
│           │                                (chainId "noise_<col>_<row>_<i>")
│           ├── merge/
│           │   ├── index.js               — dispatcher (calls mergeImpl)
│           │   └── impl.js                — Paper.js boolean: curve region unite/subtract noise →
│           │                                new merged-cut chains (chainId "merged_<i>") added to graph;
│           │                                curve + noise stay for debug
│           └── cutTransform/
│               ├── index.js               — dispatcher (calls cutTransformImpl)
│               └── impl.js                — D4 group transform (flipH + rotate ×90°) around slot center.
│                                            Reads from state._slotCutTransform (project-level Map keyed
│                                            by slot.index), value shape { rotate: 0|1|2|3, flipH: bool }.
│                                            Template is NEVER mutated. Absent or identity (rotate=0,
│                                            flipH=false) = early-return no-op. Transforms pos / basePos /
│                                            outwardNormal / curve.bowProportion sign (flips iff flipH) /
│                                            bezier h1/h2 vectors. flipH applies BEFORE rotate so
│                                            (flipH × rotate) covers all 8 D4 elements.
│                                            buildSlotGraph + buildHandleGraph + buildBowGraph all call
│                                            applySlotCutTransform at the end → handle / bow drag handles
│                                            render in transformed space. inverseTransformVec helper
│                                            converts drag deltas back to untransformed cell-fraction
│                                            coords for state.tileOffsets / cutBowOverrides (storage is
│                                            canonical — only the render side is transformed).
├── templates/
│   ├── index.js               — listTemplates / getTemplateById / saveUserTemplate /
│   │                            deleteUserTemplate / templateRegistry event target /
│   │                            defaultTemplate / builtinTemplates / isBuiltinTemplate /
│   │                            cloneTemplateAsUser (deep clone w/ source="unsaved" + new id) /
│   │                            findFreeTemplateName(base) → `base` or `base (N)` with smallest
│   │                            free N≥2 checked against BOTH builtin + user storage (no silent
│   │                            overwrite — mirrors findFreeProjectName semantics) /
│   │                            templateIdFromName(name) public slug helper for callers that
│   │                            persist + retrieve by id (Duplicate, Import).
│   │                            (normalize → gridKind + connectedSaddle defaults by parity)
│   ├── wang-edges-16.js       — 16-tile Wang edge builtin (4×4, 3×3 pattern, single + split)
│   ├── blob-47.js             — 47-tile Godot blob builtin (single + split)
│   └── dual-grid.js           — 16-tile dual-grid builtin (4×4, 2×2 pattern, dual + bridge)
├── view/
│   ├── dropZone.js            — window-wide drag & drop overlay (file-only)
│   ├── sourcePanel.js         — dva source sloty v levém panelu
│   ├── inputsPanel.js         — karty per import + tile click select. Trash button walks live
│   │                            state pool refs + every saved project's pool refs and, if the input
│   │                            is referenced anywhere, opens a confirmDestructive dialog listing
│   │                            the affected project names ("currentName (current)" + saved names).
│   │                            Only deletes when user confirms; otherwise no-op.
│   ├── render2/               — ACTIVE renderer (PointGraph-based, vector coords)
│   │   ├── index.js           — public API: REFERENCE_SLOT_SIZE, buildSlotGraph, buildHandleGraph,
│   │   │                        withSlotTransform, viewScale, drawCellPattern, drawCutFill,
│   │   │                        drawCutStroke, buildCutPath, drawSlotComposite, drawOutline, renderTemplate
│   │   ├── buildSlotGraph.js  — buildSlotGraph(slot, opts?) + buildHandleGraph(slot)
│   │   │                        REFERENCE_SLOT_SIZE = 96 (export). Pipeline: buildPointGraph →
│   │   │                        applyTileOffsets → organic → cornerSoften → inflate → wave →
│   │   │                        noise → merge → cutTransform. applyTileOffsets BEFORE organic
│   │   │                        (= user-drag intent first). cutTransform LAST so all chains move together.
│   │   │                        applyOps accepts opts.curveOverride/noiseOverride for export variants.
│   │   │                        buildHandleGraph stops after inflate (cornerSoften destroys p_r_c points).
│   │   │                        Per-event graph cache: Map keyed by slot ref (NOT slot.index — builtin
│   │   │                        templates share refs across getTemplateById). Cache cleared by top-level
│   │   │                        state listeners on template/global-curve/noise/seed/tile-offsets:changed
│   │   │                        events; module-import order guarantees these fire before any view's
│   │   │                        refresh listener. Bypassed when opts has overrides (export variants,
│   │   │                        stopBeforeWave). Result: 1 slot graph build per event burst across
│   │   │                        mainView+mapView+slotEditor+mapMode views.
│   │   ├── viewTransform.js   — withSlotTransform(ctx, origin, viewSize, fn) helper
│   │   │                        applies ctx.translate + ctx.scale and calls fn(scale)
│   │   ├── cellPattern.js     — drawCellPattern(ctx, slot, origin, size) — source-pattern blue tint
│   │   │                        (pixel coords; independent of graph)
│   │   ├── cutFill.js         — drawCutFill / drawCutStroke / buildCutPath. Cut-region path
│   │   │                        in REF coords via walkBoundaryLoops; auto-prefers merged-cut
│   │   │                        chains over cut+closure when present. drawCutStroke splits paths
│   │   │                        by chainId prefix (curve red / noise purple / merged orange).
│   │   ├── slotComposite.js   — drawSlotComposite(ctx, slot, graph, origin, viewSize, opts):
│   │   │                        bg pool B tile + clipped pool A tile via buildCutPath. Resolves
│   │   │                        per-slot pool override (state.getSlotPoolOverride) before master.
│   │   │                        imageSmoothingEnabled = !snap.
│   │   ├── outline.js         — drawOutline(ctx, graph, origin, viewSize, opts): stroked boundary
│   │   │                        (skips segments on slot edge — wouldn't be visible). Gradient
│   │   │                        N+1 stacked strokes white→outlineColor (legacy formula).
│   │   │                        lineWidth = absolute_px * pxScale / scale.
│   │   ├── renderTemplate.js  — bulk-template renderer for PNG export (full template canvas,
│   │   │                        supports slotOverrides Map for per-variant params,
│   │   │                        ignoreSlotPoolOverride for variant pass).
│   │   ├── drawGraph.js       — canvas-side debug renderer for PointGraph. drawGraph(ctx, graph, opts)
│   │   │                        consumes CORNER_COLOR from core/pointGraph/render.js. Only mapMode
│   │   │                        uses it today.
│   │   └── textureOps/        — Bitmap pipeline applied to pool source canvases before drawImage.
│   │       │                    Two distinct flavours: per-slot ctx-state ops (textureTransform) +
│   │       │                    per-pool bitmap preprocessors (the registry-driven family).
│   │       ├── registry.js   — SINGLE SOURCE OF TRUTH for the per-pool bitmap pipeline.
│   │       │                    Exports `TEXTURE_OPS = [{ name, label, category, apply, controls }]`
│   │       │                    + `TEXTURE_OP_CATEGORIES`. `buildOpDefaults()` builds the
│   │       │                    per-pool defaults bag from controls. Adding an op = entry here +
│   │       │                    one `<opName>/{index,impl}.js`. Categories: edgeMatch, edgeAccent,
│   │       │                    color, detail, effects. Control types: slider | select.
│   │       ├── pipeline.js   — applyTextureOpsPre / applyTextureOpsPost (ctx-state ops; currently
│   │       │                    only textureTransform).
│   │       ├── textureTransform/{index,impl}.js — per-slot D4 ctx.transform around slot centre.
│   │       ├── autoTileable/{index,impl}.js     — mirror/average edge blend (width%/mode/axis)
│   │       ├── boundarySnap/{index,impl}.js     — pixel-exact edge match (width%)
│   │       ├── edgeColorAbsorb/{index,impl}.js  — band fades into border-average colour
│   │       ├── innerShadow/{index,impl}.js      — gradient darken/lighten band (width%/opacity%/polarity)
│   │       ├── colorAdjust/{index,impl}.js      — RGB tonal (brightness/contrast/gamma/R/G/B)
│   │       ├── hslAdjust/{index,impl}.js        — HSL h/s/l
│   │       ├── hslJitter/{index,impl}.js        — per-block random HSL perturbation
│   │       ├── gaussianBlur/{index,impl}.js     — canvas-filter blur in edge band
│   │       ├── sharpen/{index,impl}.js          — unsharp-mask (amount/radius/threshold)
│   │       ├── noiseOverlay/{index,impl}.js     — deterministic grain (mono/color, scale)
│   │       └── gradientOverlay/{index,impl}.js  — linear darken/lighten 4-direction
│   │                                                Each op caches per WeakMap<srcCanvas,Map<key,canvas>>;
│   │                                                identity-param → returns input unchanged.
│   ├── mainView.js            — big preview canvas. drawSlotComposite + drawOutline + selection frame.
│   │                            1:1 backing/CSS (legacy parity); pixel/smooth = ctx.imageSmoothingEnabled
│   │                            + CSS image-rendering only. Refresh listeners wrapped via
│   │                            gateRefreshDuringTemplateMode — paint clicks inside the template editor
│   │                            mark dirty + flush once on mode exit.
│   ├── mapView.js             — top-right preview overlay. drawCellPattern + drawCutStroke
│   │                            (clean abstract: pattern + colored cut line). No debug clutter.
│   │                            State-event listeners gated through gateRefreshDuringTemplateMode;
│   │                            ResizeObserver stays ungated (layout can change in any mode).
│   ├── viewRefreshGate.js     — gateRefreshDuringTemplateMode(refresh): wraps a view's refresh fn so
│   │                            calls inside template mode mark dirty and skip; mode-change subscription
│   │                            flushes one refresh when the user leaves template mode. Applied to
│   │                            mainView / mapView / slotEditor. NOT for mapMode / exportPanel — those
│   │                            already check their own isActive() before refreshing.
│   ├── slotEditor/            — selected-slot editor. Subdir per concept; new sections sit as
│   │   │                        peers of poolOverride.js.
│   │   ├── index.js           — lifecycle + DOM container + mouse event wiring + paint loop.
│   │   ├── poolOverride.js   — per-slot A/B pool variant select row.
│   │   ├── cutTransform.js   — per-slot D4 transform of CUT geometry. Cycle button (rot) +
│   │   │                        4 reflection buttons (|, —, ⟍, ⟋). Symmetry-gated by slot.array.
│   │   ├── textureTransform.js — per-slot D4 transform of TEXTURE bitmap. Cycle button (rot) +
│   │   │                        2 reflection buttons (|, —). No gating (user freedom).
│   │   ├── transformHelpers.js — shared composeD4 + nextRotateDelta used by cut + texture rows.
│   │   ├── preview.js        — drawPreviewBase (cellPattern + cutStroke) + syncMeta + computeFitSize.
│   │   └── handles.js        — point + bow handles: collect / draw / hitTest / drag. Point updates
│   │                            state.tileOffsets, bow updates state.cutBowOverrides. Mouse → REF
│   │                            via scale = currentSize / REFERENCE_SLOT_SIZE.
│   ├── canvasToolbar.js       — template switcher dropdown (visible in EVERY mode — single
│   │                            source of truth) + map toggle. On change: if dirty → confirm
│   │                            "discard?". Groups: Unsaved (in-memory builtin copy or import
│   │                            of state.template), Built-in, User. Active option gets "*"
│   │                            prefix + #template-select.is-dirty CSS hook when dirty.
│   │                            No delete here — delete lives in template-mode toolbar (which
│   │                            also hosts Save / Duplicate / Import / Export, laid out as
│   │                            [Name + Layout meta] · spacer · [action buttons]).
│   │                            Also wires the PREVIEW-MODE-ONLY "Import curve + noise ▾" +
│   │                            "Import texture ops ▾" select dropdowns. Each lists other saved
│   │                            projects; on change → projects.load(id) → state.importCurve-
│   │                            AndNoiseFrom(data) or importTextureOpsFrom(data) + toast.
│   │                            Re-populates on project:saved / project:deleted /
│   │                            project-name:changed.
│   ├── texOpsPanel.js         — Texture · global right-panel section. UI generated from
│   │                            view/render2/textureOps/registry.js. Per-pool params (A/B switch),
│   │                            two preview view-modes (Tiles 3×3 / Preview snapshot of main canvas),
│   │                            per-category collapsible sections, per-category + per-panel reset.
│   │                            ResizeObserver toggles `.tex-ops.is-wide` when panel >50% viewport →
│   │                            side-by-side layout (sticky stage + categories in CSS multi-column).
│   │                            Header ⛶ (`#tex-ops-expand`) collapses middle workspace to give the
│   │                            panel almost the full screen. Canvas rendering split off into
│   │                            texOpsPreview.js — this file owns only the controls UI + state sync.
│   ├── texOpsPreview.js       — Preview canvas renderer for the Texture · global panel.
│   │                            initTexOpsPreview({canvas, stage}) + paint() (rAF-coalesced) +
│   │                            setActivePool/setViewMode/reshuffle setters + getActivePool/
│   │                            getViewMode getters. Owns the `activePool` / `viewMode` /
│   │                            `shuffleSeed` module state; panel reads via getters.
│   ├── curvePanel.js          — global curve sliders + per-param reset/random + bool checkboxes
│   │                            (slider order matches pipeline application: organic → inflate →
│   │                             corner softness → corner arcness → wave amplitude → wave frequency →
│   │                             wave jitter → wave symmetric → outline)
│   ├── noisePanel.js          — Noise A (holes) + Noise B (patches) panely vedle sebe.
│   │                            Per-layer on/off, type, density, scale, reset. Obě vrstvy
│   │                            běží nezávisle se seed offsetem (A: seed, B: seed+9973).
│   ├── seedPanel.js           — seed quick controls
│   ├── projectBar.js          — topbar Save button (`.is-dirty` class accent fill bound to
│   │                            `project-dirty:changed`) + open-modal button + render mode +
│   │                            render throttle toggle. Owns save / load / new / delete /
│   │                            duplicate / import flows; dirty-guard via dialog.js#confirmDiscardOrSave.
│   │                            Drag-drop + modal Import button ALWAYS go through
│   │                            confirmReplaceOrNew (Replace/Open-as-new/Cancel) — never silently
│   │                            overwrite the current project even when clean. importProjectAsNewEntry
│   │                            persists the imported blob, deserialises it into state, and switches
│   │                            activeProjectId so the user lands on the import immediately.
│   ├── projectModal.js        — Full-screen modal (replaces old dropdown picker). Row = CSS grid
│   │                            [identity | pools | actions]: name + `pattern · gridKind · terrainMode`
│   │                            meta + relative time; pools rendered as box-per-side (40px master thumb
│   │                            with corner A/B colour badge from --color-pool-a/b, name centred below);
│   │                            actions = icon-only Duplicate / Export JSON / Delete (Load = click row
│   │                            itself, cursor:pointer). Rename input enabled even for unsaved projects
│   │                            (state.setProjectName works without an active id; storage rename fires
│   │                            on first save). Footer: New / Import JSON / Clean unused inputs (the
│   │                            cleanup removes inputsLibrary entries with no project pool refs +
│   │                            their orphan binaries — see storage.js#findUnusedInputs).
│   │                            Close (Esc / backdrop / ✕) is no-op — actions require explicit click.
│   ├── dialog.js              — Custom multi-button confirm modal (`.dialog__*`). Returns
│   │                            Promise<value|null>. Helpers: confirmDiscardOrSave (Save/Discard/
│   │                            Cancel), confirmReplaceOrNew (Replace/Open as new/Cancel),
│   │                            confirmDestructive (Delete/Cancel — the common 2-button case).
│   │                            Esc handler uses capture phase + stopImmediatePropagation so it
│   │                            runs before any modal-level Esc listener underneath and prevents
│   │                            cascading closes. Replaces every native `confirm()` in the codebase
│   │                            (project delete, template switch/delete/import discard, builtin
│   │                            promotion guard, row/col remove, curve/path resets, cellShape +
│   │                            pattern/cardinal changes). `ensureEditable()` in
│   │                            templateCreator/guards.js is async because of this — every paint
│   │                            handler / cellShape change handler that goes through it is async.
│   │                            Paint flow tracks a gesture Symbol so a mouseup-during-dialog
│   │                            cancels the deferred paint instead of resuming a dead drag.
│   ├── keyboard.js            — Centralised shortcut registry. registerShortcut("Ctrl+S", fn) — single
│   │                            document-level keydown listener; modifier-less keys suppressed inside
│   │                            text inputs but Ctrl+X etc. fire through. Future shortcuts MUST go here
│   │                            instead of attaching their own listeners.
│   ├── toast.js               — bottom-right toast notifications (success/info/error).
│   │                            options.action: {label, onClick} adds a clickable button (gives the
│   │                            user a fresh user-gesture for fallback downloads etc.); :has() rule
│   │                            in main.css re-enables pointer-events on toasts that carry an action.
│   ├── modeTabs.js            — Preview/Export/Template/Texture/Bundle/Debug mode tabs (single source of truth).
│   │                            Default mode = `preview`. `texture` collapses middle workspace via
│   │                            main.js onModeChange handler. `debug` tab hidden unless
│   │                            config.js#DEBUG is true. Persisted via `setting.modeTab`.
│   ├── bundleMode.js          — shim → ./bundleMode/index.js
│   ├── bundleMode/            — Bundle mode: multi-project authoring into one Godot TileSet.
│   │   │                        Stage = list of project cards + terrain coverage matrix. Right
│   │   │                        panel = saved-project picker (checkboxes + ↗ Open) + Overrides
│   │   │                        section. Bundle selection persisted via `setting.bundleSelection`;
│   │   │                        entries for deleted projects auto-prune on `project:deleted`.
│   │   ├── index.js           — initBundleMode: DOM refs, hydrate from settings, register render
│   │   │                        dispatcher (= setRenderAll wired here), event subscribers, click
│   │   │                        handler for Export button. Listens to project:deleted +
│   │   │                        project:saved + project-name:changed + active-project:changed.
│   │   ├── state.js           — module state (bundled array, dom refs, exporting flag) + helpers
│   │   │                        (isActive, currentActiveProjectId, bundledIndex/isInBundle/
│   │   │                        projectInBundle) + persist/hydrate. `renderAll` is a tiny
│   │   │                        dispatcher (setRenderAll(fn) wires actual impl) so submodules
│   │   │                        call it without importing each other → no cycles.
│   │   ├── projectList.js     — renderProjectList for right-panel checkbox picker. Checkbox
│   │   │                        toggle adds/removes ALL entries of that project (forward +
│   │   │                        reverse). ↗ icon button calls loadProjectById.
│   │   ├── matrix.js          — renderMatrix + `bundledProjects()` data resolution (live state
│   │   │                        for active project, saved JSON for others) + describeLayout +
│   │   │                        resolveMasterThumb + effectiveTerrain fallback "projectName.A/B".
│   │   ├── card.js            — buildEntryCard + per-section builders (project info / pools /
│   │   │                        stats / actions) + sortedEntries (groups forward + reverse pair).
│   │   │                        Reverse entries get a left-edge accent stripe + "(reversed)"
│   │   │                        suffix; rest of the card stays normal-weight readable.
│   │   ├── coverage.js        — N×N directional coverage matrix. Pair tracked as DIRECTED
│   │   │                        (poolA → poolB) + UNDIRECTED — cells render ✓ (forward
│   │   │                        covered), ↺ (reverse-only), or empty (missing entirely).
│   │   │                        Header columns rotated -45°. Cells `aspect-ratio: 1`.
│   │   ├── overrides.js       — renderOverrides + syncOverrideRows. Groups state's flat keys
│   │   │                        into UI rows via OVERRIDE_GROUPS (currently one row: "outline"
│   │   │                        = outlineColor + outlineWidth, single toggle, label at end).
│   │   └── exportRunner.js    — onExportClick + openExportProgress overlay + triggerDownload.
│   │                            AbortController gives the user a cancel button between projects;
│   │                            `setExporting(true)` flag suppresses bundle-mode rerender
│   │                            listeners so the matrix doesn't flicker as state.deserialize
│   │                            cycles through projects.
│   ├── debug/                 — Debug mode canvas (formerly mapMode.js + mapDebugPanel.js).
│   │   │                        Builds + draws PointGraph per slot via buildSlotGraph; SLOT_SIZE
│   │   │                        = 3 × REFERENCE_SLOT_SIZE (= 288 px) for crisper debug rendering;
│   │   │                        per-slot ctx.scale = SLOT_SCALE maps REF → SLOT_SIZE.
│   │   ├── index.js           — initDebugMode + paint orchestration + onModeChange wiring.
│   │   ├── state.js           — dbgState shared between submodules (canvasEl, stageEl, stage).
│   │   ├── constants.js       — SLOT_SIZE/SLOT_SCALE/SLOT_GAP/STAGE_PADDING/SUPERSAMPLE.
│   │   ├── overlays.js        — per-slot noise overlay rendering (shared module also reused by
│   │   │                        view/mapView noise overlay tinting).
│   │   ├── selection.js       — selected-slot frame + last-click cache for the Copy payload button.
│   │   └── click.js           — click hit-testing → console + clipboard payload filtering via
│   │                            debugPanel.filterPayload(kind, full).
│   ├── debugPanel.js          — Two right-panel sections (data-mode="debug"):
│   │                            (1) "fields" — per-kind checkbox lists controlling which entity
│   │                            props land in console + clipboard. Persisted via
│   │                            settings.<debugFields>.
│   │                            (2) "layers" — per-drawable checkbox list (cornerTypes, point
│   │                            markers, connection roles, decorations, overlays incl. role.merged).
│   │                            Persisted via settings.<debugLayers>.
│   │                            Exposes: FIELDS, LAYERS, NOISE_OVERLAY_COLORS, filterPayload,
│   │                            setCopyHandler, isLayerActive, getActiveLayers, onLayersChange.
│   ├── cellShapes/            — strategy modules per template cellShape. Contract:
│   │   │                        `defaultValue / fullValue / slotDims / hitTest / nextValue /
│   │   │                        applyVisual / valueEquals / renderParams(host, draft, ctx) /
│   │   │                        renderOverlay?(block, slot, cellSize, rows, cols, template)`
│   │   │                        (optional decorative overlay drawn on top of slot block).
│   │   │                        Shapes can declare `disabled: true` → option gets `disabled`
│   │   │                        attribute unless DEBUG (config.js).
│   │   ├── index.js           — registry + getCellShape/listCellShapes
│   │   ├── square.js          — binary NxN: Pattern (2-7) + Grid kind (single/dual) + Connected saddle +
│   │   │                        `renderOverlay` draws SVG saddle-bridge lines for Connected saddle mode.
│   │   │                        terrain mode `sides` is `disabled` outside DEBUG (= no impl for 2×2 dual).
│   │   └── triangle.js        — pinwheel (1×1 slot, 1+N array): paint/visual/SVG dividers/Cardinal (4/8/16/32).
│   │                            `disabled: true` outside DEBUG (rendering not finished).
│   ├── templateCreator/       — inline template editor (Template mode). Split into 10 modules
│   │   │                        (was 776-line monofile). Public API: initTemplateCreator,
│   │   │                        resetCreatorView, looksLikeTemplateJSON, importTemplateFromObject.
│   │   │                        Internal contract: edits mutate state.template directly + go
│   │   │                        through ensureEditable() guard (builtin → confirm →
│   │   │                        cloneTemplateAsUser → replaceTemplate + markDirty). Paint = once
│   │   │                        per drag, applyVisual on existing DOM + notifyTemplateChanged with
│   │   │                        suppressNextRebuild = preview repaints without rebuilding editor.
│   │   ├── index.js           — public exports + init orchestration (DOM refs, Split.js stage,
│   │   │                        listener wiring)
│   │   ├── refs.js            — shared module state (DOM refs + sync flags
│   │   │                        suppressNextRebuild / lastRenderedRef)
│   │   ├── guards.js          — ensureEditable + commitInPlaceEdit (builtin promotion)
│   │   ├── layout.js          — pure data utils: makeEmptyArray, patternDims, slotAt,
│   │   │                        emptySlotForTemplate, reindexSlots, isStageActive, updateMeta
│   │   ├── toolbar.js         — name/cellShape/delete handlers, paramCtx, syncToolbarInputs,
│   │   │                        renderShapeParams, fullSync. ParamCtx ensureEditable callback
│   │   │                        used by cellShape renderParams() so shapes can mutate template safely.
│   │   ├── resize.js          — onResize (row/col +/×) + buildResizeControls (the buttons).
│   │   │                        Snapshots (row,col)→oldIndex BEFORE mutating, builds remap,
│   │   │                        calls state.remapSlotKeyedIndices(remap).
│   │   ├── pack.js            — packSquare(): reorganises the slot grid into a more compact
│   │   │                        (closer-to-square) shape. Picks (cols, rows) minimising
│   │   │                        |cols-rows| with small penalty per blank, sorts slots row-major,
│   │   │                        re-assigns positions, fills new blank cells via
│   │   │                        emptySlotForTemplate (layout stays dense), builds old→new index
│   │   │                        remap + calls state.remapSlotKeyedIndices. Confirm dialog
│   │   │                        previews target dims + blank count before applying.
│   │   ├── slotBlock.js       — buildSlotBlock (pattern cells + mouse handlers) +
│   │   │                        refreshSlotOverlay. Calls `shape.renderOverlay?.(...)` so each
│   │   │                        cellShape can attach its own decoration (e.g. square saddle bridges).
│   │   ├── interaction.js     — paint state machine + onCellDown/Enter/Move + paintCell
│   │   ├── render.js          — renderEditor: cell-size math + grid layout + resize buttons mount
│   │   └── io.js              — snapshotTemplate / exportJSON / saveToLibrary / pickTemplateFile /
│   │                            importTemplateFromObject / duplicateTemplate / looksLikeTemplateJSON.
│   │                            Import + duplicate route names through findFreeTemplateName so the
│   │                            derived id can never collide with a builtin or existing user template.
│   │                            duplicateTemplate snapshots current state.template (incl. unsaved
│   │                            edits), persists with free name, leaves the active template alone;
│   │                            toast offers Switch action button to load the copy.
│   ├── export/                — export panel (split z exportPanel.js)
│   │   ├── index.js, _state.js, layout.js, paramsPanel.js, preview.js, utils.js
│   │   │                        layout.js: `buildPatternMarker` (square N×M grid mirroring
│   │   │                        slot.array, "on" cells = per-group hue) + `buildSelectionFrame`
│   │   │                        (sibling grid item with border + box-sizing:border-box) replace
│   │   │                        the old triangle marker + outline-based selection. No `.template-frame`.
│   │   │                        paramsPanel: Variants count slider + slot meta live in the
│   │   │                        Preview section's controls strip (Variants section was deleted);
│   │   │                        🎲 randomize-all moved to Main section header.
│   │   ├── tile.js            — buildSlotBlock + buildVariantOverride (uses view/render2/) +
│   │   │                        `applyPoolTextureOps(srcCanvas, poolKey)` (exported) — chains
│   │   │                        TEXTURE_OPS registry for export Layout preview + PNG bundle.
│   │   ├── png.js             — bulk PNG export (uses view/render2/renderTemplate). Master + every
│   │   │                        variant pass set includeNoise:true + includeWave:true so the export
│   │   │                        bypasses both throttle gates (full-quality output).
│   │   ├── jsonExport.js      — runJsonExport: state.serialize() + bundle via
│   │   │                        buildProjectExportPayload → JSON.stringify → downloadBlob with
│   │   │                        `.tilesetproj.json` extension. Same payload shape as the modal's
│   │   │                        per-row export so re-import behaves identically regardless of which
│   │   │                        path produced the file.
│   │   ├── zipExport.js       — runZipExport: PNG atlas + .tres + project JSON, all packed into one
│   │   │                        JSZip blob. .tres references the PNG via `res://<name>.png` (relative
│   │   │                        path inside the ZIP). Single-project archive ready for Godot import OR
│   │   │                        tool re-import (via the embedded JSON).
│   │   ├── peeringBits.js     — derivePeeringBits(slotArray, mode): 3×3 → 8-cell ring mapping
│   │   │                        (sides + corners), mode-filtered. 2×2 → each cell IS one corner
│   │   │                        (dual-grid: TL/TR/BL/BR); "sides" mode on a 2×2 returns fallback
│   │   │                        (no side cells to read). body = anyOn for 2×2 (mixed transitions
│   │   │                        belong to terrain 0; all-zero → terrain 1 = T1 interior).
│   │   ├── tresBuilder.js     — Godot .tres builder. Bundle source emission split per terrain mode:
│   │   │                        emitBundleSides (A plain, B interior with 4 side bits),
│   │   │                        emitBundleCornersAndSides (B always interior; A also interior IFF
│   │   │                        hasFullInteriorPair(template) — strict literal [[1,1,1],[1,1,1],[1,1,1]]
│   │   │                        AND [[0,0,0],[0,0,0],[0,0,0]] slots present),
│   │   │                        emitBundleCorners (TBD — currently both A + B plain; corners-mode
│   │   │                        slot tiles also skip terrain block via skipSlotTerrain flag).
│   │   │                        Shared helpers: emitPlainEntry / emitInteriorEntry /
│   │   │                        emitProbabilityIfNeeded; bit name constants SIDE/CORNER/ALL.
│   │   │                        Exports `emitSourceBundleWithIds(lines, sourceLayout,
│   │   │                        terrainModeStr, terrainIds, template)` — same per-mode rules
│   │   │                        but with caller-supplied global terrain ids (bundle export).
│   │   │                        Colour helpers (rgbToHsl/hslToRgb/inverseColorOfTile/
│   │   │                        FALLBACK_COLOR) live in ./colorHelpers.js; this file imports
│   │   │                        + re-exports FALLBACK_COLOR for back-compat.
│   │   ├── colorHelpers.js    — pure colour utilities. FALLBACK_COLOR constant + rgbToHsl /
│   │   │                        hslToRgb / inverseColorOfTile (centre-pixel sample → hue-rotated
│   │   │                        complementary swatch). Shared by tresBuilder + future
│   │   │                        per-source brightness / colour-ramp ops.
│   │   ├── bundleExport.js    — Combined bundle export. `buildBundleZip({ entries, bundleName,
│   │   │                        atlasPathPrefix, signal, onProgress })` snapshots live state,
│   │   │                        deserializes each bundled project in turn, optionally
│   │   │                        state.swapPools() for reversed entries, applies bundle overrides
│   │   │                        via applyBundleOverrides(), renders atlas PNG via
│   │   │                        buildExportCanvas, collects tiles via enumerateAtlasTiles, then
│   │   │                        assembles a combined `.tres` with one `terrain_set_0`
│   │   │                        (= deduplicated by terrain name, first-seen wins for colour) +
│   │   │                        N TileSetAtlasSource blocks. atlasPathPrefix (via
│   │   │                        normalizeAtlasPrefix) is prepended to every `path=` in the .tres
│   │   │                        so the ZIP can be dropped into a non-root Godot folder.
│   │   │                        Per-project source bundle rows emitted via emitSourceBundleWithIds
│   │   │                        with remapped global terrain ids. Output ZIP contents:
│   │   │                        N atlas PNGs (flat root) + `<bundleName>.tres` + one
│   │   │                        `<projectName>.tilesetproj.json` per UNIQUE source project
│   │   │                        (forward entries only — reversed is a virtual variant of the
│   │   │                        same project, no duplicate JSON) + `bundle.manifest.json`
│   │   │                        capturing tool VERSION, exportedAt, bundleName, atlasPathPrefix,
│   │   │                        appliedOverrides snapshot, and ordered entries list. Per-project
│   │   │                        JSONs reflect the SAVED-snapshot payload (buildProjectExportPayload-
│   │   │                        ForSaved), not the post-mutation export state — manifest is the
│   │   │                        place for "what was applied during this export". Signal aborts
│   │   │                        between projects, restoring state via the snapshot in finally.
│   │   ├── godot.js           — runGodotExport: builds PNG + .tres, fires both downloadBlob calls
│   │   │                        back-to-back in the same task (no setTimeout — that pushed the
│   │   │                        second download past Firefox's gesture window), then shows a toast
│   │   │                        with an action button to re-trigger the .tres download manually if
│   │   │                        the browser dropped it. warnMissingInteriors emits T0 warning
│   │   │                        without suggesting Pool A bundle (A is plain now) and T1 warning
│   │   │                        when neither template nor Pool B bundle covers the interior.
│   ├── exportPanel.js         — shim → ./export/index.js
│   └── stage.js               — shared pan/zoom + fit + view-reset chrome,
│                                 used by mainView + export + creator + mapMode
├── styles/
│   ├── tokens.css             — design tokens (:root). Loaded directly by index.html <link>
│   │                            so tokens are available immediately, not blocked behind main.css.
│   ├── main.css               — @import index. Cascade order matters: base → layout → modes →
│   │                            primitives → panels → sources → curve → creator → bundle → export.
│   │                            modes.css is third (not last) so feature-specific files can
│   │                            override its shared stage box rules (= bundle stretches, debug
│   │                            centres). !important rules in modes.css still win regardless
│   │                            of cascade position.
│   ├── base.css               — reset + body + drop overlay
│   ├── layout.css             — topbar + 3-col workspace shell + panel skeleton + canvas
│   │                            toolbar + Split.js gutters
│   ├── modes.css              — shared .creator-canvas/.export-stage/.debug-stage/.bundle-stage
│   │                            box + body.X-active visibility rules + canvas-toolbar mode groups
│   │                            (incl. .canvas-toolbar__import preview-only visibility)
│   ├── primitives.css         — .btn variants, .list, .placeholder, common sliders
│   ├── panels.css             — right-panel parameter sections + Texture · global panel
│   ├── sources.css            — left-panel input cards + pool rows + pool weights
│   ├── curve.css              — Curve + Noise panel field/slider/color picker internals
│   ├── creator.css            — Template-creator modal + toolbar + editor grid + slot cells
│   ├── bundle.css             — Bundle mode (stage, cards, coverage matrix, project picker,
│   │                            overrides, progress overlay)
│   └── export.css             — Export mode (layout grid, preview, selection frame, variability)
├── build.sh                   — opt-in DISTRIBUTION build → dist/ (bundle/minify/obfuscate via
│                                esbuild + javascript-obfuscator + html-minifier-terser, npx-only,
│                                no package.json). NOT part of dev/run. OBFUSCATE=none|light|heavy.
├── Makefile                   — distribution build targets: build(=light) / build-min / build-light /
│                                build-heavy / serve (:8000) / clean. Wraps build.sh.
├── AGENTS.md                  — currently-valid spec (this file). Changes only on user confirm.
├── AGENTS_LOG.md              — archived status log + landing for new entries
├── info.md                    — original spec / pipeline notes
└── tileset-generator-spec.md
```

### Right-panel mode visibility — `data-mode` attr

`data-mode` na `.panel-section` = SPACE-SEPARATED list módů ve kterých má být
sekce viditelná (např. `data-mode="preview map"` → viditelné v preview I map).
CSS (`styles/main.css`) řídí přes `body.<mode>-active [data-mode]:not([data-mode~="<mode>"])`.

Curve · global + Noise A (holes) + Noise B (patches) panely teď všechny
`data-mode="preview map"` — sdílené UI mezi preview a map módem. Stejné
slidery → `state.globalCurve` / `state.noiseParams.{A,B}` → konzumováno
mainView + mapView + slotEditor + mapMode + export přes jedinou cestu.

### Persistence model — quick reference

- **`tilesetgen.v1.project-manifest`** + **`tilesetgen.v1.project.<id>`** — saved
  projects (legacy `tileset.project` auto-migrates on first read).
- **`tilesetgen.v1.template-manifest`** + **`tilesetgen.v1.template.<id>`** —
  user templates (builtin templates live in code, merged at read time).
- **`tilesetgen.v1.inputs-library`** — global metadata for every uploaded
  source `{ id, name, tileSize, hash }`. Hydrated into `state._inputs` once at
  app start via `state.loadInputsLibrary()`; `addInput` / `removeInput` /
  `updateInput` sync the library entry alongside `state._inputs`. **Projects no
  longer carry their own `inputs` array** — only pool refs / per-slot overrides.
  Creating a new project keeps all uploaded textures available. Legacy project
  blobs are auto-migrated on first read (`ensureInputsLibraryMigration`).
- **`tilesetgen.v1.image.<hash>`** — content-addressed image store. `hash` =
  SHA-256 of dataURL truncated to 16 hex chars. Multiple projects reference the
  same image by hash without duplication. Image binary stays here; metadata
  lives in `inputs-library`.
  - Hash collisions throw on `images.put` (~ 1 in 10^16, never expected).
  - `findUnusedImageHashes()` + `cleanUnusedImages()` for manual orphan cleanup
    (button in project picker footer). No auto-cleanup — explicit user action.
  - HARD BREAK with old projects that had embedded `inp.image` dataURL: inputs
    without `hash` are skipped at deserialize with a console.warn.
  - Side effect: exported project JSON is no longer self-contained (images live
    only in storage). Sharing flows will need ZIP bundling or per-input PNG
    export — handled by the upcoming export rewrite.
- **`tilesetgen.v1.setting.<key>`** — app-wide prefs (`renderMode`,
  `mapVisible`, `renderThrottle`, `traceVisible`, `traceRecording`, `modeTab`,
  `inputsCols`, `lastProjectId`, plus Bundle-mode singletons
  `bundleSelection` (= ad-hoc selection of `{ projectId, reversed }` entries)
  and `bundleOverrides` (= per-key `{ enabled, value }` map for outline
  overrides applied to every project at bundle export). NOT in the project
  blob — switching projects keeps user prefs. Legacy keys (`renderFreeze`,
  `noiseThrottle`, `waveThrottle`, `tracing`) are removed on load via
  `settings.js#LEGACY_KEYS`.
- `state.serialize()` returns project-only data (no settings, no image bytes).
  `storageUsageBytes()` aggregates the entire namespace including images.
  ~5 MB localStorage limit; dedup makes multi-project storage feasible. Storage
  API is intentionally narrow so it can be swapped to IndexedDB without
  touching callers.

### Plánovaná struktura (zakládat až s první funkcí)

```
core/
  templates.js     getTemplate, listTemplates, bitmaskToTileIndex, getQuadrantsForTile
  compositor.js    composeQuadrant, composeTile, composeTileset
  variations.js    applyVariation
  export.js        exportSvg, exportPng, exportProjectJson, importProjectJson
  operations.js    applyMask, booleanUnion/Subtract/Intersect

controller/
  state.js         StateController extends EventTarget — central state + events

view/
  inputsPanel.js   levý panel: inputs + layers
  canvas.js        Paper.js vector editor
  parametersPanel.js  Tweakpane
  previewPanel.js  spodní grid 47 tiles
  contextMenu.js   reusable RMB menu
  topBar.js        save/load/export
  components/      reusable UI primitivy (Button, IconButton, Link, ListItem, ContextMenu, …)
```

Žádné stub soubory — moduly vznikají, až je něco potřebuje. Trvalé prázdné soubory mají tendenci hnít.

---

## Datový model — esence

- **Project**: `{ version, metadata, settings: { tileSize, gridSpacing, template, seed }, inputs[], composition, variations }`
- **InputTile**: `{ id, name, role, layers[] }` — role: `full | empty | edge_h | edge_v | corner_outer | corner_inner | custom`
- **Layer**: `{ id, name, type, visible, opacity, blendMode, data }` — type: `vector | bitmap | svg_import | procedural`
- **Composition**: pole `rules`, každé `{ appliesTo: { quadrantType }, source: { inputId, transform }, operation? }`
- **Variations**: `{ enabled, count, parameters: { positionJitter, rotationJitter, scaleJitter, colorJitter{hsl}, noiseAmount, noiseScale } }`

---

## Algoritmus skládání (klíčové)

- **Tile = 4 kvadranty** (TL, TR, BR, BL).
- 8-bit bitmask (N, NE, E, SE, S, SW, W, NW) → typ každého kvadrantu:
  - `00x` → outer_corner
  - `10x` / `01x` → edge
  - `110` → inner_corner
  - `111` → full
- Pro každý kvadrant: najdi `rule` v composition → vezmi input → aplikuj operaci (např. mask) → poskládej 4 kvadranty.
- **Demo (MVP):** Input A = "full content", Input B = "mask shape" (Bézier). Pro edge/corner kvadrant ořež A podle B.

---

## Roadmap — kde se právě nacházíme

Tool je rozjetý — PointGraph pipeline, render2, template editor, export (PNG +
Godot 4 .tres), persistence (multi-project + content-addressed images + global
inputs-library), per-slot D4 mirror/transform (cut + texture), per-pool global
texture pipeline (11 ops in 5 categories), Texture mode tab + adaptive Texture ·
global panel, font/UI unification — všechno funguje.

**Aktuální backlog (priority hint, ne závazek):**

1. **Bow handle UX polish** — drag responsiveness v slot editoru ("drhne").
   Single file (`view/slotEditor/handles.js`), low risk quick win.
2. **UI session-state persistence** — texOpsPanel `activePool` / `viewMode` /
   per-category collapsed are session-only. `settings.js` is the natural home.
3. **Brightness/contrast per source** — per-input tonal in Sources panel
   (architecturally distinct layer from per-pool global texture ops).
4. **Color ramp** (gradient mapping) + **Pattern overlay** — deferred future
   texture ops; both need bespoke UI (gradient editor, cross-input picker).
5. **`view/mapMode.js` split** (484 lines) — less urgent now that Map tab is
   DEBUG-only.

**Backlog (otevřená diskuse, ne závazek):**
- Otevřené body z původního specu (undo/redo, sdílení projektů včetně image
  binárek, větší kompozitor, variace, …) zůstávají jako referenční roadmap.

**Deferred — blocked on multi-terrain:**
- **Alpha channel cells** (pattern value `-1` = transparent region): atraktivní,
  ale **kompletní rework půlky projektu**. Vyžaduje 3-region topologii (filled /
  empty / alpha) místo současné binární, nový role `"alpha-cut"` v PointGraphu,
  3rd paint state v editoru + cellShapes, alpha-aware renderer (destination-out
  v slotComposite), transparent PNG export, a nová `terrain` strategie v
  tresBuilderu. Konflikt s `cellAt()` OOB sentinelem `-1` ⇒ nutno renumberovat.
  **Nedělat samostatně** — vrátit se k tomu až bude na řadě multi-terrain
  (≥3 terrain support), protože tam stejně padne 3-region topologie a oba
  rework sdílejí podstatu (= peering bits + region enumerace + renderer).
  Současně tohle držet v hlavě: každý nový bod ve state / renderer / export
  který "ví" o jen 2 regionech (filled/empty) = až přijde alpha + multi-terrain,
  bude potřeba refactor. Lepší teď psát kód tak, aby se pak rozšířil snadno.

---

## Známé tricky body (z specu, dobré mít na očích)

- Paper.js SVG export = neoptimální SVG (zbytečné atributy) → produkce potřebuje SVGO post-process.
- Anti-aliasing švy na hranicích tiles → `shape-rendering="crispEdges"` nebo rasterizovat tile per tile.
- Bitmap importy v SVG = velký output → warning při importu velkého obrázku.
- Tweakpane reactivity: `color` a `point2d` mají speciální handling — RTFM Tweakpane docs.

---

## Otevřené otázky (nevyřešené, ne-blokující)

1. Default fill barva pro nové inputs
2. Coordinate system (Paper.js Y dolů — doporučeno přijmout)
3. Velikost preview tiles (fixní vs zoom slider 16-128px)
4. Limit počtu inputs
5. Undo/redo strategie
6. Theme (dark default doporučeno)
7. Lokalizace (EN UI, CZ docs?)
8. Mobile = nemáme (min 1024px)

---

## Parallel pipeline — DONE (= důvod migrace)

Původní renderer (`view/render/` + `core/grid_outline.js` + `core/geometry.js`) řešil tilesety jediným způsobem: binární `N×N` grid → `buildGridOutline` (perimeter walk) → `paper.Path` → modifikace → composite. Omezené na axis-aligned geometrii.

**Cíl:** odpojit "jak se outline vyrobí" od zbytku stacku, aby šlo přidat per-cell-shape strategie (triangle pinwheel atp.) bez dotyku rendererů, modifikací, exportu.

**Realizace:**
- `core/pointGraph/` = nová abstrakce. Point + Connection primitives + build (single/dual) + ops (organic / cornerSoften / inflate / wave / noise / merge).
- `view/render2/` = renderery nad PointGraphem (composite, outline, cutFill, renderTemplate). Shared napříč mainView / mapView / slotEditor / mapMode / export.
- `view/cellShapes/` = strategie per template `cellShape`: `square.js` (binární NxN + grid kind + connected saddle) a `triangle.js` (pinwheel — 1×1 slot, 1+N kardinálních wedgeů).
- Pattern + shape kresba odpojené přes `cellOn` (build pipeline) a `drawCellPattern` (renderer).

Důsledek: PointGraph je teď ten "natural integration point" původně plánovaný okolo `paper.Path` — všechny ops + renderery bere stejný graf bez ohledu na to, odkud vstupní geometrie pochází.

---

## Template lifecycle — DONE

Sjednoceno do jedné globální `state.template` napříč preview / map / template-editor / export.
Žádný `templateDraft` paralelní state.

**Pravidla:**
- `setTemplate(t)` = full switch (dropdown, project load). Wipe slot-keyed maps
  (tileOffsets, cutBowOverrides, exportConfig, pool overrides) + clear dirty.
  Each mixin owns the `clearAll*` method for its own slot-keyed state — `setTemplate`
  calls those public methods rather than reaching into other mixins' internal Maps.
  Adding a new slot-keyed map (e.g. heal/mirror) means exposing a `clearAll*` from
  its mixin and adding one line in `setTemplate`.
- `replaceTemplate(t)` = swap ref bez wipe — pro builtin→copy promotion a post-save
  ref refresh. Slot-keyed data přežívá (layout identický).
- `notifyTemplateChanged()` = re-emit `template:changed` bez ref swap pro in-place
  mutace (paint, rename, +/× layout). Listeners co rebuildují editor (templateCreator)
  ho ignorují přes `suppressNextRebuild` flag.
- `markTemplateDirty()` / `markTemplateClean()` + `template-dirty:changed` event.
  `setTemplate` clear-uje dirty, `replaceTemplate` zachovává, save → clean.

**Builtin guard** (`templateCreator.ensureEditable`):
- Před každým edit entry-pointem (paint drag, rename, cellShape switch, layout +/×,
  shape-param change). Builtin → confirm → `cloneTemplateAsUser` → `replaceTemplate(copy)`
  + `markTemplateDirty`. Once-per-drag pro paint (jinak by se ptal na každou cell).
- Kopie žije jen v paměti dokud user neklikne Save. Bez save = nic se nepersistuje.

**Dirty UI:** `* ` prefix v aktivní option v `#template-select` + `.is-dirty` CSS hook
na dropdownu a Save tlačítku. Save tlačítko se obarví accent barvou když je dirty.

**Switch dirty handling:** Dropdown change při dirty → confirm "Discard unsaved
template edits and switch?". User cancel → roll back select to current id.

---

## Per-event graph cache + template-mode gating

Dva nezávislé optimalizační mechanismy nad `buildSlotGraph`. Cílí na různé
zdroje wasted compute, dohromady drží interactive drag plynulý.

**Per-event graph cache (`view/render2/buildSlotGraph.js`):**
- Map keyed by slot REF (ne `slot.index` — builtin templaty sdílí refs přes
  `getTemplateById`, takže index by kolidoval mezi default a loaded projektem
  během deserialize). Cache spans listeners jedné state události — všechny
  views (mainView / mapView / slotEditor / mapMode) sdílí jeden graf per slot.
- Invalidace přes `state.addEventListener` na top-level modulu:
  `template:changed` / `global-curve:changed` / `noise:changed` / `seed:changed`
  / `tile-offsets:changed`. Listeners se registrují **při importu modulu** —
  module-load order garantuje že fire před view-init listenery. View refresh
  vidí prázdnou cache → fresh build.
- Bypass když `opts` má override (`curveOverride` / `noiseOverride` /
  `includeNoise` / `includeWave` / `stopBeforeWave`) — ty produkují varianty
  které nejsou interchangeable s default-opts grafem.

**Template-mode refresh gate (`view/viewRefreshGate.js`):**
- `gateRefreshDuringTemplateMode(refresh)` vrací wrapper: v template módu
  nastaví `dirty=true` a refresh přeskočí; mode-change subscription flushne
  jeden refresh při návratu do jiného módu.
- Aplikováno na `mainView` / `mapView` / `slotEditor` — během paint
  v template editoru se ty hidden views nepřekreslují. Plain `template:changed`
  burst (paint drag = 1 event per cell) by jinak rebuildoval všechny
  47 slot graphs × 3 views per click.
- `templateCreator` necháno bez gate (potřebuje aktualizovat editor grid).
  `mapMode` + `exportPanel` necháno (mají vlastní `isActive()` guard).
  Lightweight UI sync handlery (`canvasToolbar` / `sourcePanel` / `inputsPanel`)
  necháno (DOM update, ne graph rebuild).

---

## Godot export — per-mode bundle rules

`view/export/tresBuilder.js` má **jednu dispatch funkci per terrain mode**.
Architektura: každý mód = jednoduchý match na `template.terrainMode` →
mode-specific function rozhodne co A a B bundle entries emitují. Mode má
vlastní funkci aby rule changes byly per-mode izolované — nedotýkají se
ostatních módů.

**sides** (`emitBundleSides`):
- Pool A → `emitPlainEntry` (jen `col:row/0 = 0`, žádný terrain tag).
- Pool B → `emitInteriorEntry(terrain=1, SIDE_BIT_NAMES)` (= T1 interior).
- Důvod: 3×3 sides templaty (wang-edges-16) mají T0 interior (center-on
  + all sides on) ale postrádají T1 interior — B bundle to plní. A by
  byl duplicate, takže plain.

**corners-and-sides** (`emitBundleCornersAndSides`):
- Pool B → vždy `emitInteriorEntry(terrain=1, ALL_BIT_NAMES)`.
- Pool A → `emitInteriorEntry(terrain=0, ALL_BIT_NAMES)` POKUD
  `hasFullInteriorPair(template)` = template obsahuje literal
  `[[1,1,1],[1,1,1],[1,1,1]]` AND `[[0,0,0],[0,0,0],[0,0,0]]` 3×3 slot.
  Jinak A = plain.
- Strict 3×3 array check (ne přes derivePeeringBits) protože pravidlo
  matchuje doslova patterns které user vidí v editoru.

**corners** (`emitBundleCorners`):
- A + B oba plain. Pravidla pro dual-grid terrain assignments zatím
  nejsou určená — slot tiles v corners módu taky skipují terrain block
  (přes `skipSlotTerrain = terrainModeStr === "corners"` v hlavní
  smyčce buildTilesetTres). Variants, bundle layout, atlas references —
  všechno funguje stejně; jen řádky `terrain_set` / `terrain` /
  `terrains_peering_bit` se neemitují. User si tags doladí v Godotu.
- `terrain_set_0/mode` + `terrain_0/name` + `terrain_1/name` se pořád
  emitují aby user měl v editoru terrains připravené k ručnímu mapování.

**Shared primitives:**
- `emitPlainEntry(lines, entry)` — `col:row/0 = 0`. Source-bundle plain
  entries také volají `emitProbabilityIfNeeded` aby weight přežil i pro
  tiles, co user ručně otaguje v Godotu.
- `emitInteriorEntry(lines, entry, terrainId, bitNames)` — terrain_set +
  terrain + (probability if ≠ 1.0) + each bit set to terrainId.
- `emitProbabilityIfNeeded` — emituje `probability = w` (pool weights jsou
  už v Godot 0..1 scale, žádné dělení 100) jen když weight ≠ 1.0
  (= Godot's implicit default).
- `SIDE_BIT_NAMES` / `CORNER_BIT_NAMES` / `ALL_BIT_NAMES` konstanty.

**Pool weight = dual role (intentional):**
1. **Generation:** `weightedPickPoolRef` (v `view/export/tile.js`) používá weight
   pro vážený výběr ref z poolu při buildVariantOverride. Master weight 0.75 →
   master picknutý ~75 % případů.
2. **Probability:** `probabilityForTile` v tresBuilderu emituje `(wA + wB) / 2`
   z waights těch refs, co variant skončil sestavený. Master-tile composite
   dostane probability = weight masteru; tiles co míchaly variantní ref dostanou
   nižší. Godot painter pak váží picknutí podle těchhle hodnot.
3. **Random button (🎲)** je master-biased: master = `state.exportMasterShare`
   (default 0.75, user-controlled v Main → "Master share" slider), variants
   share `1 - share`. Přímo zhmotňuje "většinou master, občas variant"
   distribuci v atlasu i v emitted probabilities. Plain uniform random byl
   zahozen (workflow value byl nulový).

**Multi-file download:** `runGodotExport` fires both `downloadBlob` calls
back-to-back (no `setTimeout` — push past Firefox's gesture window). Fallback
toast s action button dá uživateli fresh gesture pokud browser dropne druhý
soubor.

---

## Draw gates (interaktivní performance)

Třívrstvá obrana proti burst-painted UI:

1. **`view/render2/interactionGate.js`** — globální `isInteracting()` čítač
   pointerdown / pointerup nad slidery + slot editor canvas. Burst events
   během dragu skipují noise/wave ops; release dispatchne noise:changed →
   full-quality catch-up paint.
2. **rAF-coalesce** — heavy paint listenery (mainView.refresh,
   mapView.refresh, slotEditor.paint, texOpsPreview.paint) jsou
   wrapnuté inline `coalesceRaf(fn)` factory:
   ```js
   function coalesceRaf(fn) {
     let pending = false;
     return () => { if (pending) return; pending = true;
       requestAnimationFrame(() => { pending = false; fn(); }); };
   }
   ```
   N dispatchů v jednom tiku (random-all 7×, bundle deserialize loop) =
   jeden paint per frame, ne N sekvenčních. Stejný pattern už používá
   view/export/index.js#flushSoon.
3. **mainView wheel/pan handler je preview-mode-only.** `createStage(stageEl,
   { isActive: () => getMode() === "preview" })` — bez tohohle handler
   `preventDefault()`-uje wheel události bublající z bundle/debug/export
   stage-childů a blokoval by jejich native CSS overflow scroll.

Noise + wave jsou nejdražší ops v `buildSlotGraph` — bez nich je drag slideru
plynulý, s nimi se zasekává.

- **`view/render2/drawGate.js`** = factory `createDrawGate({ intervalMs })`.
  Min interval mezi po sobě jdoucími `tryRun() === true` (default 200 ms =
  5x/sec). Všechny `tryRun` volání v jednom synchronním JS tiku sdílí
  rozhodnutí (cache invaliduje `queueMicrotask` po skončení dispatch bloku
  — funguje i pro refreshe trvající >16 ms). Když `tryRun` vrací `false`,
  scheduleTrailing pošle `setTimeout` co po `intervalMs` zavolá registered
  trailing handler → ten dispatchne příslušný event a views udělají
  catch-up refresh s povolenou op.
- **`noiseGate.js`** + **`waveGate.js`** = tenké wrappery nad factory. Mají
  vlastní `setEnabled` master switch.
- **`buildSlotGraph#applyOps`** volá `tryRunNoise()` / `tryRunWave()`.
  `opts.includeNoise` / `opts.includeWave` (bool) bypassuje gate — PNG/Godot
  export to nastavuje na `true` pro full-quality output.
- **`state._renderThrottle`** (default `true`) — jeden user-facing toggle
  v topbaru ("Throttle rendering"). `main.js#syncGates` ho promítá do obou
  gate `setEnabled`. Toggle dispatch také force-fire noise:changed +
  global-curve:changed aby views okamžitě překreslily efekt změny.
- **Persistuje** jako `settings.renderThrottle`.

---

## Konvence pro tenhle nástroj

- **Žádný build step pro vývoj/běh.** `index.html` se otevírá přímo, žádná
  kompilace není potřeba k vývoji ani spuštění. Pokud do DEV workflow někdy
  přibude build (= kompilace nutná k běhu), je to červená vlajka.
  - **Výjimka — distribuční build (`make build`):** opt-in release krok čistě
    pro snadnější přenositelnost, **netýká se vývoje**. `build.sh` + `Makefile`
    bundlují + minifikují + lehce obfuskují do `dist/` (3 soubory:
    `index.html` + `app.<hash>.js` + `app.<hash>.css`). JS+CSS přes esbuild,
    HTML přes html-minifier-terser, JS obfuskace (default `light` = mangled
    názvy + base64 string-array) přes javascript-obfuscator. **Vendor zůstává
    z CDN** (Split/paper/simplex/clipper/JSZip), nebundluje se. Nástroje se
    tahají přes `npx` + cache — **žádný `package.json`, žádné `node_modules`
    v repu**, dev zůstává build-free. `dist/` je gitignored. Targets:
    `build` (=light) / `build-min` / `build-light` / `build-heavy` /
    `serve` (lokální http na :8000) / `clean`. Úroveň obfuskace = env
    `OBFUSCATE=none|light|heavy` v `build.sh`.
- **Žádný framework** (React/Vue/Svelte). Vanilla + Paper.js + Tweakpane.
- **Core = pure functions.** Pokud něco v `core/*` sahá na DOM nebo globální state, je to bug.
- **Cross-modul komunikace přes StateController events**, ne přímé volání.
- **Standard JS conventions** — žádný "Godot styl" sem netaháme.
- **Canvas 2D contexts: `willReadFrequently: true`** on every canvas the
  pipeline will `getImageData` from. Browsers default to GPU-backed
  storage; the flag switches to CPU-side backing → readbacks under ~1 ms
  instead of triggering reflow + violation warnings. Important: the flag
  is ignored if the canvas already has a 2D context — so set it on FIRST
  `getContext("2d", ...)` (e.g. in source.js + state/inputs.js loaders +
  every texture-op `out.getContext(...)`).

### Versioning

- **Single source of truth:** `config.js#VERSION` (currently `"0.0.0"`).
- **Where it lands:** every saved/exported blob — `state.serialize()` (project
  localStorage entry + Export JSON download), `saveUserTemplate(data)` writes
  it into the user-template storage entry, `snapshotTemplate(t)` stamps it
  into Template Export JSON downloads. Top-level field `version`.
- **Pre-1.0 (0.x):** free to break schema between bumps, **no migrations**.
  Anything we write today gets stamped `0.0.0`; reading code can ignore the
  field entirely. Don't add legacy/migration branches yet — see
  [[feedback_no_legacy_migrations]].
- **Bump rules from 1.0 onward:** MAJOR for breaking schema (consumers must
  migrate), MINOR for additive schema (new fields with defaults), PATCH for
  behaviour fixes that don't change the schema.
- **Bump discipline:** edit `VERSION` in `config.js` manually before each
  release / breaking schema change. No build-step automation (= no
  package.json).
- **Bundle ZIP** doesn't carry a top-level version yet — deferred until the
  combined-bundle import flow lands.

### DRY a reusable UI primitivy

Kdykoliv se objeví podobná logika (tlačítko, link, vstupní pole, list item, kontextové menu, …) **hned na začátku zabalit do wrapperu / komponenty** a používat ji všude jinde napříč nástrojem. Žádné copy-paste s drobnými změnami.

- Společné UI primitivy patří do něčeho jako `view/components/` (`Button`, `IconButton`, `Link`, `ListItem`, `ContextMenu`, …).
- Když se objeví třetí výskyt podobného kódu, je to signál vytvořit wrapper. Druhý výskyt = zvážit. První = nech být.
- Wrapper má být **dumb a konfigurovatelný přes props/options**, žádný skrytý state ani závislosti na konkrétním místě v UI.

### Konzistentní styl — `:root` design tokens

Veškeré barvy, spacing, radii, font sizes definovat jako CSS custom properties v `:root` (např. `--color-bg`, `--color-accent`, `--space-2`, `--radius-sm`, …). Komponenty se na ně odkazují, nepíšou si vlastní hex/px konstanty.

Tím se dá jedním zásahem změnit theme (dark/light) a celý nástroj zůstane konzistentní.

---

## Vztah k hlavnímu projektu

Tento generátor je **standalone tool** v `tools/tileset_generator/`. Nedotýká se `globals/`, `scenes/`, ani Godot kódu. Možná se v budoucnu použije v projektu, ale to se uvidí podle toho, kam tool dojde — **netvořit kvůli tomu žádné předčasné integrační vazby**.

Pravidla z hlavního `CLAUDE.md` (4 mezery indent, žádné `:=`, atd.) se **netýkají** tohoto JS nástroje.

### Git / commits

**Commity a verzování řeší uživatel.** Neřešit `git add` / `git commit` / branche, pokud o to explicitně nepožádá.

