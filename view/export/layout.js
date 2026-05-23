import { state } from "../../controller/state.js";
import { xs, LAYOUT_TILE_DISPLAY_PX } from "./_state.js";
import { buildSlotBlock, buildSourceBlock } from "./tile.js";

function buildSelectionFrame(col, row) {
  const frame = document.createElement("div");
  frame.className = "tile-selection-frame";
  frame.style.gridColumn = String(col + 1);
  frame.style.gridRow    = String(row + 1);
  return frame;
}

function buildPatternMarker(slot, color, col, row) {
  const arr = slot.array;
  const rows = arr.length;
  const cols = arr[0]?.length ?? 0;
  const marker = document.createElement("div");
  marker.className = "tile-group-marker";
  marker.style.setProperty("--slot-group-color", color);
  marker.style.gridColumn = String(col + 1);
  marker.style.gridRow    = String(row + 1);
  marker.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  marker.style.gridTemplateRows    = `repeat(${rows}, 1fr)`;
  const cellOn = (v) => Array.isArray(v) ? v.some((x) => x) : !!v;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement("div");
      cell.className = "tile-group-marker__cell";
      if (cellOn(arr[r][c])) cell.classList.add("is-on");
      marker.appendChild(cell);
    }
  }
  return marker;
}

export function renderLayout() {
  if (!xs.layoutEl || !state.template) return;
  xs.layoutEl.innerHTML = "";
  xs.layoutEl.dataset.direction = state.exportVariantDirection;
  const t = state.template;

  const selected = state.selectedSlotIndex;
  const slotsWithVariants = t.slots
    .filter((s) => state.getExportVariantCount(s.index) > 1)
    .sort((a, b) => (a.row - b.row) || (a.col - b.col));

  const colorBySlotIdx = new Map();
  slotsWithVariants.forEach((s, i) => colorBySlotIdx.set(s.index, slotGroupColor(i)));

  const layout = computeLayout(t, slotsWithVariants);
  const sourceLayout = computeSourceLayout(
    layout.outCols, layout.outRows,
    state.exportIncludeSourceA, state.exportIncludeSourceB,
  );

  const totalRows = layout.outRows + sourceLayout.totalRows;

  // Single CSS grid so column rhythm is shared (no per-region drift).
  const grid = document.createElement("div");
  grid.className = "layout-grid__full";
  grid.style.gridTemplateColumns = `repeat(${layout.outCols}, ${LAYOUT_TILE_DISPLAY_PX}px)`;
  grid.style.gridTemplateRows    = `repeat(${totalRows}, ${LAYOUT_TILE_DISPLAY_PX}px)`;

  // Sibling marker div: a small N×M square mirroring slot.array, where
  // "on" cells get the group hue and the outline is a high-contrast frame
  // so the marker stays readable on any tile colour. Canvas doesn't
  // support ::after, hence the separate div.
  const slotByIdx = new Map(t.slots.map((s) => [s.index, s]));
  const placeTile = (block, col, row, slotIdx, isSelected) => {
    block.style.gridColumn = String(col + 1);
    block.style.gridRow    = String(row + 1);
    grid.appendChild(block);
    // Selection frame: sibling div in the same grid cell (= same trick
    // as the pattern marker). CSS-outline-on-tile rendered inconsistently
    // when tiles touch edge-to-edge — a real grid item with an inset
    // border draws reliably and never gets clipped by neighbours.
    if (isSelected) grid.appendChild(buildSelectionFrame(col, row));
    const color = colorBySlotIdx.get(slotIdx);
    const slot  = slotByIdx.get(slotIdx);
    if (!color || !slot) return;
    grid.appendChild(buildPatternMarker(slot, color, col, row));
  };

  for (const slot of t.slots) {
    const block = buildSlotBlock(slot, /*isVariant*/ false);
    const isSelected = slot.index === selected && xs.selectedVariantIdx === 0;
    placeTile(block, slot.col, slot.row, slot.index, isSelected);
  }

  for (let gi = 0; gi < layout.groups.length; gi++) {
    const g = layout.groups[gi];
    const slot = slotsWithVariants[gi];
    const count = state.getExportVariantCount(slot.index);
    for (let v = 1; v < count; v++) {
      const block = buildSlotBlock(slot, /*isVariant*/ true, v);
      const isSelected = slot.index === selected && xs.selectedVariantIdx === v;
      const { col, row } = variantCellInGroup(g, v - 1);
      placeTile(block, col, row, slot.index, isSelected);
    }
  }

  // Bundled source tiles: rendered as raw pool tile canvases so the user
  // sees exactly which inputs land where in the exported PNG.
  for (const entry of sourceLayout.entries) {
    const block = buildSourceBlock(entry);
    placeTile(block, entry.col, entry.row, null);
  }

  xs.layoutEl.appendChild(grid);
  // Re-mount so the stage transform (CSS on mounted element) survives re-renders.
  xs.stage?.setContent(grid);
}

// Layout source tiles in extra rows below the atlas. Pool A first (master
// + variants), then pool B on a fresh row. Wraps at `outCols`. Each entry
// carries its resolved tile canvas so renderers can index by (col, row)
// without re-resolving inputs. Shared between the on-screen preview and
// the PNG export so both see identical positions. Pools opt in
// independently via `includeA` / `includeB`.
export function computeSourceLayout(outCols, outRows, includeA = false, includeB = false) {
  const entries = [];
  let col = 0;
  let row = outRows;
  let lastSlotUsedInRow = false;
  const placePool = (key) => {
    const pool = state.pool(key);
    if (pool.length === 0) return;
    if (lastSlotUsedInRow) { row++; col = 0; lastSlotUsedInRow = false; }
    for (let i = 0; i < pool.length; i++) {
      if (col >= outCols) { col = 0; row++; }
      const ref = pool[i];
      const tile = resolveTile(ref);
      entries.push({ col, row, key, poolIdx: i, ref, tile });
      col++;
      lastSlotUsedInRow = true;
    }
  };
  if (includeA) placePool("A");
  if (includeB) placePool("B");
  const totalRows = entries.length === 0 ? 0 : (row - outRows + 1);
  return { entries, totalRows };
}

function resolveTile(ref) {
  if (!ref) return null;
  const input = state.inputs.find((i) => i.id === ref.inputId);
  if (!input) return null;
  return input.tiles.find((t) => t.row === ref.tileRow && t.col === ref.tileCol) || null;
}

export function variantCellInGroup(g, varIdx) {
  if (g.dir === "col") {
    return { col: g.col, row: g.row + varIdx };
  }
  // "row" (1xN): dx = varIdx; "block" (wxh): wraps.
  const dx = varIdx % g.w;
  const dy = Math.floor(varIdx / g.w);
  return { col: g.col + dx, row: g.row + dy };
}

// Golden-angle hue stepping spreads cleanly for ~10-15 groups; beyond that hues
// repeat but saturation/lightness still differentiates.
function slotGroupColor(i) {
  const hue = (i * 137.508) % 360;
  return `hsl(${hue.toFixed(0)}, 85%, 60%)`;
}

export function computeLayout(t, slotsWithVariants) {
  const mode = state.exportVariantDirection;
  const counts = slotsWithVariants.map((s) => state.getExportVariantCount(s.index) - 1);

  if (mode === "smart") return smartPack2D(t, counts, slotsWithVariants);
  return legacyLayout(t, counts, slotsWithVariants, mode);
}

function legacyLayout(t, counts, slotsWithVariants, mode) {
  let outCols = t.cols;
  let outRows = t.rows;
  let maxRun  = 0;
  for (const c of counts) if (c > maxRun) maxRun = c;
  const groups = slotsWithVariants.map((s, i) => {
    const length = counts[i];
    if (mode === "right") {
      return { slotIndex: s.index, length, col: t.cols + i, row: 0,           w: 1,      h: length, dir: "col" };
    }
    return   { slotIndex: s.index, length, col: 0,           row: t.rows + i, w: length, h: 1,      dir: "row" };
  });
  if (mode === "right") {
    outCols += slotsWithVariants.length;
    if (maxRun > outRows) outRows = maxRun;
  } else {
    outRows += slotsWithVariants.length;
    if (maxRun > outCols) outCols = maxRun;
  }
  return { mode, groups, outCols, outRows };
}

// Optimises for a SQUARE overall layout (primary), area as tiebreak.
// Compact rectangles save no real space vs. a square — Godot atlases
// and human eyes both scan square sheets faster. Each group still
// tries 1xN/Nx1 plus near-square wxh (waste <= 25%) so big groups can
// fill corners a strip-only packer would waste.
function smartPack2D(t, counts, slotsWithVariants) {
  const totalVariants = counts.reduce((a, b) => a + b, 0);
  if (totalVariants === 0) {
    return {
      mode: "smart",
      groups: counts.map((_, i) => ({ slotIndex: slotsWithVariants[i].index, length: 0, col: 0, row: 0, w: 0, h: 0, dir: "row" })),
      outCols: t.cols,
      outRows: t.rows,
    };
  }

  const shapesByGroup = counts.map((N) => candidateShapes(N));

  const maxGroup = Math.max(0, ...counts);
  const minOutCols = Math.max(t.cols, 1);
  const totalCells = t.cols * t.rows + totalVariants;
  // Target sqrt(totalCells) as ideal side; cap search to ~2× that so
  // we don't iterate degenerate wide layouts that can't improve square score.
  const targetSide = Math.ceil(Math.sqrt(totalCells));
  const maxOutCols = Math.max(targetSide * 2, minOutCols + maxGroup);

  let best = null;
  for (let outCols = minOutCols; outCols <= maxOutCols; outCols++) {
    const placed = tryPackMultiShape(t, shapesByGroup, outCols);
    if (!placed) continue;
    let outRows = t.rows;
    for (const p of placed) {
      if (!p.w || !p.h) continue;
      const end = p.row + p.h;
      if (end > outRows) outRows = end;
    }
    const area = outCols * outRows;
    const squareScore = Math.abs(outCols - outRows);
    if (
      !best ||
      squareScore < best.squareScore ||
      (squareScore === best.squareScore && area < best.area)
    ) {
      best = { area, squareScore, outCols, outRows, placed };
    }
    // Once outCols alone exceeds the best squareScore baseline (outRows
    // is at least t.rows), no wider layout can be more square.
    if (best && outCols - t.rows > best.squareScore) break;
  }
  if (!best) return legacyLayout(t, counts, slotsWithVariants, "down");

  const groups = slotsWithVariants.map((s, i) => ({
    slotIndex: s.index,
    length:    counts[i],
    col:       best.placed[i].col,
    row:       best.placed[i].row,
    w:         best.placed[i].w,
    h:         best.placed[i].h,
    dir:       best.placed[i].dir,
  }));
  return { mode: "smart", groups, outCols: best.outCols, outRows: best.outRows };
}

function candidateShapes(N) {
  if (N === 0) return [{ w: 0, h: 0, dir: "row", waste: 0 }];
  const opts = new Map();
  const add = (w, h, dir) => {
    const key = `${w},${h}`;
    if (opts.has(key)) return;
    opts.set(key, { w, h, dir, waste: w * h - N, asym: Math.abs(w - h) });
  };
  add(N, 1, "row");
  add(1, N, "col");
  for (let w = 2; w <= N; w++) {
    const h = Math.ceil(N / w);
    if (h < 2) continue;
    if (w * h - N > N * 0.25) continue;
    add(w, h, "block");
  }
  return [...opts.values()].sort((a, b) =>
    a.waste - b.waste || a.asym - b.asym
  );
}

function tryPackMultiShape(t, shapesByGroup, outCols) {
  const occupied = new Set();
  const key = (c, r) => `${c},${r}`;
  for (let r = 0; r < t.rows; r++) {
    for (let c = 0; c < t.cols; c++) occupied.add(key(c, r));
  }
  const placed = [];
  let maxRow = t.rows - 1;
  for (const shapes of shapesByGroup) {
    if (shapes[0]?.w === 0) {
      placed.push({ col: 0, row: 0, w: 0, h: 0, dir: "row" });
      continue;
    }
    let p = null;
    for (const shape of shapes) {
      if (shape.w > outCols) continue;
      const scanRowLimit = maxRow + shape.h + 1;
      for (let row = 0; row <= scanRowLimit && !p; row++) {
        for (let col = 0; col + shape.w <= outCols && !p; col++) {
          if (rectFree(occupied, key, col, row, shape.w, shape.h)) {
            p = { col, row, w: shape.w, h: shape.h, dir: shape.dir };
          }
        }
      }
      if (p) break;
    }
    if (!p) return null;
    occupyRect(occupied, key, p);
    const end = p.row + p.h - 1;
    if (end > maxRow) maxRow = end;
    placed.push(p);
  }
  return placed;
}

function rectFree(occupied, key, col, row, w, h) {
  for (let dr = 0; dr < h; dr++) {
    for (let dc = 0; dc < w; dc++) {
      if (occupied.has(key(col + dc, row + dr))) return false;
    }
  }
  return true;
}

function occupyRect(occupied, key, p) {
  for (let dr = 0; dr < p.h; dr++) {
    for (let dc = 0; dc < p.w; dc++) {
      occupied.add(key(p.col + dc, p.row + dr));
    }
  }
}
