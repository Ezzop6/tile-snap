import { state } from "../../controller/state.js";
import { GLOBAL_CURVE_PARAMS as P } from "../../core/curve_params.js";
import { REFERENCE_SLOT_SIZE } from "./buildSlotGraph.js";
import { withSlotTransform } from "./viewTransform.js";
import { arcControlPoint } from "../../core/pointGraph/render.js";

const EDGE_TOL = 0.5;

export function drawOutline(ctx, graph, origin, viewSize, opts = {}) {
  const ow = clamp01(Math.abs(state.globalCurve.outlineWidth ?? 0));
  if (ow <= 0) return;
  const pxScale = opts.pxScale ?? 1;
  // owPx = user-intended FINAL CSS px width.
  const owPx = ow * (P.outlineWidth?.effectScale ?? 10);
  if (owPx <= 0) return;

  const snap  = !!opts.snap;
  const color = state.globalCurve.outlineColor || "#000000";
  const path = buildOutlinePath(graph, snap, viewSize);
  if (!path) return;

  withSlotTransform(ctx, origin, viewSize, (scale) => {
    ctx.beginPath();
    ctx.rect(0, 0, REFERENCE_SLOT_SIZE, REFERENCE_SLOT_SIZE);
    ctx.clip();
    // source-over (default): outline is opaque and visible on both sides of
    // the cut regardless of whether each pool has a tile loaded. Previously
    // `multiply` was used for tinted blending, but it makes the stroke
    // disappear on transparent (= no tile) backgrounds.
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap  = "round";
    ctx.lineJoin = "round";
    // lineWidth is in logical units; under ctx.scale=scale + output downsample
    // pxScale, multiplying logical by pxScale/scale lands at the intended
    // absolute CSS px width.
    const widthScale = pxScale / scale;
    strokeOutlineGradient(ctx, path, owPx, color, widthScale);
  });
}

// Outline path = boundary of the cut region MINUS segments that lie on
// the slot edge (those would stroke onto the neighbour tile).
function buildOutlinePath(graph, snap, viewSize) {
  const useMerged = anyMergedCut(graph);
  const adj = new Map();
  const conns = [];
  for (const conn of graph.connections.values()) {
    if (useMerged) {
      if (conn.role !== "merged-cut") continue;
    } else {
      if (conn.role !== "cut" && conn.role !== "closure") continue;
    }
    const idx = conns.length;
    conns.push(conn);
    pushAdj(adj, conn.from, idx);
    pushAdj(adj, conn.to,   idx);
  }
  if (!conns.length) return null;

  const r = snapper(snap, viewSize);
  const used = new Uint8Array(conns.length);
  const path = new Path2D();
  let added = false;

  for (let i = 0; i < conns.length; i++) {
    if (used[i]) continue;
    let cur = i;
    let from = conns[i].from;
    let chained = false;
    let safety = conns.length + 1;
    while (cur !== -1 && !used[cur] && safety-- > 0) {
      used[cur] = 1;
      const conn = conns[cur];
      const to = conn.from === from ? conn.to : conn.from;
      const a = graph.points.get(from);
      const b = graph.points.get(to);
      if (a && b) {
        const onEdge = isEdgeSegment(a.pos, b.pos);
        if (onEdge) {
          chained = false;
        } else {
          if (!chained) { path.moveTo(r(a.pos.x), r(a.pos.y)); chained = true; }
          const reversed = from !== conn.from;
          appendCurve(path, a.pos, b.pos, conn.curve, r, reversed);
          added = true;
        }
      }
      const incident = adj.get(to);
      let next = -1;
      if (incident) {
        const prevChainId = conn.chainId;
        for (const idx of incident) {
          if (used[idx]) continue;
          if (conns[idx].chainId && conns[idx].chainId === prevChainId) {
            next = idx;
            break;
          }
        }
        if (next === -1) {
          for (const idx of incident) {
            if (!used[idx]) { next = idx; break; }
          }
        }
      }
      cur = next;
      from = to;
    }
  }
  return added ? path : null;
}

function isEdgeSegment(a, b) {
  return (Math.abs(a.x) < EDGE_TOL && Math.abs(b.x) < EDGE_TOL)
      || (Math.abs(a.x - REFERENCE_SLOT_SIZE) < EDGE_TOL && Math.abs(b.x - REFERENCE_SLOT_SIZE) < EDGE_TOL)
      || (Math.abs(a.y) < EDGE_TOL && Math.abs(b.y) < EDGE_TOL)
      || (Math.abs(a.y - REFERENCE_SLOT_SIZE) < EDGE_TOL && Math.abs(b.y - REFERENCE_SLOT_SIZE) < EDGE_TOL);
}

// Single proportional stroke — slider px value = visible outline width in
// CSS pixels. Browser handles AA on the edge. Centred on the cut path so
// half lands on each side.
function strokeOutlineGradient(ctx, path, owPx, color, widthScale) {
  if (owPx <= 0) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = owPx * widthScale;
  ctx.stroke(path);
}

function snapper(snap, viewSize) {
  if (!snap) return identity;
  const q = REFERENCE_SLOT_SIZE / viewSize;
  return (v) => Math.round(v / q) * q;
}

function anyMergedCut(graph) {
  for (const conn of graph.connections.values()) {
    if (conn.role === "merged-cut") return true;
  }
  return false;
}

function pushAdj(adj, pid, idx) {
  let a = adj.get(pid);
  if (!a) { a = []; adj.set(pid, a); }
  a.push(idx);
}

function appendCurve(path, a, b, curve, r, reversed = false) {
  switch (curve?.type) {
    case "arc": {
      const ctrl = arcControlPoint(a, b, curve, reversed);
      path.quadraticCurveTo(r(ctrl.x), r(ctrl.y), r(b.x), r(b.y));
      break;
    }
    case "bezier": {
      const h1x = a.x + curve.h1.x, h1y = a.y + curve.h1.y;
      const h2x = b.x + curve.h2.x, h2y = b.y + curve.h2.y;
      path.bezierCurveTo(r(h1x), r(h1y), r(h2x), r(h2y), r(b.x), r(b.y));
      break;
    }
    case "line":
    default:
      path.lineTo(r(b.x), r(b.y));
      break;
  }
}

function identity(v) { return v; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
