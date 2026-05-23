// Semi-transparent fills showing where noise A (holes) carves out the
// filled region and where noise B (patches) adds onto empty. Shared by
// the debug stage (with layer toggles) and the floating minimap (always-on,
// so the user can tell at a glance which part of the cut is noise vs base).
//
// Drawn at REFERENCE coords via withSlotTransform — the same coord system
// the pipeline noise op uses (graph.meta.slotSize = REFERENCE_SLOT_SIZE).
// Earlier code passed view-scaled SLOT_SIZE which made the mask spill into
// neighbouring slots at any non-1x zoom; using REF here is the fix.

import { state } from "../../controller/state.js";
import { buildNoiseMask, applyCutFade } from "../../core/noise.js";
import { withSlotTransform } from "./viewTransform.js";
import { REFERENCE_SLOT_SIZE } from "./buildSlotGraph.js";

export const NOISE_OVERLAY_COLORS = {
  holes:   "rgba(220, 90, 90, 0.45)",
  patches: "rgba(120, 210, 110, 0.45)",
};

// shouldShow(side: "holes" | "patches") lets debug layer toggles veto a
// layer; default returns true so consumers without a panel get both
// layers whenever state has them enabled.
export function drawNoiseOverlay(ctx, slot, graph, origin, viewSize, shouldShow = () => true) {
  const np = state.noiseParams;
  if (!np) return;
  const seed = state.seed | 0;
  const segments    = collectBoundarySegments(graph);
  const cutSegments = collectCutSegments(graph);
  withSlotTransform(ctx, origin, viewSize, () => {
    drawLayer(ctx, slot, segments, cutSegments, np.A, "holes",   seed,        shouldShow);
    drawLayer(ctx, slot, segments, cutSegments, np.B, "patches", seed + 9973, shouldShow);
  });
}

function drawLayer(ctx, slot, segments, cutSegments, layer, side, seed, shouldShow) {
  if (!layer?.enabled) return;
  if (!shouldShow(side)) return;
  const color = NOISE_OVERLAY_COLORS[side];
  if (!color) return;
  const mask = buildNoiseMask(
    slot.col, slot.row, { x: 0, y: 0 },
    { w: REFERENCE_SLOT_SIZE, h: REFERENCE_SLOT_SIZE },
    layer,
    seed,
  );
  // Mirror the noise op's edge fade (core/noise.js#applyCutFade) so this tint
  // matches what slotComposite actually renders.
  if (layer.edgeFade > 0) {
    const cols = Math.max(1, slot.array?.[0]?.length || 1);
    applyCutFade(mask, cutSegments, layer.edgeFade * (REFERENCE_SLOT_SIZE / cols));
  }
  const wantInside = side === "holes";
  ctx.save();
  ctx.fillStyle = color;
  const { cols, rows, data, cell } = mask;
  for (let r = 0; r < rows; r++) {
    const py = r * cell + cell * 0.5;
    for (let c = 0; c < cols; c++) {
      if (!data[r * cols + c]) continue;
      const px = c * cell + cell * 0.5;
      if (isInsideRegion(segments, px, py) !== wantInside) continue;
      ctx.fillRect(c * cell, r * cell, cell, cell);
    }
  }
  ctx.restore();
}

// Even-parity ray cast against cut+closure boundary. Curves approximated
// as straight chords for the parity test — acceptable for an overlay.
function collectBoundarySegments(graph) {
  const out = [];
  for (const conn of graph.connections.values()) {
    if (conn.role !== "cut" && conn.role !== "closure") continue;
    const a = graph.points.get(conn.from);
    const b = graph.points.get(conn.to);
    if (!a || !b) continue;
    out.push(a.pos.x, a.pos.y, b.pos.x, b.pos.y);
  }
  return out;
}

// Cut TRANSITION only (no closure / slot edges, no noise chains) — drives the
// edge-fade preview to match the noise op.
function collectCutSegments(graph) {
  const out = [];
  for (const conn of graph.connections.values()) {
    if (conn.role !== "cut") continue;
    if (typeof conn.chainId === "string" && conn.chainId.startsWith("noise_")) continue;
    const a = graph.points.get(conn.from);
    const b = graph.points.get(conn.to);
    if (!a || !b) continue;
    out.push(a.pos.x, a.pos.y, b.pos.x, b.pos.y);
  }
  return out;
}

function isInsideRegion(segments, x, y) {
  let crossings = 0;
  for (let i = 0; i < segments.length; i += 4) {
    const ay = segments[i + 1];
    const by = segments[i + 3];
    if ((ay > y) === (by > y)) continue;
    const ax = segments[i];
    const bx = segments[i + 2];
    const xCross = ax + (y - ay) * (bx - ax) / (by - ay);
    if (xCross > x) crossings++;
  }
  return (crossings & 1) === 1;
}
