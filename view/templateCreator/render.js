import { state } from "../../controller/state.js";
import { refs, sync } from "./refs.js";
import { patternDims } from "./layout.js";
import { buildSlotBlock } from "./slotBlock.js";
import { buildResizeControls } from "./resize.js";

// Computes the per-cell size that fits within the available canvas area,
// then builds the grid of slot blocks + resize buttons. Called on init
// + every layout / shape change.
export function renderEditor() {
  if (!refs.canvasEl) return;
  refs.canvasEl.innerHTML = "";
  const t = state.template;
  if (!t) return;
  sync.lastRenderedRef = t;
  const layoutRows = t.rows;
  const layoutCols = t.cols;
  const { rows: patternRows, cols: patternCols } = patternDims(t);

  const SLOT_GAP   = 6;
  const CELL_GAP   = 1;
  const ADD_BTN    = 36;
  const cs = getComputedStyle(refs.canvasEl);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop)  + parseFloat(cs.paddingBottom);
  const availW = refs.canvasEl.clientWidth  - padX - ADD_BTN - SLOT_GAP;
  const availH = refs.canvasEl.clientHeight - padY - ADD_BTN - SLOT_GAP;
  const totalCellsX = layoutCols * patternCols;
  const totalCellsY = layoutRows * patternRows;
  const totalGapsX  = (layoutCols - 1) * SLOT_GAP + layoutCols * (patternCols - 1) * CELL_GAP + layoutCols * 4;
  const totalGapsY  = (layoutRows - 1) * SLOT_GAP + layoutRows * (patternRows - 1) * CELL_GAP + layoutRows * 4;
  const cellByW = Math.floor((availW - totalGapsX) / totalCellsX);
  const cellByH = Math.floor((availH - totalGapsY) / totalCellsY);
  const SLOT_MAX_PX = 240;
  const cellMaxByShape = Math.floor(SLOT_MAX_PX / Math.max(patternRows, patternCols, 1));
  const cell = Math.max(6, Math.min(cellMaxByShape, Math.min(cellByW, cellByH)));

  const editor = document.createElement("div");
  editor.className = "creator-editor";

  const grid = document.createElement("div");
  grid.className = "creator-template-grid";
  grid.style.gridTemplateColumns = `repeat(${layoutCols}, max-content)`;
  grid.style.gridTemplateRows    = `repeat(${layoutRows}, max-content)`;
  for (let lr = 0; lr < layoutRows; lr++) {
    for (let lc = 0; lc < layoutCols; lc++) {
      grid.appendChild(buildSlotBlock(lr, lc, cell));
    }
  }
  editor.appendChild(grid);

  const { colControls, rowControls, addCorner } = buildResizeControls(layoutRows, layoutCols);
  editor.appendChild(colControls);
  editor.appendChild(rowControls);
  editor.appendChild(addCorner);

  refs.canvasEl.appendChild(editor);
  refs.stage?.setContent(editor);
}
