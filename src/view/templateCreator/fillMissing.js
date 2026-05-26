// Adds slots for every peering-bit combination the template doesn't already
// cover, mapped through Godot's terrain mode. Body-on (= center cell = 1)
// patterns only — the convention matches how the rest of the project reads
// derivePeeringBits, and gives a 256-cap for corners-and-sides / 16 for
// sides + corners / 16 for the 2×2 dual layout.
//
// Empty grid cells are filled first; rows are appended when more slots are
// needed than gaps available. Existing slot indices stay stable (= they're
// derived from row*cols+col and the appended slots land in fresh positions).

import { state } from "../../controller/state.js";
import { derivePeeringBits } from "../export/peeringBits.js";
import { sync } from "./refs.js";
import { ensureEditable } from "./guards.js";
import { reindexSlots, updateMeta } from "./layout.js";
import { renderEditor } from "./render.js";
import { cellOn } from "../../core/cellValue.js";

const SIDE_BITS   = ["top_side", "right_side", "bottom_side", "left_side"];
const CORNER_BITS = ["top_left_corner", "top_right_corner", "bottom_right_corner", "bottom_left_corner"];

const BIT_TO_CELL_3X3 = {
  top_left_corner:     { r: 0, c: 0 },
  top_side:            { r: 0, c: 1 },
  top_right_corner:    { r: 0, c: 2 },
  left_side:           { r: 1, c: 0 },
  right_side:          { r: 1, c: 2 },
  bottom_left_corner:  { r: 2, c: 0 },
  bottom_side:         { r: 2, c: 1 },
  bottom_right_corner: { r: 2, c: 2 },
};
const BIT_TO_CELL_2X2 = {
  top_left_corner:     { r: 0, c: 0 },
  top_right_corner:    { r: 0, c: 1 },
  bottom_left_corner:  { r: 1, c: 0 },
  bottom_right_corner: { r: 1, c: 1 },
};

function bitsForMode(mode) {
  if (mode === "sides")   return SIDE_BITS;
  if (mode === "corners") return CORNER_BITS;
  return [...SIDE_BITS, ...CORNER_BITS];
}

// Bit value in [0, 1] keyed by ordered name list → stable string.
function sigKey(bits, bitNames) {
  return bitNames.map((n) => bits[n] ?? 1).join("");
}

function makePattern3x3(bits) {
  // Center always = 1 (body ON). Bit=0 means neighbour is T0 (= cell on);
  // bit=1 means T1 (= cell off). Matches derivePeeringBits convention.
  const arr = [[0,0,0],[0,1,0],[0,0,0]];
  for (const [name, val] of Object.entries(bits)) {
    const cell = BIT_TO_CELL_3X3[name];
    if (!cell) continue;
    arr[cell.r][cell.c] = val === 0 ? 1 : 0;
  }
  return arr;
}

function makePattern2x2(bits) {
  const arr = [[0,0],[0,0]];
  for (const [name, val] of Object.entries(bits)) {
    const cell = BIT_TO_CELL_2X2[name];
    if (!cell) continue;
    arr[cell.r][cell.c] = val === 0 ? 1 : 0;
  }
  return arr;
}

function* enumerateCombos(bitNames) {
  const n = bitNames.length;
  const max = 1 << n;
  for (let combo = 0; combo < max; combo++) {
    const bits = {};
    for (let i = 0; i < n; i++) bits[bitNames[i]] = (combo >> i) & 1;
    yield bits;
  }
}

function isAllZero(arr) {
  if (!arr) return true;
  for (const row of arr) {
    if (!row) continue;
    for (const v of row) {
      if (cellOn(v)) return false;
    }
  }
  return true;
}

// Returns:
//   N >= 0  → added N missing slots (0 = nothing was missing)
//   -1      → pattern shape unsupported (not 3×3 nor 2×2)
//   -2      → user cancelled the builtin-promotion confirm
export async function fillMissingPatterns() {
  const t = state.template;
  if (!t) return 0;

  const sample = t.slots[0]?.array;
  const rows = sample?.length || 0;
  const cols = sample?.[0]?.length || 0;
  const is3x3 = rows === 3 && cols === 3;
  const is2x2 = rows === 2 && cols === 2;
  if (!is3x3 && !is2x2) return -1;

  const mode = t.terrainMode || (is2x2 ? "corners" : "corners-and-sides");
  const bitNames = is2x2
    ? ["top_left_corner", "top_right_corner", "bottom_left_corner", "bottom_right_corner"]
    : bitsForMode(mode);
  const makePattern = is2x2 ? makePattern2x2 : makePattern3x3;

  // Existing signatures — body=on slots only.
  const present = new Set();
  for (const slot of t.slots) {
    const arr = slot.array;
    if (!arr) continue;
    if (arr.length !== rows || arr[0]?.length !== cols) continue;
    const { body, bits, fallback } = derivePeeringBits(arr, mode);
    if (fallback || !body) continue;
    present.add(sigKey(bits, bitNames));
  }

  const missing = [];
  for (const bits of enumerateCombos(bitNames)) {
    if (present.has(sigKey(bits, bitNames))) continue;
    missing.push(makePattern(bits));
  }
  if (missing.length === 0) return 0;

  if (!(await ensureEditable())) return -2;
  const tEdit = state.template; // may be a fresh clone after promotion

  // "Empty" candidates: all-zero pattern slots (replaceable defaults left
  // by row+/col+ resize) AND grid positions without any slot. Sort by
  // (row, col) so fill order matches reading order.
  const replaceable = [];
  const gapPositions = [];
  const occupied = new Set();
  for (let i = 0; i < tEdit.slots.length; i++) {
    const s = tEdit.slots[i];
    occupied.add(`${s.row},${s.col}`);
    if (isAllZero(s.array)) replaceable.push({ row: s.row, col: s.col, slotIdx: i });
  }
  for (let r = 0; r < tEdit.rows; r++) {
    for (let c = 0; c < tEdit.cols; c++) {
      if (!occupied.has(`${r},${c}`)) gapPositions.push({ row: r, col: c });
    }
  }
  const available = [...replaceable, ...gapPositions]
    .sort((a, b) => (a.row - b.row) || (a.col - b.col));

  let i = 0;
  for (; i < missing.length && i < available.length; i++) {
    const cell = available[i];
    if (cell.slotIdx !== undefined) {
      tEdit.slots[cell.slotIdx].array = missing[i];
    } else {
      tEdit.slots.push({ col: cell.col, row: cell.row, array: missing[i] });
    }
  }
  while (i < missing.length) {
    const newRow = tEdit.rows;
    tEdit.rows += 1;
    for (let c = 0; c < tEdit.cols && i < missing.length; c++) {
      tEdit.slots.push({ col: c, row: newRow, array: missing[i] });
      i++;
    }
  }

  reindexSlots(tEdit);
  renderEditor();
  updateMeta();
  state.markTemplateDirty();
  sync.suppressNextRebuild = true;
  state.notifyTemplateChanged();
  return missing.length;
}
