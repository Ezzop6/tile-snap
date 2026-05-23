import { REFERENCE_SLOT_SIZE } from "./buildSlotGraph.js";
import { withSlotTransform } from "./viewTransform.js";
import { arcControlPoint } from "../../core/pointGraph/render.js";

const DEFAULTS = {
  fill: "rgba(80, 160, 220, 0.85)",
};
const STROKE_DEFAULTS = {
  curveStroke:  "#ff5555",
  noiseStroke:  "#cc88ff",
  mergedStroke: "#ff9933",
  lineWidth:    2,
};

export function drawCutFill(ctx, graph, origin, viewSize, opts = {}) {
  if (!graph) return;
  const o = { ...DEFAULTS, ...opts };
  const path = buildCutPath(graph, { snap: !!opts.snap, viewSize });
  if (!path) return;
  withSlotTransform(ctx, origin, viewSize, () => {
    ctx.fillStyle = o.fill;
    ctx.fill(path, "evenodd");
  });
}

export function drawCutStroke(ctx, graph, origin, viewSize, opts = {}) {
  if (!graph) return;
  const o = { ...STROKE_DEFAULTS, ...opts };
  const snap = !!opts.snap;
  const loops = walkBoundaryLoops(graph);
  if (!loops.length) return;

  const paths = { curve: null, noise: null, merged: null };
  for (const loop of loops) {
    if (loop.length < 3) continue;
    const kind = classifyLoop(loop);
    if (!paths[kind]) paths[kind] = new Path2D();
    appendLoopToPath(paths[kind], graph, loop, snap, viewSize);
  }

  withSlotTransform(ctx, origin, viewSize, (scale) => {
    const lw = (opts.pxScale ?? 1) * o.lineWidth / scale;
    ctx.lineWidth = lw;
    ctx.lineJoin  = "round";
    ctx.lineCap   = "round";
    if (paths.curve)  { ctx.strokeStyle = o.curveStroke;  ctx.stroke(paths.curve); }
    if (paths.noise)  { ctx.strokeStyle = o.noiseStroke;  ctx.stroke(paths.noise); }
    if (paths.merged) { ctx.strokeStyle = o.mergedStroke; ctx.stroke(paths.merged); }
  });
}

// Returns Path2D in REFERENCE coords. Snap is applied in REF px units
// then carried through the ctx.scale at render time.
export function buildCutPath(graph, opts = {}) {
  if (!graph) return null;
  const loops = walkBoundaryLoops(graph);
  if (!loops.length) return null;
  const snap = !!opts.snap;
  const viewSize = opts.viewSize ?? REFERENCE_SLOT_SIZE;
  const path = new Path2D();
  for (const loop of loops) {
    if (loop.length < 3) continue;
    appendLoopToPath(path, graph, loop, snap, viewSize);
  }
  return path;
}

function classifyLoop(loop) {
  const id = loop[0]?.conn?.chainId;
  if (typeof id !== "string") return "curve";
  if (id.startsWith("noise_"))  return "noise";
  if (id.startsWith("merged_")) return "merged";
  return "curve";
}

function walkBoundaryLoops(graph) {
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
  if (!conns.length) return [];

  const used = new Uint8Array(conns.length);
  const loops = [];
  for (let i = 0; i < conns.length; i++) {
    if (used[i]) continue;
    const startId = conns[i].from;
    const loop = [];
    let cur = i;
    let from = startId;
    let safety = conns.length + 1;
    while (cur !== -1 && !used[cur] && safety-- > 0) {
      used[cur] = 1;
      const conn = conns[cur];
      const to = conn.from === from ? conn.to : conn.from;
      loop.push({ conn, from, to });
      // Prefer next connection on the same chainId — matches inflate's
      // buildBoundaryLoops so the polygon walked here matches the one that
      // was inflated. Without this, branching vertices (chain endpoints
      // with cut+closure) can route the loop differently in cutFill vs
      // inflate, producing inconsistent fill region.
      const incident = adj.get(to);
      let nextIdx = -1;
      if (incident) {
        const prevChainId = conn.chainId;
        for (const idx of incident) {
          if (used[idx]) continue;
          if (conns[idx].chainId && conns[idx].chainId === prevChainId) {
            nextIdx = idx;
            break;
          }
        }
        if (nextIdx === -1) {
          for (const idx of incident) {
            if (!used[idx]) { nextIdx = idx; break; }
          }
        }
      }
      cur = nextIdx;
      from = to;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
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

// Snap quantum is one VIEW pixel expressed in REF units, so the rendered
// edges land on view-pixel boundaries after ctx.scale.
function snapper(snap, viewSize) {
  if (!snap) return identity;
  const q = REFERENCE_SLOT_SIZE / viewSize;
  return (v) => Math.round(v / q) * q;
}

function appendLoopToPath(path, graph, loop, snap, viewSize) {
  const first = graph.points.get(loop[0].from);
  if (!first) return;
  const r = snapper(snap, viewSize);
  path.moveTo(r(first.pos.x), r(first.pos.y));
  for (const step of loop) {
    const a = graph.points.get(step.from);
    const b = graph.points.get(step.to);
    if (!a || !b) continue;
    const reversed = step.from !== step.conn.from;
    appendCurve(path, a.pos, b.pos, step.conn.curve, r, reversed);
  }
  path.closePath();
}

function identity(v) { return v; }

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
