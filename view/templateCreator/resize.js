import { state } from "../../controller/state.js";
import { refs, sync } from "./refs.js";
import { ensureEditable } from "./guards.js";
import {
  emptySlotForTemplate,
  reindexSlots,
  updateMeta,
} from "./layout.js";
import { renderEditor } from "./render.js";
import { confirmDestructive } from "../dialog.js";

const MAX_LAYOUT = 32;

export async function onResize(kind) {
  if (!(await ensureEditable())) return;
  const t = state.template;
  const layoutRows = t.rows;
  const layoutCols = t.cols;
  // Snapshot (row,col)→oldIndex BEFORE mutating so we can remap project-
  // level slot-keyed maps after the layout shifts indexes.
  const preIndex = new Map();
  for (const s of t.slots) preIndex.set(`${s.row},${s.col}`, s.row * layoutCols + s.col);
  if (kind === "row+") {
    if (layoutRows >= MAX_LAYOUT) return;
    for (let c = 0; c < layoutCols; c++) {
      t.slots.push({ row: layoutRows, col: c, ...emptySlotForTemplate(t) });
    }
    t.rows = layoutRows + 1;
  } else if (kind === "row-") {
    if (layoutRows <= 1) return;
    t.slots = t.slots.filter((s) => s.row < layoutRows - 1);
    t.rows = layoutRows - 1;
  } else if (kind === "col+") {
    if (layoutCols >= MAX_LAYOUT) return;
    for (let r = 0; r < layoutRows; r++) {
      t.slots.push({ row: r, col: layoutCols, ...emptySlotForTemplate(t) });
    }
    t.cols = layoutCols + 1;
  } else if (kind === "col-") {
    if (layoutCols <= 1) return;
    t.slots = t.slots.filter((s) => s.col < layoutCols - 1);
    t.cols = layoutCols - 1;
  }
  reindexSlots(t);
  // Build old→new remap. Only surviving (row,col) survive; rest is dropped.
  const remap = new Map();
  for (const s of t.slots) {
    const oldIdx = preIndex.get(`${s.row},${s.col}`);
    if (oldIdx !== undefined) remap.set(oldIdx, s.index);
  }
  state.remapSlotKeyedIndices(remap);
  renderEditor();
  updateMeta();
  state.markTemplateDirty();
  sync.suppressNextRebuild = true;
  state.notifyTemplateChanged();
}

// Builds the four button strips that sit around the editor grid.
// Returns { colControls, rowControls, addCorner } so render.js can
// position them in the editor wrapper.
export function buildResizeControls(layoutRows, layoutCols) {
  const colControls = document.createElement("div");
  colControls.className = "creator-col-controls";
  const addCol = makeButton("creator-add-col", "+", "Add column on the right", () => onResize("col+"));
  colControls.appendChild(addCol);
  if (layoutCols > 1) {
    const rmCol = makeButton("creator-rm-col", "×", "Remove last column",
      async () => {
        if (await confirmDestructive({
          title: "Remove column",
          message: "Remove the last column? Slot data in that column will be dropped.",
          confirmLabel: "Remove",
        })) onResize("col-");
      });
    colControls.appendChild(rmCol);
  }

  const rowControls = document.createElement("div");
  rowControls.className = "creator-row-controls";
  const addRow = makeButton("creator-add-row", "+", "Add row below", () => onResize("row+"));
  rowControls.appendChild(addRow);
  if (layoutRows > 1) {
    const rmRow = makeButton("creator-rm-row", "×", "Remove last row",
      async () => {
        if (await confirmDestructive({
          title: "Remove row",
          message: "Remove the last row? Slot data in that row will be dropped.",
          confirmLabel: "Remove",
        })) onResize("row-");
      });
    rowControls.appendChild(rmRow);
  }

  const addCorner = makeButton("creator-add-corner", "+", "Add row and column", async () => {
    await onResize("col+");
    await onResize("row+");
  });

  return { colControls, rowControls, addCorner };
}

function makeButton(cls, text, title, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = text;
  b.title = title;
  b.addEventListener("click", onClick);
  return b;
}
