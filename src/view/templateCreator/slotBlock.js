import { state } from "../../controller/state.js";
import { getCellShape } from "../cellShapes/index.js";
import { patternDims, slotAt } from "./layout.js";
import { onCellDown, onCellEnter, onCellMove } from "./interaction.js";

// Renders one slot's pattern grid inside the editor. Wires per-cell mouse
// handlers and gives the active shape a chance to draw decorative
// overlays (e.g. square's saddle bridges) on top of the grid via the
// `renderOverlay` hook. Each cell carries data-* coords so paint
// handlers can locate (layoutRow, layoutCol, patternRow, patternCol)
// without re-querying.
export function buildSlotBlock(layoutRow, layoutCol, cellSize) {
  const t     = state.template;
  const slot  = slotAt(t, layoutRow, layoutCol);
  const shape = getCellShape(t.cellShape);
  const { rows: patternRows, cols: patternCols } = patternDims(t);
  const block = document.createElement("div");
  block.className = "creator-slot-block";
  block.dataset.cellSize    = String(cellSize);
  block.dataset.patternRows = String(patternRows);
  block.dataset.patternCols = String(patternCols);
  block.style.gridTemplateColumns = `repeat(${patternCols}, ${cellSize}px)`;
  block.style.gridTemplateRows    = `repeat(${patternRows}, ${cellSize}px)`;

  if (!slot) return block;

  for (let r = 0; r < patternRows; r++) {
    for (let cc = 0; cc < patternCols; cc++) {
      const c = document.createElement("div");
      c.className = "creator-grid__cell";
      c.dataset.lr = layoutRow;
      c.dataset.lc = layoutCol;
      c.dataset.r  = r;
      c.dataset.c  = cc;
      shape.applyVisual(c, slot.array[r][cc], t);
      c.addEventListener("mousedown",  onCellDown);
      c.addEventListener("mouseenter", onCellEnter);
      c.addEventListener("mousemove",  onCellMove);
      block.appendChild(c);
    }
  }
  shape.renderOverlay?.(block, slot, cellSize, patternRows, patternCols, t);
  return block;
}

// Re-runs the active shape's overlay after a paint mutates topology
// (e.g. square's saddle bridges have to be recomputed when a cell
// flips). Called from interaction.paintCell.
export function refreshSlotOverlay(block, slot) {
  if (!block) return;
  const old = block.querySelector(".creator-slot-block__bridges");
  if (old) old.remove();
  const cellSize    = Number(block.dataset.cellSize);
  const patternRows = Number(block.dataset.patternRows);
  const patternCols = Number(block.dataset.patternCols);
  if (!Number.isFinite(cellSize) || !patternRows || !patternCols) return;
  const shape = getCellShape(state.template?.cellShape);
  shape.renderOverlay?.(block, slot, cellSize, patternRows, patternCols, state.template);
}
