// Top-right preview overlay (small map). Driven by the new PointGraph
// pipeline via view/render2/. Clean abstract: cut outline as a red
// stroke (no fill, no cell pattern). Selection highlighted with a
// yellow frame.

import { state } from "../controller/state.js";
import { gateRefreshDuringTemplateMode } from "./viewRefreshGate.js";
import {
  buildSlotGraph,
  drawCellPattern,
  drawCutStroke,
} from "./render2/index.js";
import { drawNoiseOverlay } from "./render2/noiseOverlay.js";
import { coalesceRaf } from "./raf.js";

const SLOT_GAP = 0;
const MIN_SLOT = 16;
const MAX_SLOT = 64;
const SELECTION_COLOR = "#ffcc00";

let stage = null;
let canvas = null;
let currentSlotSize = MIN_SLOT;
let resizeObserver = null;

export function initMapView() {
  stage = document.getElementById("map-stage");
  if (!stage) return;

  stage.innerHTML = "";
  canvas = document.createElement("canvas");
  canvas.className = "map-template";
  stage.appendChild(canvas);

  canvas.addEventListener("click", onClick);

  // rAF-coalesce so burst events (curve "Random all", bundle export
  // deserialize loop) collapse into one minimap repaint per frame.
  const gated = coalesceRaf(gateRefreshDuringTemplateMode(refresh));
  state.addEventListener("template:changed", gated);
  state.addEventListener("pools:changed", gated);
  state.addEventListener("slot-pool-override:changed", gated);
  state.addEventListener("input:updated", gated);
  state.addEventListener("input:removed", gated);
  state.addEventListener("slot-selection:changed", gated);
  state.addEventListener("global-curve:changed", gated);
  state.addEventListener("tile-offsets:changed", gated);
  state.addEventListener("slot-cut-transform:changed", gated);
  state.addEventListener("slot-texture-transform:changed", gated);
  state.addEventListener("texture-ops:changed", gated);
  state.addEventListener("noise:changed", gated);
  state.addEventListener("seed:changed", gated);

  // ResizeObserver still fires immediately — the layout may change in
  // any mode and ignoring it would leave the canvas the wrong size.
  resizeObserver = new ResizeObserver(refresh);
  resizeObserver.observe(stage);

  refresh();
}

function refresh() {
  const t = state.template;
  if (!canvas || !t) return;

  currentSlotSize = computeFitSlotSize();
  const cols = t.cols,
    rows = t.rows;
  const widthPx = cols * currentSlotSize + (cols - 1) * SLOT_GAP;
  const heightPx = rows * currentSlotSize + (rows - 1) * SLOT_GAP;
  canvas.width = widthPx;
  canvas.height = heightPx;
  canvas.style.width = widthPx + "px";
  canvas.style.height = heightPx + "px";

  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, widthPx, heightPx);

  const snap = true;
  const selectedIdx = state.selectedSlotIndex;
  for (const slot of t.slots) {
    const origin = {
      x: slot.col * (currentSlotSize + SLOT_GAP),
      y: slot.row * (currentSlotSize + SLOT_GAP),
    };
    drawCellPattern(ctx, slot, origin, currentSlotSize);
    const graph = buildSlotGraph(slot);
    drawNoiseOverlay(ctx, slot, graph, origin, currentSlotSize);
    drawCutStroke(ctx, graph, origin, currentSlotSize, { snap });
    ctx.strokeStyle = "rgba(255, 255, 255, 0.10)";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      origin.x + 0.5,
      origin.y + 0.5,
      currentSlotSize - 1,
      currentSlotSize - 1,
    );
    if (slot.index === selectedIdx) {
      ctx.strokeStyle = SELECTION_COLOR;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        origin.x + 1,
        origin.y + 1,
        currentSlotSize - 2,
        currentSlotSize - 2,
      );
    }
  }
}

function computeFitSlotSize() {
  const t = state.template;
  if (!t || !stage) return MIN_SLOT;
  const cs = getComputedStyle(stage);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const availH = stage.clientHeight - padY;
  const fitH = Math.floor((availH - (t.rows + 1) * SLOT_GAP) / t.rows);
  return Math.max(MIN_SLOT, Math.min(MAX_SLOT, fitH));
}

function onClick(e) {
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
  if (!t || !canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  for (const slot of t.slots) {
    const sx = slot.col * (currentSlotSize + SLOT_GAP);
    const sy = slot.row * (currentSlotSize + SLOT_GAP);
    if (
      x >= sx &&
      x < sx + currentSlotSize &&
      y >= sy &&
      y < sy + currentSlotSize
    ) {
      return slot;
    }
  }
  return null;
}
