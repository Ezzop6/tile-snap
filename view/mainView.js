// Preview main canvas. Driven by the new PointGraph pipeline via
// view/render2/. Currently does texture composite (pool A clipped by
// cut, pool B as bg). Variant resolution and outline still pending
// (legacy renderer holds them; ported feature-by-feature).

import { state } from "../controller/state.js";
import { applyRenderModeClass } from "./projectBar.js";
import { createStage } from "./stage.js";
import { getMode } from "./modeTabs.js";
import { gateRefreshDuringTemplateMode } from "./viewRefreshGate.js";
import {
  buildSlotGraph,
  drawSlotComposite,
  drawOutline,
} from "./render2/index.js";

const SLOT_GAP = 0;
const SELECTION_COLOR = "#ffcc00";

let stageEl = null;
let canvas = null;
let stage = null;
let currentSlotSize = 64;

export function initMainView() {
  stageEl = document.getElementById("main-stage");
  if (!stageEl) return;

  canvas = document.createElement("canvas");
  canvas.className = "main-template";
  // Insert at start so .map-overlay stays on top in stacking order.
  stageEl.insertBefore(canvas, stageEl.firstChild);

  stage = createStage(stageEl, {
    fitToContent: true,
    zoomOrigin:   "center",
    // Gate wheel + pan handlers to preview-only modes. Without this,
    // mainView's wheel handler calls preventDefault on every mode that
    // shares #main-stage (bundle / debug / export / creator) and
    // blocks their native overflow scrolling.
    isActive:     () => getMode() === "preview",
  });
  stage.setContent(canvas);

  canvas.addEventListener("click", onClick);

  // Gate so paint-driven template:changed bursts during template mode
  // don't churn the (hidden) preview canvas; flushes once on exit.
  // Refresh is then rAF-coalesced so N event dispatches in one tick
  // (random-all, bundle export deserialize loop, etc.) yield a single
  // paint at the next frame instead of N sequential full re-renders.
  const gated = coalesceRaf(gateRefreshDuringTemplateMode(refresh));
  state.addEventListener("template:changed",           gated);
  state.addEventListener("pools:changed",              gated);
  state.addEventListener("slot-pool-override:changed", gated);
  state.addEventListener("input:updated",              gated);
  state.addEventListener("input:removed",              gated);
  state.addEventListener("slot-selection:changed",     gated);
  state.addEventListener("global-curve:changed",       gated);
  state.addEventListener("tile-offsets:changed",       gated);
  state.addEventListener("slot-cut-transform:changed", gated);
  state.addEventListener("slot-texture-transform:changed", gated);
  state.addEventListener("texture-ops:changed", gated);
  state.addEventListener("render-mode:changed",        gated);
  state.addEventListener("noise:changed",              gated);
  state.addEventListener("seed:changed",               gated);

  refresh();
}

function coalesceRaf(fn) {
  let pending = false;
  return function coalesced() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; fn(); });
  };
}

function refresh() {
  const t = state.template;
  if (!canvas || !t) return;
  applyRenderModeClass(canvas);

  const mode = state.renderMode === "pixel" ? "pixel" : "smooth";
  const snap = mode === "pixel";

  currentSlotSize = state.nativeSlotSize;
  const cols = t.cols, rows = t.rows;
  const widthPx  = cols * currentSlotSize + (cols - 1) * SLOT_GAP;
  const heightPx = rows * currentSlotSize + (rows - 1) * SLOT_GAP;
  canvas.width  = widthPx;
  canvas.height = heightPx;
  canvas.style.width  = widthPx  + "px";
  canvas.style.height = heightPx + "px";

  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, widthPx, heightPx);

  const selectedIdx = state.selectedSlotIndex;
  for (const slot of t.slots) {
    const origin = {
      x: slot.col * (currentSlotSize + SLOT_GAP),
      y: slot.row * (currentSlotSize + SLOT_GAP),
    };
    const graph = buildSlotGraph(slot);
    drawSlotComposite(ctx, slot, graph, origin, currentSlotSize, { mode });
    drawOutline(ctx, graph, origin, currentSlotSize, { snap });
    if (slot.index === selectedIdx) drawSelectionFrame(ctx, origin, currentSlotSize);
  }

  stage.setContentSize(widthPx, heightPx);
}

function drawSelectionFrame(ctx, origin, size) {
  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth   = 2;
  ctx.strokeRect(origin.x + 1, origin.y + 1, size - 2, size - 2);
  ctx.restore();
}

export function resetMainView() {
  stage?.resetView();
}

function onClick(e) {
  if (stage?.isPanning()) return;
  const slot = slotAt(e.clientX, e.clientY);
  if (!slot) {
    state.clearSlotSelection();
    return;
  }
  if (state.selectedSlotIndex === slot.index) {
    state.clearSlotSelection();
  } else {
    state.selectSlot(slot.index);
  }
}

function slotAt(clientX, clientY) {
  const t = state.template;
  if (!t || !stage) return null;
  const local = stage.clientToContent(clientX, clientY);
  if (!local) return null;
  for (const slot of t.slots) {
    const sx = SLOT_GAP + slot.col * (currentSlotSize + SLOT_GAP);
    const sy = SLOT_GAP + slot.row * (currentSlotSize + SLOT_GAP);
    if (local.x >= sx && local.x < sx + currentSlotSize
        && local.y >= sy && local.y < sy + currentSlotSize) {
      return slot;
    }
  }
  return null;
}
