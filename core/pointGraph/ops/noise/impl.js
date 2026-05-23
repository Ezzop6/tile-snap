import { buildNoiseMask, applyEdgeFade } from "../../../noise.js";

const MIN_LOOP_VERTICES = 3;

// Last step of the pipeline: trace noise islands into new closed cut chains.
// Constrained by the CURRENT cut region — holes only inside filled, patches
// only inside empty. Adds nothing else to the graph (no internal/closure
// connections, no boundary points).
export function noiseImpl(graph, opts = {}) {
  const params = opts.params;
  if (!graph || !params || params.side === "off") return graph;

  const seed     = opts.seed | 0;
  const slotCol  = opts.slotCol ?? 0;
  const slotRow  = opts.slotRow ?? 0;
  const origin   = graph.meta.origin;
  const size     = graph.meta.slotSize;

  const mask = buildNoiseMask(
    slotCol, slotRow, origin,
    { w: size, h: size },
    params,
    seed,
  );

  // Boundary segments drive both the cut-region pre-mask and the edge fade —
  // collect once and share (walking every connection twice was wasteful).
  const segments = collectBoundarySegments(graph);

  const wantInside = params.side === "holes";
  preMaskByCutRegion(mask, segments, wantInside);

  // Edge-aware fade: noise weakens near the cut/closure boundary so noise
  // islands sit deeper in the region and the cut edge reads clean. Default
  // (params.edgeFade = 0) is a no-op so existing projects don't shift.
  if (params.edgeFade > 0) {
    const cols = Math.max(1, graph.meta.cols || 1);
    const fadePx = params.edgeFade * (size / cols);
    applyEdgeFade(mask, segments, fadePx);
  }

  const loops = traceLoops(mask);
  if (!loops.length) return graph;

  // Marching squares directs edges so the island is on the LEFT.
  //   holes   → island = empty, walking with empty on left → filled on RIGHT
  //   patches → island = filled, walking with filled on left → filled on LEFT
  const interiorSide = wantInside ? "right" : "left";

  for (let i = 0; i < loops.length; i++) {
    addLoopAsChain(graph, loops[i], `noise_${slotCol}_${slotRow}_${i}`, interiorSide);
  }
  return graph;
}

function preMaskByCutRegion(mask, segments, wantInside) {
  const { cols, rows, data, cell, origin } = mask;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (!data[idx]) continue;
      const px = origin.x + c * cell + cell * 0.5;
      const py = origin.y + r * cell + cell * 0.5;
      if (isInsideRegion(segments, px, py) !== wantInside) data[idx] = 0;
    }
  }
}

function collectBoundarySegments(graph) {
  // If a previous noise layer already produced merged-cut, mask against that
  // post-merge region so this layer sees the actual current shape (e.g. layer
  // B's patches must not appear inside holes layer A just carved).
  let useMerged = false;
  for (const conn of graph.connections.values()) {
    if (conn.role === "merged-cut") { useMerged = true; break; }
  }
  const out = [];
  for (const conn of graph.connections.values()) {
    if (useMerged) {
      if (conn.role !== "merged-cut") continue;
    } else {
      if (conn.role !== "cut" && conn.role !== "closure") continue;
    }
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

// Marching squares — case table directs edges so island (1) is on the LEFT.
// Saddle cases (5, 10) emit two disjoint edges (= two separate loops).
function traceLoops(mask) {
  const { cols, rows, data, cell, origin } = mask;
  const edges = [];

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const tl = data[r * cols + c];
      const tr = data[r * cols + c + 1];
      const bl = data[(r + 1) * cols + c];
      const br = data[(r + 1) * cols + c + 1];
      const code = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (code === 0 || code === 15) continue;
      const x0 = origin.x + c * cell;
      const y0 = origin.y + r * cell;
      const xm = x0 + cell * 0.5;
      const ym = y0 + cell * 0.5;
      const xr = x0 + cell;
      const yb = y0 + cell;
      switch (code) {
        case 1:  edges.push([x0, ym, xm, yb]); break;
        case 2:  edges.push([xm, yb, xr, ym]); break;
        case 3:  edges.push([x0, ym, xr, ym]); break;
        case 4:  edges.push([xr, ym, xm, y0]); break;
        case 5:
          edges.push([x0, ym, xm, y0]);
          edges.push([xr, ym, xm, yb]);
          break;
        case 6:  edges.push([xm, yb, xm, y0]); break;
        case 7:  edges.push([x0, ym, xm, y0]); break;
        case 8:  edges.push([xm, y0, x0, ym]); break;
        case 9:  edges.push([xm, y0, xm, yb]); break;
        case 10:
          edges.push([xm, y0, xr, ym]);
          edges.push([xm, yb, x0, ym]);
          break;
        case 11: edges.push([xm, y0, xr, ym]); break;
        case 12: edges.push([xr, ym, x0, ym]); break;
        case 13: edges.push([xr, ym, xm, yb]); break;
        case 14: edges.push([xm, yb, x0, ym]); break;
      }
    }
  }
  if (!edges.length) return [];

  // Endpoints sit exactly on the half-cell grid (x0/xm/xr, y0/ym/yb), so map
  // each to integer grid indices for an allocation-free numeric Map key —
  // replaces per-endpoint toFixed + string concat. Identical arithmetic on
  // shared cell edges still collides exactly, no FP tolerance needed.
  const half   = cell * 0.5;
  const stride = 2 * cols + 2;
  const key = (x, y) =>
    Math.round((y - origin.y) / half) * stride + Math.round((x - origin.x) / half);

  const startMap = new Map();
  for (let i = 0; i < edges.length; i++) {
    startMap.set(key(edges[i][0], edges[i][1]), i);
  }

  const used = new Uint8Array(edges.length);
  const loops = [];
  for (let i = 0; i < edges.length; i++) {
    if (used[i]) continue;
    const loop = [];
    let cur = i;
    let safety = edges.length + 1;
    while (cur !== -1 && !used[cur] && safety-- > 0) {
      used[cur] = 1;
      loop.push([edges[cur][0], edges[cur][1]]);
      const nextIdx = startMap.get(key(edges[cur][2], edges[cur][3]));
      cur = nextIdx === undefined ? -1 : nextIdx;
    }
    if (loop.length >= MIN_LOOP_VERTICES) loops.push(loop);
  }
  return loops;
}

function addLoopAsChain(graph, loop, chainId, interiorSide) {
  const ids = [];
  for (let i = 0; i < loop.length; i++) {
    const [x, y] = loop[i];
    const id = `${chainId}__v${i}`;
    graph.points.set(id, {
      id,
      basePos:       { x, y },
      pos:           { x, y },
      lock:          { x: false, y: false, rotation: false },
      cornerType:    "noise-vertex",
      outwardNormal: null,
      miterScale:    null,
      cutDegree:     2,
      chainEndpoint: false,
    });
    ids.push(id);
  }
  for (let i = 0; i < ids.length; i++) {
    const from = ids[i];
    const to   = ids[(i + 1) % ids.length];
    const id   = `${chainId}__e${i}`;
    graph.connections.set(id, {
      id, from, to,
      kind:         "inner",
      role:         "cut",
      curve:        { type: "line" },
      interiorSide,
      chainId,
    });
  }
}
