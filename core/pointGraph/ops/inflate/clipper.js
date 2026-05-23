// Polygon-offset based inflate using clipper-lib (global window.ClipperLib).

import { cellOn } from "../../../cellValue.js";

const SCALE = 1000;
const MITER_LIMIT = 10.0;
const ARC_TOLERANCE = 0.25;

export function inflateClipper(graph, distance) {
  if (!graph || !distance) return graph;
  if (typeof ClipperLib === "undefined") {
    if (typeof console !== "undefined") console.warn("[inflate] ClipperLib not loaded — skipping");
    return graph;
  }

  graph._inflateDebug = { distance, scale: SCALE, miterLimit: MITER_LIMIT, loops: [] };

  const loops = buildBoundaryLoops(graph);
  for (const loop of loops) offsetLoop(graph, loop, distance);
  applyLocks(graph);
  clampToSlotBounds(graph);
  return graph;
}

function applyChainEndpointMotionForLoop(graph, ids, distance) {
  for (const id of ids) {
    const p = graph.points.get(id);
    if (!p || !p.chainEndpoint || !p.outwardNormal) continue;
    const lx = !!p.lock?.x;
    const ly = !!p.lock?.y;
    if (lx && ly) continue;
    const scale = p.miterScale ?? 1;
    if (!lx) p.pos.x = p.basePos.x + distance * p.outwardNormal.x * scale;
    if (!ly) p.pos.y = p.basePos.y + distance * p.outwardNormal.y * scale;
  }
}

function clampToSlotBounds(graph) {
  const minX = graph.meta.origin.x;
  const maxX = minX + graph.meta.slotSize;
  const minY = graph.meta.origin.y;
  const maxY = minY + graph.meta.slotSize;
  for (const p of graph.points.values()) {
    if (!p.lock?.x) p.pos.x = Math.min(maxX, Math.max(minX, p.pos.x));
    if (!p.lock?.y) p.pos.y = Math.min(maxY, Math.max(minY, p.pos.y));
  }
}

function offsetLoop(graph, ordered, distance) {
  const pointIds = [ordered[0].fromPid];
  for (const step of ordered) {
    const next = step.conn.from === step.fromPid ? step.conn.to : step.conn.from;
    pointIds.push(next);
  }
  const isClosed = pointIds.length > 1 && pointIds[0] === pointIds[pointIds.length - 1];
  const uniqueIds = isClosed ? pointIds.slice(0, -1) : pointIds;
  if (uniqueIds.length < 3) return;

  const allVerts = uniqueIds.map((pid) => {
    const p = graph.points.get(pid);
    return p ? { id: pid, x: p.basePos.x, y: p.basePos.y } : null;
  });
  if (allVerts.some((v) => !v)) return;

  const N = allVerts.length;
  const polygon = allVerts.map((v) => ({
    X: Math.round(v.x * SCALE),
    Y: Math.round(v.y * SCALE),
  }));

  const encloseFilled = polygonEnclosesFilled(graph, polygon);
  const sign = encloseFilled ? 1 : -1;
  const delta = sign * distance * SCALE;
  const polygonAreaScaled = ClipperLib.Clipper.Area(polygon);
  const polygonIsCW = polygonAreaScaled > 0;

  // Deflate must keep one output vertex per "corner unit" (each cell-corner
  // ID, with sva/svb pair counted as one — that pair is allowed to merge as
  // the corner un-rounds). Otherwise multiple input cuts would snap to the
  // same output spot = visible collapse. Inflate has no count constraint.
  const cornerUnitCount = countCornerUnits(allVerts);
  const requiredVerts = distance < 0 ? Math.max(3, cornerUnitCount) : 3;
  let actualDelta = delta;
  let offsetPaths = runOffset(polygon, actualDelta);
  let elasticClamp = false;
  if (!isAcceptablePolygon(offsetPaths, requiredVerts)) {
    elasticClamp = true;
    let lo = 0;
    let hi = Math.abs(delta);
    let bestMid = 0;
    let bestPaths = null;
    for (let iter = 0; iter < 14; iter++) {
      const mid = (lo + hi) / 2;
      const test = Math.sign(delta) * mid;
      const testPaths = runOffset(polygon, test);
      if (isAcceptablePolygon(testPaths, requiredVerts)) {
        lo = mid;
        bestMid = mid;
        bestPaths = testPaths;
      } else {
        hi = mid;
      }
    }
    if (bestPaths) {
      actualDelta = Math.sign(delta) * bestMid * 0.95;
      const marginPaths = runOffset(polygon, actualDelta);
      offsetPaths = isAcceptablePolygon(marginPaths, requiredVerts) ? marginPaths : bestPaths;
      if (offsetPaths === bestPaths) actualDelta = Math.sign(delta) * bestMid;
    }
  }
  const actualDistance = (actualDelta / SCALE) * sign;

  let cx = 0, cy = 0;
  for (const v of allVerts) { cx += v.x; cy += v.y; }
  cx /= N;
  cy /= N;

  if (graph._inflateDebug) {
    graph._inflateDebug.loops.push({
      distance,
      delta,
      actualDelta,
      actualDistance,
      elasticClamp,
      encloseFilled,
      polygonIsCW,
      inputCount: N,
      outputPathCount: offsetPaths.length,
      outputCount: offsetPaths[0]?.length ?? 0,
      polygonAreaScaled,
      inputIds: uniqueIds.slice(),
      inputPolygon: polygon.map((v) => ({ x: +(v.X / SCALE).toFixed(3), y: +(v.Y / SCALE).toFixed(3) })),
      outputPolygons: offsetPaths.map((p) =>
        p.map((v) => ({ x: +(v.X / SCALE).toFixed(3), y: +(v.Y / SCALE).toFixed(3) })),
      ),
      centroid: { x: +cx.toFixed(3), y: +cy.toFixed(3) },
    });
  }

  if (!offsetPaths || offsetPaths.length === 0) {
    for (const v of allVerts) {
      const p = graph.points.get(v.id);
      if (!p) continue;
      p.pos.x = cx;
      p.pos.y = cy;
    }
    if (graph._inflateDebug) {
      const dbg = graph._inflateDebug.loops[graph._inflateDebug.loops.length - 1];
      dbg.collapsed = true;
    }
    return;
  }

  // Per-vertex bisector gives the ideal miter position for each input. Snap
  // it to the nearest point on Clipper's output polygon — this absorbs the
  // chamfer-reversal at concave corners during inflate (where the chamfer
  // edge would offset back through itself, so Clipper consolidates both
  // chamfer vertices into a single sharp corner).
  let bestPath = offsetPaths[0];
  let bestArea = Math.abs(ClipperLib.Clipper.Area(bestPath));
  for (let k = 1; k < offsetPaths.length; k++) {
    const a = Math.abs(ClipperLib.Clipper.Area(offsetPaths[k]));
    if (a > bestArea) { bestPath = offsetPaths[k]; bestArea = a; }
  }
  const outVerts = bestPath.map((v) => ({ x: v.X / SCALE, y: v.Y / SCALE }));

  const absDist   = Math.abs(distance);
  const absActual = Math.abs(actualDistance);
  const pull = distance < 0 && absDist > absActual && absDist > 1e-9
    ? Math.min(1, (absDist - absActual) / absDist)
    : 0;

  for (let i = 0; i < N; i++) {
    const v = allVerts[i];
    const p = graph.points.get(v.id);
    if (!p) continue;
    let tx, ty;
    // Per-vertex bisector for ALL verts (Clipper miter join). Preserves
    // every polygon angle. Snap to Clipper output handles concave-chamfer
    // self-intersection consolidation.
    {
      const prev = allVerts[(i - 1 + N) % N];
      const next = allVerts[(i + 1) % N];
      const bis = computeBisector(prev, v, next, polygonIsCW);
      const ideal = {
        x: v.x + actualDistance * sign * bis.nx * bis.scale,
        y: v.y + actualDistance * sign * bis.ny * bis.scale,
      };
      const snapped = nearestPointOnPolygon(outVerts, ideal);
      tx = snapped.x;
      ty = snapped.y;
    }
    if (pull > 0 && !p.chainEndpoint) {
      tx += (cx - tx) * pull;
      ty += (cy - ty) * pull;
    }
    p.pos.x = tx;
    p.pos.y = ty;
  }

  // Chain endpoints use original distance for cross-tile match.
  applyChainEndpointMotionForLoop(graph, uniqueIds, distance);

  if (graph._inflateDebug) {
    const dbg = graph._inflateDebug.loops[graph._inflateDebug.loops.length - 1];
    dbg.centroidPull = pull;
  }
}

function scaleSoftVertAlongLeg(leg, actualDistance, sign) {
  // Each leg endpoint moves outward by inflate × outwardNormal × miterScale.
  // soft vert stays at the same FRACTION along the inflated leg.
  const cornerNX = leg.neighborNormal?.x ?? 0;
  const cornerNY = leg.neighborNormal?.y ?? 0;
  const cornerScale = leg.neighborScale ?? 0;
  // Parent corner motion was applied to leg.cornerBase via its own bisector.
  // But here we don't have parent corner's bisector directly — soft vert IS
  // the parent corner's surrogate. Caller passes leg with .cornerBase and
  // expects us to look up the soft vert's own outwardNormal/miterScale.
  // We do that lazily: compute cornerInflate via the inherited normal stored
  // on the soft vert (assumed). For merged path, each leg already has its
  // own corner data we can use.
  const parentNX = leg.cornerNormal?.x ?? 0;
  const parentNY = leg.cornerNormal?.y ?? 0;
  const parentScale = leg.cornerScale ?? 0;
  const cb = leg.cornerBase;
  const nb = leg.neighborBase;
  const newCornerX = cb.x + actualDistance * sign * parentNX * parentScale;
  const newCornerY = cb.y + actualDistance * sign * parentNY * parentScale;
  const newNeighborX = nb.x + actualDistance * sign * cornerNX * cornerScale;
  const newNeighborY = nb.y + actualDistance * sign * cornerNY * cornerScale;
  return {
    x: newCornerX + leg.fraction * (newNeighborX - newCornerX),
    y: newCornerY + leg.fraction * (newNeighborY - newCornerY),
  };
}

function computeBisector(prev, curr, next, polygonIsCW) {
  const ePrev = { x: curr.x - prev.x, y: curr.y - prev.y };
  const eNext = { x: next.x - curr.x, y: next.y - curr.y };
  const lenPrev = Math.hypot(ePrev.x, ePrev.y);
  const lenNext = Math.hypot(eNext.x, eNext.y);
  if (lenPrev < 1e-9 || lenNext < 1e-9) return { nx: 0, ny: 0, scale: 0 };
  ePrev.x /= lenPrev; ePrev.y /= lenPrev;
  eNext.x /= lenNext; eNext.y /= lenNext;
  // CW screen polygon: outward = (ey, -ex). Flip for CCW.
  const s = polygonIsCW ? 1 : -1;
  const nPrev = { x: s * ePrev.y, y: -s * ePrev.x };
  const nNext = { x: s * eNext.y, y: -s * eNext.x };
  let bx = (nPrev.x + nNext.x) * 0.5;
  let by = (nPrev.y + nNext.y) * 0.5;
  const bLen = Math.hypot(bx, by);
  if (bLen < 1e-9) return { nx: nPrev.x, ny: nPrev.y, scale: 1 };
  return { nx: bx / bLen, ny: by / bLen, scale: 1 / bLen };
}

function runOffset(polygon, delta) {
  const co = new ClipperLib.ClipperOffset(MITER_LIMIT, ARC_TOLERANCE);
  co.AddPath(polygon, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
  const out = new ClipperLib.Paths();
  co.Execute(out, delta);
  return out;
}

function isAcceptablePolygon(paths, requiredVerts) {
  return paths && paths.length === 1 && paths[0].length >= Math.max(3, requiredVerts);
}

function countCornerUnits(allVerts) {
  // Count base IDs only for verts that are NOT colinear with their polygon
  // neighbours (at basePos — organic-perturbed `pos` would otherwise turn
  // every midpoint into a "corner" and yank the clamp tighter with organic).
  // Cell-edge midpoints on straight stretches don't represent topological
  // corners; including them produces overly aggressive elastic clamps.
  const n = allVerts.length;
  const EPS = 1e-3;
  const bases = new Set();
  for (let i = 0; i < n; i++) {
    const prev = allVerts[(i - 1 + n) % n];
    const curr = allVerts[i];
    const next = allVerts[(i + 1) % n];
    const ux = curr.x - prev.x, uy = curr.y - prev.y;
    const vx = next.x - curr.x, vy = next.y - curr.y;
    const lenU = Math.hypot(ux, uy);
    const lenV = Math.hypot(vx, vy);
    if (lenU < 1e-9 || lenV < 1e-9) continue;
    const cross = (ux * vy - uy * vx) / (lenU * lenV);
    if (Math.abs(cross) <= EPS) continue;
    const base = typeof curr.id === "string" ? curr.id.replace(/__sv[ab]$/, "") : curr.id;
    bases.add(base);
  }
  return bases.size;
}

function nearestPointOnPolygon(verts, target) {
  let bx = verts[0].x, by = verts[0].y;
  let bestD2 = Infinity;
  const M = verts.length;
  for (let j = 0; j < M; j++) {
    const a = verts[j];
    const b = verts[(j + 1) % M];
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const len2 = sx * sx + sy * sy;
    let t = len2 > 1e-9 ? ((target.x - a.x) * sx + (target.y - a.y) * sy) / len2 : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const px = a.x + sx * t;
    const py = a.y + sy * t;
    const d2 = (target.x - px) * (target.x - px) + (target.y - py) * (target.y - py);
    if (d2 < bestD2) { bestD2 = d2; bx = px; by = py; }
  }
  return { x: bx, y: by };
}

function polygonEnclosesFilled(graph, polygon) {
  // Centroid-only sampling lands in concave-corner empty cells for L / plus
  // shapes and flips the sign. Sample every cell instead.
  const pattern = graph.meta.pattern;
  const cell = graph.meta.cell;
  if (!pattern || !cell) return true;

  let filledIn = 0, emptyIn = 0;
  for (let r = 0; r < pattern.length; r++) {
    for (let c = 0; c < pattern[r].length; c++) {
      const filled = cellOn(pattern[r][c]);
      const wx = graph.meta.origin.x + (c + 0.5) * cell.w;
      const wy = graph.meta.origin.y + (r + 0.5) * cell.h;
      if (pointInPolygon(polygon, wx * SCALE, wy * SCALE)) {
        if (filled) filledIn++;
        else        emptyIn++;
      }
    }
  }
  return filledIn >= emptyIn;
}

function pointInPolygon(polygon, x, y) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].X, yi = polygon[i].Y;
    const xj = polygon[j].X, yj = polygon[j].Y;
    if (((yi > y) !== (yj > y)) &&
        (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function applyLocks(graph) {
  for (const p of graph.points.values()) {
    if (p.lock?.x) p.pos.x = p.basePos.x;
    if (p.lock?.y) p.pos.y = p.basePos.y;
  }
}

function buildBoundaryLoops(graph) {
  const adj = new Map();
  const all = [];
  for (const conn of graph.connections.values()) {
    if (conn.role !== "cut" && conn.role !== "closure") continue;
    all.push(conn);
    for (const pid of [conn.from, conn.to]) {
      let arr = adj.get(pid);
      if (!arr) { arr = []; adj.set(pid, arr); }
      arr.push(conn);
    }
  }
  const visited = new Set();
  const loops = [];
  for (const start of all) {
    if (visited.has(start.id)) continue;
    const loop = [];
    let conn = start;
    let cur = conn.from;
    while (conn && !visited.has(conn.id)) {
      visited.add(conn.id);
      const next = conn.from === cur ? conn.to : conn.from;
      loop.push({ conn, fromPid: cur });
      cur = next;
      const candidates = (adj.get(cur) || []).filter((c) => !visited.has(c.id));
      conn = pickNext(candidates, loop[loop.length - 1].conn);
    }
    if (loop.length >= 2) loops.push(loop);
  }
  return loops;
}

function pickNext(candidates, prev) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const sameChain = candidates.find((c) => c.chainId && c.chainId === prev.chainId);
  if (sameChain) return sameChain;
  return candidates[0];
}
