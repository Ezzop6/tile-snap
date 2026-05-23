import { state } from "../../controller/state.js";
import { getMode } from "../modeTabs.js";
import { getCellShape } from "../cellShapes/index.js";
import { refs } from "./refs.js";

export function makeEmptyArray(rows, cols, fill) {
  const factory = typeof fill === "function" ? fill : () => fill;
  const out = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) row.push(factory());
    out.push(row);
  }
  return out;
}

// Pattern dims live on slot.array (square = pattern grid, triangle = triangle cells).
export function patternDims(t) {
  const a = t?.slots?.[0]?.array;
  return { rows: a?.length || 1, cols: a?.[0]?.length || 1 };
}

export function emptySlotForTemplate(t) {
  const shape = getCellShape(t.cellShape);
  const { rows: pr, cols: pc } = patternDims(t);
  const array = makeEmptyArray(pr, pc, () => shape.defaultValue(t));
  return { array };
}

export function reindexSlots(t) {
  for (const s of t.slots) s.index = s.row * t.cols + s.col;
}

export function slotAt(t, lr, lc) {
  return t.slots.find((s) => s.row === lr && s.col === lc) || null;
}

export function hasAnyPainted() {
  const t = state.template;
  if (!t) return false;
  const cellOn = (v) => Array.isArray(v) ? v.some((x) => x) : !!v;
  for (const slot of t.slots) {
    for (const r of slot.array) {
      for (const v of r) if (cellOn(v)) return true;
    }
  }
  return false;
}

export function isStageActive() {
  return getMode() === "template";
}

export function updateMeta() {
  const t = state.template;
  if (!t || !refs.stageMeta) return;
  refs.stageMeta.textContent = `Layout: ${t.rows} × ${t.cols}`;
}
