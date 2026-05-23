import { state } from "../../controller/state.js";
import { applyRenderModeClass } from "../projectBar.js";
import { VARIANT_PARAMS } from "../../core/variant_params.js";
import { variantRng } from "../../core/random.js";
import { LAYOUT_TILE_DISPLAY_PX } from "./_state.js";
import { TEXTURE_OPS } from "../render2/textureOps/registry.js";
import {
  buildSlotGraph,
  drawSlotComposite,
  drawCutStroke,
  drawOutline,
} from "../render2/index.js";

// Render ONE tile (master or variant) into ctx at `origin`, sized `size`.
// Shared by the export layout's single atlas canvas + the right-panel
// preview's single-tile canvas, so both match the PNG exactly.
export function drawTileInto(ctx, slot, isVariant, variantIdx, origin, size) {
  const ov = isVariant ? buildVariantOverride(slot.index, variantIdx) : null;
  const noiseOverride = state.exportShowIslands
    ? (ov?.noise || null)
    : {
        A: { ...(ov?.noise?.A || {}), enabled: false },
        B: { ...(ov?.noise?.B || {}), enabled: false },
      };
  const graph = buildSlotGraph(slot, {
    curveOverride: ov?.curve || null,
    noiseOverride,
    // Variant pass passes its effective cut transform (variant ?? master);
    // master tile (ov null) lets buildSlotGraph read the master from state.
    ...(ov ? { cutTransform: ov.cutTransform } : {}),
  });

  if (state.exportLayoutView === "textures") {
    const slotOv = state.getSlotPoolOverride(slot.index);
    const pickSide = (key) => {
      if (isVariant) return ov?.sources?.[key] ?? state.master(key);
      if (slotOv[key] != null) return state.poolAt(key, slotOv[key]);
      return state.master(key);
    };
    drawSlotComposite(ctx, slot, graph, origin, size, {
      mode:        state.renderMode,
      sourceARef:  pickSide("A"),
      sourceBRef:  pickSide("B"),
    });
    drawOutline(ctx, graph, origin, size, { snap: state.renderMode === "pixel" });
  } else {
    drawCutStroke(ctx, graph, origin, size, { snap: state.renderMode === "pixel" });
  }
}

// Single-tile canvas for the right-panel preview (one tile → no seams).
export function buildSlotBlock(slot, isVariant, variantIdx = 0) {
  const nat = state.exportSlotSize;
  const canvas = document.createElement("canvas");
  canvas.className = "layout-tile" + (isVariant ? " is-variant" : "");
  canvas.width  = nat;
  canvas.height = nat;
  canvas.style.width  = `${LAYOUT_TILE_DISPLAY_PX}px`;
  canvas.style.height = `${LAYOUT_TILE_DISPLAY_PX}px`;
  applyRenderModeClass(canvas);
  canvas.dataset.slotIndex   = String(slot.index);
  canvas.dataset.variantIdx  = String(isVariant ? variantIdx : 0);
  drawTileInto(canvas.getContext("2d"), slot, isVariant, variantIdx, { x: 0, y: 0 }, nat);
  return canvas;
}

// Draw a bundled source tile into ctx at `origin`/`size`. Goes through the
// active pool's texture-ops chain so it matches the PNG + main canvas.
export function drawSourceInto(ctx, entry, origin, size) {
  if (!entry?.tile?.canvas) return;
  const processed = applyPoolTextureOps(entry.tile.canvas, entry.key);
  ctx.drawImage(processed, 0, 0, processed.width, processed.height,
                origin.x, origin.y, size, size);
}

// Chain the registry's bitmap preprocessors for the given pool. Same
// chain slotComposite#sourceBitmap walks; ops short-circuit on identity
// params internally.
export function applyPoolTextureOps(srcCanvas, poolKey) {
  let bmp = srcCanvas;
  for (const op of TEXTURE_OPS) {
    const params = state.getGlobalTextureOp(poolKey, op.name);
    if (params) bmp = op.apply(bmp, poolKey, params);
  }
  return bmp;
}

export function buildVariantOverride(slotIndex, variantIdx) {
  const offset = state.getVariantSeedOffset(slotIndex, variantIdx);
  const rng = variantRng(state.seed, slotIndex, variantIdx, offset);
  const overrides = { curve: {}, noise: {}, sources: {}, cutTransform: null };
  let hasAny = false;
  for (const param of VARIANT_PARAMS) {
    const range = state.getExportRange(slotIndex, param.key);
    if (!range || range.dMin === range.dMax) continue;
    const cur = currentGlobalValue(param);
    const lo  = Math.max(param.min, cur + range.dMin);
    const hi  = Math.min(param.max, cur + range.dMax);
    if (lo === hi) continue;
    const v = lo + rng() * (hi - lo);
    if (param.source === "noise") {
      const layer = param.layer;
      if (!overrides.noise[layer]) overrides.noise[layer] = {};
      overrides.noise[layer][param.subKey] = v;
    } else {
      overrides[param.source][param.key] = v;
    }
    hasAny = true;
  }
  const vpo = state.getVariantPoolOverride(slotIndex, variantIdx);
  for (const key of ["A", "B"]) {
    const pinned = vpo[key];
    const ref = pinned != null
      ? state.poolAt(key, pinned)
      : weightedPickPoolRef(key, rng);
    overrides.sources[key] = ref;
    if (ref) hasAny = true;
  }
  // Effective cut transform = this variant's override, else the master's.
  // An explicit per-variant mirror alone is enough to materialise the override.
  overrides.cutTransform = state.effectiveVariantCutTransform(slotIndex, variantIdx);
  if (state.getVariantCutTransform(slotIndex, variantIdx)) hasAny = true;
  return hasAny ? overrides : null;
}

export function weightedPickPoolRef(key, rng) {
  const pool = state.pool(key);
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];
  let total = 0;
  for (let i = 0; i < pool.length; i++) total += Math.max(0, state.poolWeight(key, i));
  if (total <= 0) return pool[0];
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= Math.max(0, state.poolWeight(key, i));
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

export function currentGlobalValue(param) {
  if (param.source === "curve") return state.globalCurve[param.key] ?? 0;
  if (param.source === "noise") return state.noiseParams[param.layer]?.[param.subKey] ?? 0;
  return 0;
}
