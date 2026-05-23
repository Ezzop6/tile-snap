// App-wide preferences (renderMode, mapVisible) are NOT serialised here:
// they live in controller/settings.js and persist independently of the active project.

import { VERSION } from "../../config.js";
import { defaultGlobalCurve } from "../../core/curve_params.js";
import { defaultNoiseParams, DEFAULT_SEED, SEED_MIN, SEED_MAX } from "../../core/noise_params.js";
import { getTemplateById } from "../../templates/index.js";
import { inputsLibrary } from "../storage.js";
import { TEXTURE_OPS, buildOpDefaults } from "../../view/render2/textureOps/registry.js";

// Clone a pool's ops bag (each op is a flat {key: primitive} dict, so a
// shallow copy per op is enough).
function cloneOpsPool(pool) {
  const out = {};
  for (const [opName, op] of Object.entries(pool || {})) out[opName] = { ...op };
  return out;
}

// Overlay saved ops onto a fresh defaults bag. Older saves missing newly-
// added ops just keep the defaults; values outside an op's known keys are
// dropped (= forward-compatible if registry shape changes). Exported so
// the cross-project settings importer (./importSettings.js) can reuse
// the same merge semantics.
export function mergeOpsPool(savedPool) {
  const defaults = buildOpDefaults();
  if (!savedPool || typeof savedPool !== "object") return defaults;
  for (const op of TEXTURE_OPS) {
    const saved = savedPool[op.name];
    if (!saved || typeof saved !== "object") continue;
    for (const ctrl of op.controls) {
      if (!(ctrl.key in saved)) continue;
      defaults[op.name][ctrl.key] = saved[ctrl.key];
    }
  }
  return defaults;
}

function sanitizeTexTx(tx) {
  if (!tx || typeof tx !== "object") return null;
  const rotate = (((tx.rotate | 0) % 4) + 4) % 4;
  const flipH  = !!tx.flipH;
  return (rotate === 0 && !flipH) ? null : { rotate, flipH };
}

export function applySerializeMixin(StateClass) {
  StateClass.prototype.serialize = function () {
    return {
      version:     VERSION,
      projectName: this._projectName,
      template:    this._template ? this._template.id : null,
      pools:       { A: [...this._pools.A], B: [...this._pools.B] },
      poolWeights: { A: [...this._poolWeights.A], B: [...this._poolWeights.B] },
      poolNames:   { A: this._poolNames.A, B: this._poolNames.B },
      slotPoolOverride: Object.fromEntries(this._slotPoolOverride),
      variantPoolOverride: Object.fromEntries(
        [...this._variantPoolOverride].map(([slotIdx, perSlot]) =>
          [slotIdx, Object.fromEntries(perSlot)])),
      // Inputs (image metadata + binaries) live globally in inputsLibrary
      // + content-addressed images storage. Projects no longer carry their
      // own copy — pools/variants below reference inputs by id, which is
      // resolved against the library at runtime.
      globalCurve: { ...this._globalCurve },
      noiseParams: { ...this._noiseParams },
      globalTextureOps: {
        A: cloneOpsPool(this._globalTextureOps?.A),
        B: cloneOpsPool(this._globalTextureOps?.B),
      },
      seed: this._seed,
      tileOffsets: Object.fromEntries(this._tileOffsets),
      cutBowOverrides: Object.fromEntries(this._cutBowOverrides),
      slotCutTransform: Object.fromEntries(this._slotCutTransform),
      slotTextureTransform: Object.fromEntries(this._slotTextureTransform),
      exportConfig: Object.fromEntries(this._exportConfig),
      exportVariantDirection: this._exportVariantDirection,
      exportTargetAspect: this._exportTargetAspect,
      exportVariability: this._exportVariability,
      exportShowIslands: this._exportShowIslands,
      exportLayoutView: this._exportLayoutView,
      exportIncludeSourceA: this._exportIncludeSourceA,
      exportIncludeSourceB: this._exportIncludeSourceB,
      exportMasterShare: this._exportMasterShare,
    };
  };

  StateClass.prototype.deserialize = async function (obj) {
    if (!obj || typeof obj !== "object") return;
    this._beginProjectLoad();
    try {
      await this._deserializeBody(obj);
    } finally {
      this._endProjectLoad();
    }
  };

  StateClass.prototype._deserializeBody = async function (obj) {
    // Inputs are now global (inputsLibrary); state._inputs is loaded once
    // at app start and persists across project switches. We do NOT touch
    // it here. Legacy project blobs (saved before this refactor) still
    // carry an `inputs` array — opportunistically seed the library from
    // it so the metadata isn't lost when the user resaves.
    if (Array.isArray(obj.inputs)) {
      for (const inp of obj.inputs) {
        if (!inp?.id || !inp?.hash) continue;
        if (!inputsLibrary.get(inp.id)) {
          inputsLibrary.put({
            id: inp.id, name: inp.name, tileSize: inp.tileSize, hash: inp.hash,
          });
        }
      }
      // Hydrate any newly-migrated entries into state._inputs (idempotent
      // — skips entries already present from the app-start load).
      await this.loadInputsLibrary();
    }

    this._tileOffsets.clear();
    this._cutBowOverrides.clear();
    this._slotCutTransform.clear();
    this._slotTextureTransform.clear();
    this._pools = { A: [], B: [] };
    this._poolWeights = { A: [], B: [] };
    this._slotPoolOverride.clear();
    this._variantPoolOverride.clear();
    this._selectedTile = null;
    this._selectedSlotIndex = null;

    this.dispatchEvent(new CustomEvent("selection:changed",      { detail: null }));
    this.dispatchEvent(new CustomEvent("slot-selection:changed", { detail: null }));

    this._projectName = (obj.projectName && typeof obj.projectName === "string")
      ? obj.projectName
      : "untitled";

    if (obj.template) {
      const tmpl = getTemplateById(obj.template);
      if (tmpl) this._template = tmpl;
    }

    for (const key of ["A", "B"]) {
      const refs = Array.isArray(obj.pools?.[key]) ? obj.pools[key] : [];
      const w    = Array.isArray(obj.poolWeights?.[key]) ? obj.poolWeights[key] : [];
      this._pools[key] = refs.map((r) => ({ inputId: r.inputId, tileCol: r.tileCol, tileRow: r.tileRow }));
      // Migrate legacy 0..100 scale: any saved weight > 1 means old format
      // (probability was emitted as weight/100). Scale the whole pool down
      // so relative distribution survives; new range is [0, 1].
      const isLegacy = w.some((v) => Number.isFinite(Number(v)) && Number(v) > 1);
      this._poolWeights[key] = this._pools[key].map((_, i) => {
        const n = Number(w[i]);
        if (!Number.isFinite(n)) return 1;
        const scaled = isLegacy ? n / 100 : n;
        return Math.max(0, Math.min(1, scaled));
      });
      this._poolNames[key] = typeof obj.poolNames?.[key] === "string"
        ? obj.poolNames[key].trim()
        : "";
    }
    const ovEntries = obj.slotPoolOverride && typeof obj.slotPoolOverride === "object"
      ? Object.entries(obj.slotPoolOverride) : [];
    for (const [k, v] of ovEntries) {
      if (!v || typeof v !== "object") continue;
      const a = (v.A == null || v.A < 0) ? null : Math.floor(v.A);
      const b = (v.B == null || v.B < 0) ? null : Math.floor(v.B);
      if (a == null && b == null) continue;
      this._slotPoolOverride.set(parseInt(k, 10), { A: a, B: b });
    }
    this._variantPoolOverride.clear();
    const vpoRoot = obj.variantPoolOverride && typeof obj.variantPoolOverride === "object"
      ? Object.entries(obj.variantPoolOverride) : [];
    for (const [slotKey, perSlotObj] of vpoRoot) {
      if (!perSlotObj || typeof perSlotObj !== "object") continue;
      const perSlot = new Map();
      for (const [vKey, ov] of Object.entries(perSlotObj)) {
        if (!ov || typeof ov !== "object") continue;
        const a = (ov.A == null || ov.A < 0) ? null : Math.floor(ov.A);
        const b = (ov.B == null || ov.B < 0) ? null : Math.floor(ov.B);
        if (a == null && b == null) continue;
        perSlot.set(parseInt(vKey, 10), { A: a, B: b });
      }
      if (perSlot.size > 0) this._variantPoolOverride.set(parseInt(slotKey, 10), perSlot);
    }

    // Merge over defaults so a snapshot from before a param was added still loads cleanly.
    this._globalCurve = { ...defaultGlobalCurve(), ...(obj.globalCurve || {}) };

    this._noiseParams = defaultNoiseParams();
    if (obj.noiseParams && typeof obj.noiseParams === "object") {
      const np = obj.noiseParams;
      if (np.A || np.B) {
        // New per-layer format.
        for (const k of ["A", "B"]) {
          if (np[k] && typeof np[k] === "object") {
            this._noiseParams[k] = { ...this._noiseParams[k], ...np[k] };
          }
        }
      } else {
        // Legacy single-layer: side="holes"|"patches"|"off" + shared params.
        const layerCommon = {
          type: np.type, density: np.density, scale: np.scale,
        };
        this._noiseParams.A = {
          ...this._noiseParams.A, ...layerCommon, enabled: np.side === "holes",
        };
        this._noiseParams.B = {
          ...this._noiseParams.B, ...layerCommon, enabled: np.side === "patches",
        };
      }
    }
    this._globalTextureOps = {
      A: mergeOpsPool(obj.globalTextureOps?.A),
      B: mergeOpsPool(obj.globalTextureOps?.B),
    };

    // Seed used to live inside noiseParams; now top-level.
    let restoredSeed = DEFAULT_SEED;
    if (typeof obj.seed === "number" && Number.isFinite(obj.seed)) {
      restoredSeed = obj.seed;
    } else if (obj.noiseParams && Number.isFinite(obj.noiseParams.seed)) {
      restoredSeed = obj.noiseParams.seed;
    }
    this._seed = Math.max(SEED_MIN, Math.min(SEED_MAX, restoredSeed));

    if (obj.tileOffsets && typeof obj.tileOffsets === "object") {
      for (const [slotIdxStr, offsets] of Object.entries(obj.tileOffsets)) {
        const slotIdx = parseInt(slotIdxStr, 10);
        if (!Number.isNaN(slotIdx)) this._tileOffsets.set(slotIdx, { ...offsets });
      }
    }

    if (obj.cutBowOverrides && typeof obj.cutBowOverrides === "object") {
      for (const [slotIdxStr, bows] of Object.entries(obj.cutBowOverrides)) {
        const slotIdx = parseInt(slotIdxStr, 10);
        if (!Number.isNaN(slotIdx) && bows && typeof bows === "object") {
          this._cutBowOverrides.set(slotIdx, { ...bows });
        }
      }
    }

    if (obj.slotCutTransform && typeof obj.slotCutTransform === "object") {
      for (const [slotIdxStr, tx] of Object.entries(obj.slotCutTransform)) {
        const slotIdx = parseInt(slotIdxStr, 10);
        if (Number.isNaN(slotIdx) || !tx || typeof tx !== "object") continue;
        const rotate = (((tx.rotate | 0) % 4) + 4) % 4;
        const flipH  = !!tx.flipH;
        if (rotate === 0 && !flipH) continue;
        this._slotCutTransform.set(slotIdx, { rotate, flipH });
      }
    }

    if (obj.slotTextureTransform && typeof obj.slotTextureTransform === "object") {
      for (const [slotIdxStr, raw] of Object.entries(obj.slotTextureTransform)) {
        const slotIdx = parseInt(slotIdxStr, 10);
        if (Number.isNaN(slotIdx) || !raw || typeof raw !== "object") continue;
        const cleaned = {};
        // Legacy: { rotate, flipH } directly at slot level (pre per-pool).
        // Migrate to pool A (only one texture was rendered with transform anyway).
        const legacy = raw.rotate !== undefined || raw.flipH !== undefined;
        if (legacy) {
          const tx = sanitizeTexTx(raw);
          if (tx) cleaned.A = tx;
        } else {
          for (const k of ["A", "B"]) {
            const tx = sanitizeTexTx(raw[k]);
            if (tx) cleaned[k] = tx;
          }
        }
        if (cleaned.A || cleaned.B) this._slotTextureTransform.set(slotIdx, cleaned);
      }
    }

    this._exportConfig.clear();
    if (obj.exportConfig && typeof obj.exportConfig === "object") {
      for (const [slotIdxStr, cfg] of Object.entries(obj.exportConfig)) {
        const slotIdx = parseInt(slotIdxStr, 10);
        if (!Number.isNaN(slotIdx) && cfg && typeof cfg === "object") {
          this._exportConfig.set(slotIdx, {
            variantCount: cfg.variantCount ?? 1,
            ranges: cfg.ranges ? { ...cfg.ranges } : {},
            variantOffsets: cfg.variantOffsets ? { ...cfg.variantOffsets } : {},
          });
        }
      }
    }
    const dir = obj.exportVariantDirection;
    this._exportVariantDirection = dir === "right" ? "right"
                                 : dir === "down"  ? "down"
                                 : dir === "smart" ? "smart"
                                 : "smart";
    if (Number.isFinite(obj.exportTargetAspect)) {
      this._exportTargetAspect = Math.max(0.25, Math.min(4, obj.exportTargetAspect));
    } else {
      this._exportTargetAspect = 1.0;
    }
    if (Number.isFinite(obj.exportVariability)) {
      this._exportVariability = Math.max(0, Math.min(1, obj.exportVariability));
    } else {
      this._exportVariability = 0.1;
    }
    if (Number.isFinite(obj.exportMasterShare)) {
      this._exportMasterShare = Math.max(0, Math.min(1, obj.exportMasterShare));
    } else {
      this._exportMasterShare = 0.75;
    }
    this._exportShowIslands = !!obj.exportShowIslands;
    this._exportLayoutView  = obj.exportLayoutView === "textures" ? "textures" : "cuts";
    // Legacy single flag (`exportIncludeSources`) migrates to both A and B
    // so old projects that opted in keep both sides bundled.
    const legacyBundle = !!obj.exportIncludeSources;
    this._exportIncludeSourceA = "exportIncludeSourceA" in obj
      ? !!obj.exportIncludeSourceA : legacyBundle;
    this._exportIncludeSourceB = "exportIncludeSourceB" in obj
      ? !!obj.exportIncludeSourceB : legacyBundle;
    // Project load also clears any dirty template marker — load is a fresh start.
    this._templateDirty = false;

    // Order matters: template first so renderers know which slots exist before looking up offsets/sources.
    this.dispatchEvent(new CustomEvent("template:changed",     { detail: this._template }));
    this.dispatchEvent(new CustomEvent("pools:changed",        { detail: "A" }));
    this.dispatchEvent(new CustomEvent("pools:changed",        { detail: "B" }));
    this.dispatchEvent(new CustomEvent("pool-weights:changed", { detail: "A" }));
    this.dispatchEvent(new CustomEvent("pool-weights:changed", { detail: "B" }));
    this.dispatchEvent(new CustomEvent("slot-pool-override:changed", { detail: null }));
    this.dispatchEvent(new CustomEvent("variant-pool-override:changed", { detail: null }));
    for (const key of Object.keys(this._globalCurve)) {
      this.dispatchEvent(new CustomEvent("global-curve:changed", { detail: key }));
    }
    // Single broadcast — listeners with detail===null do a full resync.
    this.dispatchEvent(new CustomEvent("noise:changed", { detail: null }));
    this.dispatchEvent(new CustomEvent("texture-ops:changed", { detail: null }));
    this.dispatchEvent(new CustomEvent("seed:changed", { detail: this._seed }));
    this.dispatchEvent(new CustomEvent("tile-offsets:changed", { detail: null }));
    this.dispatchEvent(new CustomEvent("project-name:changed", { detail: this._projectName }));
    this.dispatchEvent(new CustomEvent("export-config:changed", { detail: null }));
    this.dispatchEvent(new CustomEvent("export-direction:changed", { detail: this._exportVariantDirection }));
    this.dispatchEvent(new CustomEvent("export-aspect:changed", { detail: this._exportTargetAspect }));
    this.dispatchEvent(new CustomEvent("export-variability:changed", { detail: this._exportVariability }));
    this.dispatchEvent(new CustomEvent("export-show-islands:changed", { detail: this._exportShowIslands }));
    this.dispatchEvent(new CustomEvent("export-layout-view:changed", { detail: this._exportLayoutView }));
    this.dispatchEvent(new CustomEvent("export-include-sources:changed", { detail: { key: "A", value: this._exportIncludeSourceA } }));
    this.dispatchEvent(new CustomEvent("export-include-sources:changed", { detail: { key: "B", value: this._exportIncludeSourceB } }));
    this.dispatchEvent(new CustomEvent("template-dirty:changed", { detail: false }));
    this.dispatchEvent(new CustomEvent("project:loaded",       { detail: null }));
  };

}

