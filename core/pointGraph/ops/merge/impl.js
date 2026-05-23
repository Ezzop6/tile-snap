import { arcControlPoint as arcControl } from "../../render.js";
import { timed } from "../../../trace.js";

const paper = window.paper;
if (!paper) throw new Error("Paper.js not loaded — merge op requires it");
const scope = new paper.PaperScope();
scope.setup(new scope.Size(1, 1));

const HANDLE_EPS = 1e-6;

export function mergeImpl(graph, opts = {}) {
  const side = opts.side ?? "off";
  if (!graph || side === "off") return graph;
  // Sub-timings land in the trace overlay's "other" section (prefix `merge:`,
  // not `curve:`) so they don't double-count the `curve:merge <side>` total.
  const T = (step, fn) => timed(`merge:${side}/${step}`, fn);

  const noiseChains = collectNoiseChains(graph);
  if (!noiseChains.length) return graph;

  // Walk the CURRENT cut region: if a previous merge already produced
  // merged-cut chains (e.g. layer A finished before us), build on top of
  // those instead of restarting from the raw cut+closure. This is what makes
  // A→B cumulative ((R \ A) ∪ B) instead of (R ∪ A ∪ B).
  const curveLoops = T("walk", () => walkCurveLoops(graph));
  if (!curveLoops.length) return graph;

  scope.activate();
  const curvePath = T("curvePaper", () => loopsToPaper(curveLoops, graph));
  let noisePath   = T("noisePaper", () => chainsToPaper(noiseChains, graph));
  if (!curvePath || !noisePath) return graph;

  // Composition-level edge fade: pull noise back from the TRANSITION cut by
  // fadePx. A band is built around the cut curve (Clipper open-path offset) and
  // subtracted from the noise, so islands hugging the transition recede with a
  // clean offset edge while deep interior / tile middle / slot-edge margin stay
  // put. This lives here (not in the noise op) because the cut-mask geometry
  // only exists at merge time. fadePx = 0 (default) skips it.
  const fadePx = edgeFadePx(graph, opts.edgeFade);
  if (fadePx > 0) {
    const band = T("band", () => buildTransitionBand(graph, fadePx));
    if (band) {
      const reduced = T("fadeSub", () => noisePath.subtract(band));
      band.remove();
      noisePath.remove();
      noisePath = reduced;
    }
  }
  if (!noisePath) return graph;

  const merged = T("boolean", () => side === "patches"
    ? curvePath.unite(noisePath)
    : curvePath.subtract(noisePath));
  curvePath.remove();
  noisePath.remove();
  if (!merged) return graph;

  // Drop the previous merged-cut + the noise chains we just consumed so
  // a subsequent layer doesn't re-apply them and the result keeps only the
  // freshly merged geometry.
  T("addGraph", () => {
    removePreviousMerged(graph);
    removeConsumedNoiseChains(graph, noiseChains);
    addMergedToGraph(graph, merged);
  });
  merged.remove();
  return graph;
}

function collectNoiseChains(graph) {
  const byChain = new Map();
  for (const conn of graph.connections.values()) {
    if (conn.role !== "cut") continue;
    const id = conn.chainId;
    if (typeof id !== "string" || !id.startsWith("noise_")) continue;
    let arr = byChain.get(id);
    if (!arr) { arr = []; byChain.set(id, arr); }
    arr.push(conn);
  }
  return [...byChain.values()];
}

function walkCurveLoops(graph) {
  const useMerged = anyMergedCut(graph);
  const adj = new Map();
  const conns = [];
  for (const conn of graph.connections.values()) {
    if (useMerged) {
      if (conn.role !== "merged-cut") continue;
    } else {
      if (conn.role !== "cut" && conn.role !== "closure") continue;
      if (typeof conn.chainId === "string" && conn.chainId.startsWith("noise_")) continue;
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
    const loop = [];
    let cur = i;
    let from = conns[i].from;
    let safety = conns.length + 1;
    while (cur !== -1 && !used[cur] && safety-- > 0) {
      used[cur] = 1;
      const conn = conns[cur];
      const to = conn.from === from ? conn.to : conn.from;
      loop.push({ conn, from, to });
      const incident = adj.get(to);
      let next = -1;
      if (incident) {
        for (const idx of incident) {
          if (!used[idx]) { next = idx; break; }
        }
      }
      cur = next;
      from = to;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

function pushAdj(adj, pid, idx) {
  let a = adj.get(pid);
  if (!a) { a = []; adj.set(pid, a); }
  a.push(idx);
}

function anyMergedCut(graph) {
  for (const conn of graph.connections.values()) {
    if (conn.role === "merged-cut") return true;
  }
  return false;
}

function removePreviousMerged(graph) {
  const connIds = [];
  for (const conn of graph.connections.values()) {
    if (conn.role === "merged-cut") connIds.push(conn.id);
  }
  for (const id of connIds) graph.connections.delete(id);
  const pointIds = [];
  for (const [id, p] of graph.points.entries()) {
    if (p.cornerType === "merged-vertex") pointIds.push(id);
  }
  for (const id of pointIds) graph.points.delete(id);
}

function removeConsumedNoiseChains(graph, noiseChains) {
  const pointIds = new Set();
  for (const chain of noiseChains) {
    for (const conn of chain) {
      graph.connections.delete(conn.id);
      pointIds.add(conn.from);
      pointIds.add(conn.to);
    }
  }
  for (const id of pointIds) {
    const p = graph.points.get(id);
    if (p && p.cornerType === "noise-vertex") graph.points.delete(id);
  }
}

function loopsToPaper(loops, graph) {
  const paths = [];
  for (const loop of loops) {
    const p = loopToPaperPath(loop, graph);
    if (p) paths.push(p);
  }
  if (!paths.length) return null;
  if (paths.length === 1) return paths[0];
  return new paper.CompoundPath({ children: paths, insert: false });
}

function chainsToPaper(chains, graph) {
  const paths = [];
  for (const chain of chains) {
    const loop = chainToLoop(chain, graph);
    if (!loop) continue;
    const p = loopToPaperPath(loop, graph);
    if (p) paths.push(p);
  }
  if (!paths.length) return null;
  if (paths.length === 1) return paths[0];
  return new paper.CompoundPath({ children: paths, insert: false });
}

function chainToLoop(chain, graph) {
  if (!chain.length) return null;
  const adj = new Map();
  for (let i = 0; i < chain.length; i++) {
    pushAdj(adj, chain[i].from, i);
    pushAdj(adj, chain[i].to,   i);
  }
  const used = new Uint8Array(chain.length);
  const loop = [];
  let cur = 0;
  let from = chain[0].from;
  let safety = chain.length + 1;
  while (cur !== -1 && !used[cur] && safety-- > 0) {
    used[cur] = 1;
    const conn = chain[cur];
    const to = conn.from === from ? conn.to : conn.from;
    loop.push({ conn, from, to });
    const incident = adj.get(to);
    let next = -1;
    if (incident) {
      for (const idx of incident) {
        if (!used[idx]) { next = idx; break; }
      }
    }
    cur = next;
    from = to;
  }
  return loop.length >= 3 ? loop : null;
}

function loopToPaperPath(loop, graph) {
  const path = new paper.Path({ insert: false });
  const first = graph.points.get(loop[0].from);
  if (!first) return null;
  path.moveTo(first.pos.x, first.pos.y);
  for (const step of loop) {
    const a = graph.points.get(step.from);
    const b = graph.points.get(step.to);
    if (!a || !b) continue;
    const reversed = step.from !== step.conn.from;
    appendCurveToPaper(path, a.pos, b.pos, step.conn.curve, reversed);
  }
  path.closed = true;
  return path;
}

function appendCurveToPaper(path, a, b, curve, reversed = false) {
  switch (curve?.type) {
    case "arc": {
      const ctrl = arcControl(a, b, curve, reversed);
      path.quadraticCurveTo(new paper.Point(ctrl.x, ctrl.y), new paper.Point(b.x, b.y));
      break;
    }
    case "bezier": {
      path.cubicCurveTo(
        new paper.Point(a.x + curve.h1.x, a.y + curve.h1.y),
        new paper.Point(b.x + curve.h2.x, b.y + curve.h2.y),
        new paper.Point(b.x, b.y),
      );
      break;
    }
    case "line":
    default:
      path.lineTo(new paper.Point(b.x, b.y));
      break;
  }
}

const BAND_SCALE = 1000;
const BAND_FLATNESS = 2;

// fadePx for the edge fade = edgeFade fraction × one pattern-cell width
// (slotSize / cols), matching the old per-cell calibration.
function edgeFadePx(graph, edgeFade) {
  if (!(edgeFade > 0)) return 0;
  const cols = Math.max(1, graph.meta?.cols || 1);
  return edgeFade * ((graph.meta?.slotSize || 0) / cols);
}

// Closed band of width fadePx around the TRANSITION cut curve only (role "cut",
// excluding noise chains; closure / slot edges are role "closure" so already
// out). Built with Clipper open-path offset (round caps/joins). Returns a Paper
// path/CompoundPath in the active scope, or null when there's no transition
// (e.g. a fully-interior tile) or Clipper is unavailable.
function buildTransitionBand(graph, fadePx) {
  if (typeof ClipperLib === "undefined" || !(fadePx > 0)) return null;
  const co = new ClipperLib.ClipperOffset(2.0, 0.25);
  const any = timed("band/addPaths", () => {
    let added = false;
    for (const conn of graph.connections.values()) {
      if (conn.role !== "cut") continue;
      if (typeof conn.chainId === "string" && conn.chainId.startsWith("noise_")) continue;
      const a = graph.points.get(conn.from);
      const b = graph.points.get(conn.to);
      if (!a || !b) continue;
      let pts;
      if (!conn.curve || !conn.curve.type || conn.curve.type === "line") {
        pts = [
          { X: Math.round(a.pos.x * BAND_SCALE), Y: Math.round(a.pos.y * BAND_SCALE) },
          { X: Math.round(b.pos.x * BAND_SCALE), Y: Math.round(b.pos.y * BAND_SCALE) },
        ];
      } else {
        // Flatten curved connections so the band follows the real cut shape.
        const seg = new paper.Path({ insert: false });
        seg.moveTo(a.pos.x, a.pos.y);
        appendCurveToPaper(seg, a.pos, b.pos, conn.curve, false);
        seg.flatten(BAND_FLATNESS);
        pts = seg.segments.map((s) => ({
          X: Math.round(s.point.x * BAND_SCALE),
          Y: Math.round(s.point.y * BAND_SCALE),
        }));
        seg.remove();
      }
      if (pts.length < 2) continue;
      co.AddPath(pts, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound);
      added = true;
    }
    return added;
  });
  if (!any) return null;

  const solution = new ClipperLib.Paths();
  timed("band/execute", () => co.Execute(solution, fadePx * BAND_SCALE));
  if (!solution || !solution.length) return null;

  const paths = timed("band/toPaper", () => {
    const out = [];
    for (const poly of solution) {
      if (!poly || poly.length < 3) continue;
      const p = new paper.Path({ insert: false });
      p.moveTo(poly[0].X / BAND_SCALE, poly[0].Y / BAND_SCALE);
      for (let i = 1; i < poly.length; i++) p.lineTo(poly[i].X / BAND_SCALE, poly[i].Y / BAND_SCALE);
      p.closed = true;
      out.push(p);
    }
    return out;
  });
  if (!paths.length) return null;
  return paths.length === 1 ? paths[0] : new paper.CompoundPath({ children: paths, insert: false });
}

function addMergedToGraph(graph, mergedPaper) {
  const subPaths = mergedPaper.children?.length ? mergedPaper.children : [mergedPaper];
  let loopIdx = 0;
  for (const sub of subPaths) {
    if (!sub.segments || sub.segments.length < 3) continue;
    addPaperLoopToGraph(graph, sub, loopIdx++);
  }
}

function addPaperLoopToGraph(graph, path, loopIdx) {
  const segs = path.segments;
  const N = segs.length;
  const interiorSide = path.clockwise ? "right" : "left";
  const chainId = `merged_${loopIdx}`;
  const pointIds = [];

  for (let i = 0; i < N; i++) {
    const s = segs[i];
    const id = `${chainId}__v${i}`;
    graph.points.set(id, {
      id,
      basePos:       { x: s.point.x, y: s.point.y },
      pos:           { x: s.point.x, y: s.point.y },
      lock:          { x: false, y: false, rotation: false },
      cornerType:    "merged-vertex",
      outwardNormal: null,
      miterScale:    null,
      cutDegree:     2,
      chainEndpoint: false,
    });
    pointIds.push(id);
  }

  for (let i = 0; i < N; i++) {
    const a = segs[i];
    const b = segs[(i + 1) % N];
    const from = pointIds[i];
    const to   = pointIds[(i + 1) % N];
    const id   = `${chainId}__e${i}`;
    graph.connections.set(id, {
      id, from, to,
      kind:         "inner",
      role:         "merged-cut",
      curve:        edgeCurveFromHandles(a, b),
      interiorSide,
      chainId,
    });
  }
}

function edgeCurveFromHandles(segA, segB) {
  const h1 = segA.handleOut;
  const h2 = segB.handleIn;
  const flat = Math.abs(h1.x) < HANDLE_EPS && Math.abs(h1.y) < HANDLE_EPS
            && Math.abs(h2.x) < HANDLE_EPS && Math.abs(h2.y) < HANDLE_EPS;
  if (flat) return { type: "line" };
  return {
    type: "bezier",
    h1: { x: h1.x, y: h1.y },
    h2: { x: h2.x, y: h2.y },
  };
}
