import { state } from "../../controller/state.js";
import {
  buildSlotGraph,
  drawCellPattern,
  drawCutStroke,
} from "../render2/index.js";

const MIN_SIZE = 120;
const MAX_SIZE = 480;

// Pattern fill + cut stroke. Handles are drawn on top by handles.js
// in the same paint cycle.
export function drawPreviewBase(ctx, slot, origin, size) {
  drawCellPattern(ctx, slot, origin, size);
  const graph = buildSlotGraph(slot);
  const snap = state.renderMode === "pixel";
  drawCutStroke(ctx, graph, origin, size, { snap });
}

export function syncMeta(slot) {
  const meta = document.getElementById("slot-meta");
  if (!meta) return;
  if (!slot) {
    meta.textContent = "";
    return;
  }
  meta.innerHTML =
    `<span class="panel-section__meta-key">col</span> ${slot.col}` +
    ` <span class="panel-section__meta-key">row</span> ${slot.row}` +
    ` <span class="panel-section__meta-key">#</span> ${slot.index}`;
}

export function computeFitSize(stage) {
  const cs = getComputedStyle(stage);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const availW = stage.clientWidth - padX;
  return Math.max(MIN_SIZE, Math.floor(Math.min(MAX_SIZE, availW)));
}
