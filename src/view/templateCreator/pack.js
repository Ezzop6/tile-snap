// Reorganises a template's slot grid into a more compact (closer to square)
// layout. Use case: user authored a 5×15 strip and wants something like 9×9.
// Slot data (array contents, cellShape values) is preserved; only positional
// metadata (slot.row / slot.col) and template.cols / template.rows change.
// Empty cells in the new grid get fresh blank slots so the layout stays dense.

import { state } from "../../controller/state.js";
import { ensureEditable } from "./guards.js";
import { confirmDestructive } from "../dialog.js";
import { emptySlotForTemplate, reindexSlots, updateMeta } from "./layout.js";
import { renderEditor } from "./render.js";
import { sync } from "./refs.js";
import { showToast } from "../toast.js";

// Picks (cols, rows) with cols*rows ≥ N minimising `|cols-rows|`, with a small
// penalty per blank cell so we don't prefer 3×N waste over 4×near-N tightness.
// Tiebreak prefers landscape (cols ≥ rows) since the editor's wide canvas
// makes that orientation feel native.
function chooseSquareDims(N) {
  let best = null;
  for (let cols = 1; cols <= N; cols++) {
    const rows = Math.ceil(N / cols);
    const aspect = Math.abs(cols - rows);
    const blanks = cols * rows - N;
    const score = aspect * 10 + blanks;
    if (!best
        || score < best.score
        || (score === best.score && cols > best.cols)) {
      best = { cols, rows, score, aspect, blanks };
    }
  }
  return best;
}

export async function packSquare() {
  const t = state.template;
  if (!t) return;
  const N = t.slots.length;
  if (N <= 1) {
    showToast("Nothing to pack — template has 1 slot or fewer", { kind: "info" });
    return;
  }

  const { cols: newCols, rows: newRows, blanks } = chooseSquareDims(N);
  const oldCols = t.cols;
  const oldRows = t.rows;

  if (newCols === oldCols && newRows === oldRows) {
    showToast(`Already compact (${oldCols}×${oldRows})`, { kind: "info" });
    return;
  }

  // Promote a builtin first so the pack confirm doesn't fire on a read-only
  // template (would cancel anyway). For user/unsaved templates this is a no-op.
  if (!(await ensureEditable())) return;

  const blanksNote = blanks > 0
    ? ` (${blanks} blank cell${blanks === 1 ? "" : "s"} will be added)`
    : "";
  const ok = await confirmDestructive({
    title:        "Pack template",
    message:      `Reorganise ${N} slot${N === 1 ? "" : "s"} from ${oldCols}×${oldRows} to ${newCols}×${newRows}${blanksNote}?`,
    confirmLabel: "Pack",
  });
  if (!ok) return;

  // Sort current slots by row-major order (preserves visual reading order
  // through the repack). The output assignment is also row-major in the
  // new grid, so existing relative ordering survives.
  const ordered = [...t.slots].sort(
    (a, b) => (a.row - b.row) || (a.col - b.col),
  );

  // Build old→new index remap as we reassign positions. Indices use OLD
  // cols for `from`, NEW cols for `to`. state.remapSlotKeyedIndices consumes
  // the map to migrate slot-keyed state (tileOffsets / cutBowOverrides /
  // overrides / selection).
  const remap = new Map();
  ordered.forEach((slot, i) => {
    const oldIndex = slot.row * oldCols + slot.col;
    const newRow   = Math.floor(i / newCols);
    const newCol   = i % newCols;
    slot.row = newRow;
    slot.col = newCol;
    const newIndex = newRow * newCols + newCol;
    remap.set(oldIndex, newIndex);
  });

  // Replace slots array with the freshly-ordered list + new blanks for any
  // empty positions in the new grid (keeps layout dense).
  t.slots = ordered;
  for (let i = ordered.length; i < newCols * newRows; i++) {
    const newRow = Math.floor(i / newCols);
    const newCol = i % newCols;
    t.slots.push({ row: newRow, col: newCol, ...emptySlotForTemplate(t) });
  }

  t.cols = newCols;
  t.rows = newRows;
  // Refresh derived slot.index (= row * t.cols + col) — downstream consumers
  // (renderers, exporters) read slot.index, not row/col directly.
  reindexSlots(t);

  // Order matches resize.js#onResize: remap state first, render editor, meta,
  // dirty flag, suppress-rebuild, notify. notifyTemplateChanged last so other
  // views (mainView / mapView / export) re-render against the finished state.
  state.remapSlotKeyedIndices(remap);
  renderEditor();
  updateMeta();
  state.markTemplateDirty();
  sync.suppressNextRebuild = true;
  state.notifyTemplateChanged();
  showToast(`Packed to ${newCols}×${newRows}`, { kind: "success" });
}
