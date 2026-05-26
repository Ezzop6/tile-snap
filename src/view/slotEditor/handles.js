import { state } from "../../controller/state.js";
import {
  REFERENCE_SLOT_SIZE,
  buildBowGraph,
  buildHandleGraph,
} from "../render2/index.js";
import { withSlotTransform } from "../render2/viewTransform.js";
import { inverseTransformVec } from "../../core/pointGraph/ops/cutTransform/impl.js";
import { clamp } from "../../core/math.js";

const HANDLE_RADIUS_PX = 10;
const HIT_RADIUS_PX    = 12;
const HANDLE_COLOR = "#ffcc00";
const HANDLE_FILL  = "rgba(255, 204, 0, 0.35)";

const BOW_HANDLE_RADIUS_PX = 7;
const BOW_HIT_RADIUS_PX    = 9;
const BOW_HANDLE_COLOR = "#33ccff";
const BOW_HANDLE_FILL  = "rgba(51, 204, 255, 0.35)";
// ±1 already produces a wildly bulging arc; cornerSoften's natural max
// is ~0.5 (quarter-circle approximation).
const BOW_LIMIT = 1.0;

// Build both handle sets for the slot. point = draggable corner offsets
// (p_r_c grid points), bow = per-cut curvature handles at chord midpoints.
export function collectHandles(slot) {
  return {
    point: collectDraggable(buildHandleGraph(slot), slot),
    bow:   collectBowHandles(buildBowGraph(slot)),
  };
}

export function drawHandles(ctx, handles, origin, viewSize, drag) {
  drawPointHandles(ctx, origin, viewSize, handles.point, drag?.kind === "point" ? drag.key : null);
  drawBowHandles(ctx, origin, viewSize, handles.bow, drag?.kind === "bow" ? drag.key : null);
}

// Distance-based tie-break: when both a bow and a point are within their
// respective hit radii, the one closer to the click wins. Without this
// rule a bow handle near a point handle always wins even when the user
// clearly aimed at the point.
export function hitTest(handles, refX, refY, scale) {
  if (scale <= 0) return null;
  const bowHitR = BOW_HIT_RADIUS_PX / scale;
  let bestBow = null, bestBowDist = bowHitR;
  for (const h of handles.bow) {
    const d = Math.hypot(h.handleX - refX, h.handleY - refY);
    if (d <= bestBowDist) { bestBowDist = d; bestBow = h; }
  }
  const hitR = HIT_RADIUS_PX / scale;
  let bestPt = null, bestPtDist = hitR;
  for (const p of handles.point) {
    const d = Math.hypot(p.pos.x - refX, p.pos.y - refY);
    if (d <= bestPtDist) { bestPtDist = d; bestPt = p; }
  }
  if (bestBow && bestPt) {
    return bestBowDist <= bestPtDist
      ? { kind: "bow",   handle: bestBow }
      : { kind: "point", handle: bestPt };
  }
  if (bestBow) return { kind: "bow",   handle: bestBow };
  if (bestPt)  return { kind: "point", handle: bestPt };
  return null;
}

// startMouse = CSS canvas coords at mousedown. Drag carries its own
// startMouse so applyDrag stays oblivious to where mouse coords come from.
// cutTx (state.getSlotCutTransform(slotIdx) | null) is captured here so
// the drag math can inverse-transform deltas back to state-canonical
// (untransformed) coords: handle graphs are now built in transformed
// space, but state.tileOffsets / cutBowOverrides remain untransformed
// (the pipeline re-applies the transform on every paint).
export function beginDrag(hit, slotIdx, scale, template, startMouse, cutTx) {
  if (hit.kind === "bow") {
    const h = hit.handle;
    return {
      kind: "bow", slotIdx, key: h.key, scale, startMouse, cutTx,
      midX: h.midX, midY: h.midY, px: h.px, py: h.py, len: h.len,
      startBow: h.bow,
    };
  }
  const ptHit = hit.handle;
  const existing = state.getTileOffsets(slotIdx)[ptHit.key] || { dx: 0, dy: 0 };
  const cols = template?.cols || 1;
  const rows = template?.rows || 1;
  // Margin keeps the whole CSS-sized handle inside the slot. Convert
  // from CSS px to REF, then to cell-fraction.
  const marginRefX = HANDLE_RADIUS_PX / scale;
  const marginRefY = HANDLE_RADIUS_PX / scale;
  const marginX = marginRefX / ptHit.cellRefW;
  const marginY = marginRefY / ptHit.cellRefH;
  const driftDx = ptHit.driftX / ptHit.cellRefW;
  const driftDy = ptHit.driftY / ptHit.cellRefH;
  return {
    kind: "point", slotIdx, key: ptHit.key, scale, startMouse, cutTx,
    cellRefW: ptHit.cellRefW, cellRefH: ptHit.cellRefH,
    startOffset: { dx: existing.dx, dy: existing.dy },
    bounds: {
      dxMin: -ptHit.c + marginX - driftDx,
      dxMax: cols  - ptHit.c - marginX - driftDx,
      dyMin: -ptHit.r + marginY - driftDy,
      dyMax: rows  - ptHit.r - marginY - driftDy,
    },
  };
}

// mouseX/mouseY = current CSS canvas coords. Computes REF delta from
// drag.startMouse and pushes the appropriate state update. When the slot
// carries a cutTransform, the visible REF delta is inverse-transformed
// to untransformed space before being applied to state (which stores
// canonical, pre-transform values).
export function applyDrag(drag, mouseX, mouseY) {
  const refDxT = (mouseX - drag.startMouse.x) / drag.scale;
  const refDyT = (mouseY - drag.startMouse.y) / drag.scale;

  if (drag.kind === "bow") {
    // Project drag onto the chord's perpendicular axis. Along-chord
    // component is ignored — sliding sideways doesn't change curvature.
    // perp/chord are both in transformed space (graph was transformed),
    // so the resulting bow is the visible value.
    const perpDelta = refDxT * drag.px + refDyT * drag.py;
    const startPerp = drag.startBow * drag.len;
    let bowVisible = drag.len > 1e-9 ? (startPerp + perpDelta) / drag.len : 0;
    bowVisible = clamp(bowVisible, -BOW_LIMIT, BOW_LIMIT);
    // Stored bow is untransformed; cutTransform flips sign iff flipH
    // (reflection reverses perp-CCW orientation; rotation preserves it).
    const stored = drag.cutTx?.flipH ? -bowVisible : bowVisible;
    state.setCutBowOverride(drag.slotIdx, drag.key, stored);
    return;
  }

  const inv = drag.cutTx
    ? inverseTransformVec(refDxT, refDyT, drag.cutTx)
    : { x: refDxT, y: refDyT };
  let dx = drag.startOffset.dx + inv.x / drag.cellRefW;
  let dy = drag.startOffset.dy + inv.y / drag.cellRefH;
  dx = clamp(dx, drag.bounds.dxMin, drag.bounds.dxMax);
  dy = clamp(dy, drag.bounds.dyMin, drag.bounds.dyMax);
  state.setTileOffset(drag.slotIdx, drag.key, dx, dy);
}

// Right-click clears the override the hit refers to.
export function clearHit(hit, slotIdx) {
  if (hit.kind === "bow") {
    state.clearCutBowOverride(slotIdx, hit.handle.key);
  } else {
    state.clearTileOffset(slotIdx, hit.handle.key);
  }
}

// All handle coords live in REFERENCE space; the view applies the
// origin/scale at draw time. Drag math also runs in REF cell-fraction
// units → independent of the editor's current pixel size.
function collectDraggable(graph, slot) {
  const rows = slot.array?.length ?? 0;
  const cols = slot.array?.[0]?.length ?? 0;
  const cellRefW = cols ? REFERENCE_SLOT_SIZE / cols : REFERENCE_SLOT_SIZE;
  const cellRefH = rows ? REFERENCE_SLOT_SIZE / rows : REFERENCE_SLOT_SIZE;
  const offsets = state.getTileOffsets?.(slot.index) ?? {};
  const out = [];
  for (const p of graph.points.values()) {
    if (p.lock?.x || p.lock?.y) continue;
    if (!p.outwardNormal) continue;
    const m = /^p_(\d+)_(\d+)$/.exec(p.id);
    const bm = /^p_(\d+)_(\d+)__(ne|nw|se|sw)$/.exec(p.id);
    let key, r, c;
    if (m) {
      r = +m[1]; c = +m[2];
      key = `${r},${c}`;
    } else if (bm) {
      // Bridge corner — keyed by full id so two halves of one saddle
      // can be moved independently.
      r = +bm[1]; c = +bm[2];
      key = p.id;
    } else {
      continue;
    }
    const off = offsets[key] || { dx: 0, dy: 0 };
    const intentX = c * cellRefW + off.dx * cellRefW;
    const intentY = r * cellRefH + off.dy * cellRefH;
    out.push({
      key,
      r, c,
      cellRefW, cellRefH,
      pos:     { x: p.pos.x, y: p.pos.y },
      driftX:  p.pos.x - intentX,
      driftY:  p.pos.y - intentY,
    });
  }
  return out;
}

// Each cut connection gets a perpendicular-offset handle at its chord
// midpoint. Drag along the perpendicular axis edits the connection's bow
// (= curvature). Straight cuts (curve.type === "line") start at offset 0.
function collectBowHandles(graph) {
  const out = [];
  for (const conn of graph.connections.values()) {
    if (conn.role !== "cut") continue;
    const a = graph.points.get(conn.from);
    const b = graph.points.get(conn.to);
    if (!a || !b) continue;
    const dx = b.pos.x - a.pos.x;
    const dy = b.pos.y - a.pos.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const px = -dy / len;
    const py =  dx / len;
    const bow = conn.curve?.type === "arc"
      ? (conn.curve.bowProportion ?? 0)
      : 0;
    const mx = (a.pos.x + b.pos.x) * 0.5;
    const my = (a.pos.y + b.pos.y) * 0.5;
    out.push({
      key:    conn.id,
      midX:   mx,
      midY:   my,
      px,
      py,
      len,
      bow,
      handleX: mx + px * bow * len,
      handleY: my + py * bow * len,
    });
  }
  return out;
}

function drawPointHandles(ctx, origin, viewSize, points, activeKey) {
  if (!points.length) return;
  withSlotTransform(ctx, origin, viewSize, (scale) => {
    const r  = HANDLE_RADIUS_PX / scale;
    const lw = 1.5 / scale;
    ctx.lineWidth   = lw;
    ctx.fillStyle   = HANDLE_FILL;
    ctx.strokeStyle = HANDLE_COLOR;
    for (const p of points) {
      const radius = p.key === activeKey ? r + 1 / scale : r;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  });
}

function drawBowHandles(ctx, origin, viewSize, handles, activeKey) {
  if (!handles.length) return;
  withSlotTransform(ctx, origin, viewSize, (scale) => {
    const r  = BOW_HANDLE_RADIUS_PX / scale;
    const lw = 1.2 / scale;
    ctx.lineWidth   = lw;
    ctx.strokeStyle = BOW_HANDLE_COLOR;
    ctx.fillStyle   = BOW_HANDLE_FILL;
    for (const h of handles) {
      // Stem from chord midpoint → handle so users can see direction.
      ctx.beginPath();
      ctx.moveTo(h.midX, h.midY);
      ctx.lineTo(h.handleX, h.handleY);
      ctx.stroke();
      const radius = h.key === activeKey ? r + 1 / scale : r;
      ctx.beginPath();
      ctx.arc(h.handleX, h.handleY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  });
}

