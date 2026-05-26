import { state } from "../../controller/state.js";
import { getCellShape } from "../cellShapes/index.js";
import { sync } from "./refs.js";
import { ensureEditable } from "./guards.js";
import { slotAt } from "./layout.js";
import { refreshSlotOverlay } from "./slotBlock.js";

// 0 idle, 1 LMB (paint on), 2 RMB (paint off).
let paintMode = 0;
// lastPaint guards against re-firing for the same (cell, region) during a drag,
// critical for triangle mousemove firing rate.
let lastPaint = { el: null, region: null };
let editableChecked = false;
// Tagged with a fresh Symbol on every mousedown. The await in onCellDown
// captures the symbol it started with; if mouseup (which clears it) or a new
// mousedown (which replaces it) happens before ensureEditable resolves, the
// paint intent is stale and we bail.
let activeGesture = null;
window.addEventListener("mouseup", () => {
  paintMode = 0;
  lastPaint = { el: null, region: null };
  editableChecked = false;
  activeGesture = null;
});

export async function onCellDown(e) {
  if (e.button !== 0 && e.button !== 2) return;
  const myGesture = Symbol("paint");
  activeGesture = myGesture;
  if (!editableChecked) {
    const ok = await ensureEditable();
    if (!ok || activeGesture !== myGesture) return;
    editableChecked = true;
  }
  paintMode = e.button === 0 ? 1 : 2;
  lastPaint = { el: null, region: null };
  paintCell(e.currentTarget, e);
}

export function onCellEnter(e) {
  if (paintMode === 0) return;
  paintCell(e.currentTarget, e);
}

export function onCellMove(e) {
  if (paintMode === 0) return;
  paintCell(e.currentTarget, e);
}

function paintCell(el, e) {
  const t = state.template;
  if (!t) return;
  const shape  = getCellShape(t.cellShape);
  const region = shape.hitTest(el, e, t);
  if (lastPaint.el === el && lastPaint.region === region) return;
  lastPaint = { el, region };

  const lr = +el.dataset.lr;
  const lc = +el.dataset.lc;
  const r  = +el.dataset.r;
  const cc = +el.dataset.c;
  const slot = slotAt(t, lr, lc);
  if (!slot) return;

  const cur  = slot.array[r][cc];
  const next = shape.nextValue(cur, paintMode, region, t);
  if (shape.valueEquals(cur, next)) return;
  slot.array[r][cc] = next;
  shape.applyVisual(el, next, t);
  // Shape may need to refresh its decorative overlay (e.g. saddle
  // bridges) after topology change.
  refreshSlotOverlay(el.parentElement, slot);
  state.markTemplateDirty();
  // Don't rebuild the grid — applyVisual already updated this DOM cell.
  // Just broadcast to preview/map/export listeners.
  sync.suppressNextRebuild = true;
  state.notifyTemplateChanged();
}
