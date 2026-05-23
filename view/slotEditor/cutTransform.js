import { state } from "../../controller/state.js";
import { composeD4, nextRotateDelta } from "./transformHelpers.js";

// Per-slot CUT geometry transform — project-level modifier. Pipeline reads
// via state.getSlotCutTransform in buildSlotGraph.applySlotCutTransform.
// Symmetry-gated: only operations preserving slot.array are enabled so the
// cut topology stays compatible with adjacent tiles in the exported tileset.

const FLIP_BUTTONS = [
  { key: "flipH",  label: "|", tooltip: "Mirror across vertical axis",  op: { rotate: 0, flipH: true } },
  { key: "flipV",  label: "—", tooltip: "Mirror across horizontal axis", op: { rotate: 2, flipH: true } },
  { key: "diagNW", label: "⟍", tooltip: "Mirror across NW–SE diagonal",  op: { rotate: 3, flipH: true } },
  { key: "diagNE", label: "⟋", tooltip: "Mirror across NE–SW diagonal",  op: { rotate: 1, flipH: true } },
];

// Generic cut-transform control. `pattern` (= slot.array) drives the symmetry
// gate — identical for a slot and its variants since they share the pattern.
// read() → current {rotate,flipH}; write(next) persists an absolute {rotate,flipH}.
// Master slot + export variants both build the SAME widget through this.
export function buildCutTransformControl({ pattern, read, write, label = "cut" }) {
  const wrap = document.createElement("div");
  wrap.className = "cut-transform";

  const labelEl = document.createElement("span");
  labelEl.className = "cut-transform__label";
  labelEl.textContent = label;
  wrap.appendChild(labelEl);

  const grid = document.createElement("div");
  grid.className = "cut-transform__btns";
  wrap.appendChild(grid);

  const sym = getSymmetryGroup(pattern);
  const cur = norm(read());
  const isAllowed = (st) => sym[opKeyFor(st)] === true;

  // Cycle rotate: smallest k > 0 such that current rotated by k stays in
  // the allowed subgroup. delta=0 → no other valid rotation → disabled.
  const delta = nextRotateDelta(cur, isAllowed);
  const rotBtn = document.createElement("button");
  rotBtn.type = "button";
  rotBtn.className = "cut-transform__btn cut-transform__btn--cycle";
  rotBtn.title = delta
    ? "Rotate cut by next valid angle"
    : "No other valid rotation for this slot's pattern";
  rotBtn.textContent = "↻";
  if (!delta) rotBtn.disabled = true;
  rotBtn.addEventListener("click", () => apply(read, write, { rotate: delta, flipH: false }));
  grid.appendChild(rotBtn);

  for (const b of FLIP_BUTTONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cut-transform__btn";
    btn.textContent = b.label;
    btn.title = b.tooltip;
    if (!sym[b.key]) {
      btn.disabled = true;
      btn.title = b.tooltip + " — not a symmetry of this slot's pattern";
    }
    btn.addEventListener("click", () => apply(read, write, b.op));
    grid.appendChild(btn);
  }

  return wrap;
}

// Master per-slot cut transform (slot editor). Thin wrapper over the control.
export function buildCutTransformRow(slot) {
  return buildCutTransformControl({
    pattern: slot?.array,
    read:  () => state.getSlotCutTransform(slot?.index),
    write: (next) => { if (slot?.index != null) state.setSlotCutTransform(slot.index, next); },
  });
}

function norm(t) {
  return { rotate: (((t?.rotate | 0) % 4) + 4) % 4, flipH: !!t?.flipH };
}

function apply(read, write, op) {
  if (op.rotate === 0 && !op.flipH) return; // no-op identity op
  const next = composeD4(norm(read()), op);
  write(next);
}

// Map a D4 state to its symmetry-group key for gating lookups.
function opKeyFor(st) {
  if (!st.flipH) return ["id", "rot90", "rot180", "rot270"][st.rotate];
  return ["flipH", "diagNE", "flipV", "diagNW"][st.rotate];
}

// Pattern symmetry check — applies cell-index map and verifies values
// match. Non-square patterns can't host rot90/rot270/diag (reshape rows↔cols).
// Non-scalar cells (triangle pinwheel) conservatively get identity only.
function getSymmetryGroup(pattern) {
  const allow = {
    id: true, rot90: false, rot180: false, rot270: false,
    flipH: false, flipV: false, diagNW: false, diagNE: false,
  };
  if (!pattern || !pattern.length || !pattern[0]?.length) return allow;
  const rows = pattern.length;
  const cols = pattern[0].length;
  const sample = pattern[0][0];
  if (typeof sample !== "number" && typeof sample !== "boolean") return allow;
  const isSquare = rows === cols;

  const check = (mapFn, requireSquare) => {
    if (requireSquare && !isSquare) return false;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const [r2, c2] = mapFn(r, c);
        if (pattern[r][c] !== pattern[r2]?.[c2]) return false;
      }
    }
    return true;
  };

  allow.rot90  = check((r, c) => [c, cols - 1 - r], true);
  allow.rot180 = check((r, c) => [rows - 1 - r, cols - 1 - c], false);
  allow.rot270 = check((r, c) => [cols - 1 - c, r], true);
  allow.flipH  = check((r, c) => [r, cols - 1 - c], false);
  allow.flipV  = check((r, c) => [rows - 1 - r, c], false);
  allow.diagNW = check((r, c) => [c, r], true);
  allow.diagNE = check((r, c) => [cols - 1 - c, rows - 1 - r], true);
  return allow;
}
