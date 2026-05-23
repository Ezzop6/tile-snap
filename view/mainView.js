// Preview main canvas. Driven by the new PointGraph pipeline via
// view/render2/. Currently does texture composite (pool A clipped by
// cut, pool B as bg). Variant resolution and outline still pending
// (legacy renderer holds them; ported feature-by-feature).

import { state } from "../controller/state.js";
import { applyRenderModeClass } from "./projectBar.js";
import { createStage } from "./stage.js";
import { sharedTransform } from "./sharedTransform.js";
import { getMode, onModeChange } from "./modeTabs.js";
import { gateRefreshDuringTemplateMode } from "./viewRefreshGate.js";
import {
  buildSlotGraph,
  drawSlotComposite,
  drawOutline,
} from "./render2/index.js";
import { createSelectionOverlay, slotClientRect } from "./selectionFrame.js";

const SLOT_GAP = 0;

let stageEl = null;
let canvas = null;
let stage = null;
let selectionOverlay = null;
let currentSlotSize = 64;
let contentW = 0;
let contentH = 0;

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
    shared:       sharedTransform,
    // Gate wheel + pan handlers to preview-only modes. Without this,
    // mainView's wheel handler calls preventDefault on every mode that
    // shares #main-stage (bundle / debug / export / creator) and
    // blocks their native overflow scrolling.
    isActive:     () => getMode() === "preview",
  });
  stage.setContent(canvas);

  // Selection frame = screen-space overlay (shared with debug + export), so it
  // stays one thin crisp line regardless of the texture resolution this canvas
  // is sized at. Repositions itself on pan/zoom via stage.onTransform.
  selectionOverlay = createSelectionOverlay(stageEl, stage);
  selectionOverlay.setTracker(() => {
    // #main-stage stays in the DOM across modes, so gate on preview mode —
    // otherwise this frame ghosts on top of the export/debug stages.
    if (getMode() !== "preview") return null;
    const t = state.template;
    const idx = state.selectedSlotIndex;
    if (!t || idx == null) return null;
    const slot = t.slots.find((s) => s.index === idx);
    if (!slot) return null;
    const step = currentSlotSize + SLOT_GAP;
    return slotClientRect(canvas, contentW, contentH,
      slot.col * step, slot.row * step, currentSlotSize, currentSlotSize);
  });
  // Hide/show the frame when entering/leaving preview mode.
  onModeChange(() => selectionOverlay?.refresh());

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
  state.addEventListener("noise:changed",              gated);
  state.addEventListener("seed:changed",               gated);
  state.addEventListener("export-resolution:changed",  gated);

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

  const mode = "pixel";
  const snap = true;

  // Unified render+export resolution (set in the Sources header). Preview and
  // export render at the same size → pixel-identical. exportSlotSize = the
  // chosen value, or auto (largest source) when unset.
  currentSlotSize = state.exportSlotSize;
  const cols = t.cols, rows = t.rows;
  const widthPx  = cols * currentSlotSize + (cols - 1) * SLOT_GAP;
  const heightPx = rows * currentSlotSize + (rows - 1) * SLOT_GAP;
  contentW = widthPx;
  contentH = heightPx;
  canvas.width  = widthPx;
  canvas.height = heightPx;
  canvas.style.width  = widthPx  + "px";
  canvas.style.height = heightPx + "px";

  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, widthPx, heightPx);

  for (const slot of t.slots) {
    const origin = {
      x: slot.col * (currentSlotSize + SLOT_GAP),
      y: slot.row * (currentSlotSize + SLOT_GAP),
    };
    const graph = buildSlotGraph(slot);
    drawSlotComposite(ctx, slot, graph, origin, currentSlotSize, { mode });
    drawOutline(ctx, graph, origin, currentSlotSize, { snap });
  }

  stage.setContentSize(widthPx, heightPx);
  selectionOverlay?.refresh();
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
