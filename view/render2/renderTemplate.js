import { state } from "../../controller/state.js";
import { buildSlotGraph } from "./buildSlotGraph.js";
import { drawSlotComposite } from "./slotComposite.js";
import { drawOutline } from "./outline.js";
import { drawCutStroke } from "./cutFill.js";

export function renderTemplate(canvas, opts = {}) {
  const t = state.template;
  if (!canvas || !t) return;

  const {
    slotSize = state.nativeSlotSize,
    slotGap = 0,
    showCurveDebug = false,
    freezeNoise = false,
    dpr = window.devicePixelRatio || 1,
    pxScale = 1,
    slotOverrides = null,
    transparentBg = true,
    ignoreSlotPoolOverride = false,
    includeNoise,
    includeWave,
  } = opts;

  const cols = t.cols, rows = t.rows;
  const widthPx  = cols * slotSize + (cols - 1) * slotGap;
  const heightPx = rows * slotSize + (rows - 1) * slotGap;
  canvas.width  = widthPx  * dpr;
  canvas.height = heightPx * dpr;
  canvas.style.width  = widthPx  + "px";
  canvas.style.height = heightPx + "px";

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (transparentBg) ctx.clearRect(0, 0, widthPx, heightPx);

  const mode = state.renderMode === "pixel" ? "pixel" : "smooth";
  const snap = mode === "pixel";

  for (const slot of t.slots) {
    const origin = {
      x: slot.col * (slotSize + slotGap),
      y: slot.row * (slotSize + slotGap),
    };
    const ov = slotOverrides?.get?.(slot.index);
    // freezeNoise disables every layer; otherwise pass through the variant's
    // own noise override (per-layer {enabled, type, density, scale}).
    const noiseOverride = freezeNoise
      ? { A: { enabled: false }, B: { enabled: false } }
      : (ov?.noise || null);
    const graph = buildSlotGraph(slot, {
      curveOverride: ov?.curve || null,
      noiseOverride,
      includeNoise,
      includeWave,
      // Variant override carries its effective cut transform; master pass
      // (no ov) falls back to the slot's master transform from state.
      ...(ov ? { cutTransform: ov.cutTransform } : {}),
    });

    if (showCurveDebug) {
      drawCutStroke(ctx, graph, origin, slotSize, { snap, pxScale });
      continue;
    }

    const slotOv = ignoreSlotPoolOverride
      ? { A: null, B: null }
      : state.getSlotPoolOverride(slot.index);
    const pickRef = (key) => {
      if (ov?.sources && key in ov.sources) return ov.sources[key];
      if (slotOv[key] != null)              return state.poolAt(key, slotOv[key]);
      return state.master(key);
    };
    drawSlotComposite(ctx, slot, graph, origin, slotSize, {
      mode,
      sourceARef: pickRef("A"),
      sourceBRef: pickRef("B"),
    });
    drawOutline(ctx, graph, origin, slotSize, { snap, pxScale });
  }
}
