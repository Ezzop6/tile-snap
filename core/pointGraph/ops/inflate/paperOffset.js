// Polyline offset via paper.js + paperjs-offset (PaperOffset).
//
// Replaces the Clipper-based polygon offset. PaperOffset works directly
// on paper.Path with smooth handles, so no manual densify/rubber-band
// passes are needed — the library produces arc-tessellated round corners
// (or miter-joined sharp corners) natively.
//
// Graph point write-back model: each non-locked graph point is moved to
// its nearest position on the OFFSET path (arc-length-aligned anchor for
// stable rotation across tiles). Locked points snap to basePos per axis
// (= cross-tile match preserved). Round vs miter join selected via
// opts.softness — > 0 → round (anchor = arc center of radius |distance|
// shoulder); = 0 → miter (sharp angle).
//
// Resulting paper.Path objects are STORED on the graph as
// `graph._inflatedPaths` so renderers can consume the smooth offset
// curve directly instead of walking the graph polygon vertices (which
// only carry the input anchor positions, not the arc tessellation).

const paper = window.paper;
if (!paper) throw new Error("paper.js not loaded — inflate (paperOffset) requires it");
if (typeof window.PaperOffset === "undefined") {
  throw new Error("paperjs-offset not loaded — inflate (paperOffset) requires it");
}
const PaperOffset = window.PaperOffset;

const scope = new paper.PaperScope();
scope.setup(new scope.Size(1, 1));

const MITER_LIMIT = 10.0;

export function inflatePaper(graph, distance, opts = {}) {
  if (!graph || !distance) return graph;

  const softness = opts.softness ?? 0;
  // Single binary toggle today: softness > 0 → round join (arc shoulders
  // around outer-convex anchors), softness = 0 → miter (sharp). Future
  // refinement: softness as a continuous radius scale + arcness shaping
  // the arc into ellipsoid / partial.
  const join = softness > 0 ? "round" : "miter";

  graph._inflateDebug = { distance, join, softness, loops: [] };
  // Reset cached offset paths — every inflate run produces fresh paths.
  // Downstream ops (wave / noise / merge) that mutate the graph polygon
  // must null this out so the renderer falls back to the graph walk.
  graph._inflatedPaths = [];

  const loops = buildBoundaryLoops(graph);
  for (const loop of loops) offsetLoop(graph, loop, distance, join);
  applyLocks(graph);
  clampToSlotBounds(graph);
  return graph;
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

function offsetLoop(graph, ordered, distance, join = "miter") {
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

  scope.activate();
  const path = new paper.Path({ insert: false, closed: true });
  for (const v of allVerts) path.add(new paper.Point(v.x, v.y));

  // PaperOffset.offset returns a new path (CompoundPath when offset
  // splits). Sign convention: positive delta = outward (= grows filled
  // region); for our model `distance > 0` should grow the filled side,
  // which is determined by polygon CW/CCW orientation. paper.js
  // canonicalises orientation so positive offset = outward of CW.
  const encloseFilled = polygonEnclosesFilled(graph, allVerts);
  const sign = encloseFilled ? 1 : -1;
  const offsetDelta = sign * distance;

  // Elastic clamp: bisect-search the max |offsetDelta| where paper offset
  // still returns a single non-self-intersecting polygon whose area is
  // at least MIN_AREA_FRACTION of the input polygon. Without this, paper
  // offset at extreme deflate splits into multiple pieces or collapses,
  // and arc-length write-back jumps points across the topology change
  // (= visible "kick" / "snap" when slider crosses threshold). With
  // clamp, the slider smoothly shrinks the polygon up to the safe max,
  // then plateaus — no abrupt jumps.
  const inputArea = Math.abs(signedPolygonArea(allVerts));
  const MIN_AREA_FRACTION = 0.04;  // polygon may shrink to 4% before clamp engages
  const minSafeArea = inputArea * MIN_AREA_FRACTION;

  const tryOffset = (delta) => {
    try {
      return PaperOffset.offset(path, delta, {
        join, cap: "butt", limit: MITER_LIMIT, insert: false,
      });
    } catch (_e) {
      return null;
    }
  };

  let offsetResult = tryOffset(offsetDelta);
  let actualDelta = offsetDelta;
  let elasticClamped = false;

  if (!isAcceptablePaperResult(offsetResult, minSafeArea)) {
    elasticClamped = true;
    // Discard the over-aggressive try result.
    if (offsetResult?.remove) offsetResult.remove();
    let lo = 0;
    let hi = Math.abs(offsetDelta);
    let bestAbs = 0;
    let bestResult = null;
    for (let iter = 0; iter < 14; iter++) {
      const midAbs = (lo + hi) / 2;
      const test = Math.sign(offsetDelta) * midAbs;
      const r = tryOffset(test);
      if (isAcceptablePaperResult(r, minSafeArea)) {
        if (bestResult?.remove) bestResult.remove();
        bestResult = r;
        bestAbs = midAbs;
        lo = midAbs;
      } else {
        if (r?.remove) r.remove();
        hi = midAbs;
      }
    }
    if (!bestResult) {
      path.remove();
      collapseToCentroid(graph, allVerts);
      return;
    }
    // 5% safety margin below the found max (so we're solidly inside the
    // valid range, not right at the threshold where rounding could flip).
    const safeAbs = bestAbs * 0.95;
    const safe = Math.sign(offsetDelta) * safeAbs;
    const safeResult = tryOffset(safe);
    if (isAcceptablePaperResult(safeResult, minSafeArea)) {
      bestResult.remove();
      offsetResult = safeResult;
      actualDelta = safe;
    } else {
      if (safeResult?.remove) safeResult.remove();
      offsetResult = bestResult;
      actualDelta = Math.sign(offsetDelta) * bestAbs;
    }
  }

  path.remove();

  const subPaths = offsetResult.children?.length ? offsetResult.children : [offsetResult];
  const pickedPath = pickLargestPath(subPaths);
  if (!pickedPath) {
    if (offsetResult.remove) offsetResult.remove();
    collapseToCentroid(graph, allVerts);
    return;
  }

  // distance the formula motion will see (clamped if elastic kicked in).
  // Unlocked points use arc-length placement on pickedPath; locked points
  // with outwardNormal still use raw distance via applyFormulaMotion
  // (= cross-tile determinism, locks snap regardless).
  const effectiveDistance = elasticClamped ? actualDelta * sign : distance;

  if (graph._inflateDebug) {
    graph._inflateDebug.loops.push({
      distance,
      sign,
      actualDelta,
      effectiveDistance,
      elasticClamped,
      inputCount: N,
      outputSegmentCount: pickedPath.segments.length,
      inputPolygon: allVerts.map((v) => ({ x: +v.x.toFixed(3), y: +v.y.toFixed(3) })),
      outputPolygon: pickedPath.segments.map((s) => ({
        x: +s.point.x.toFixed(3), y: +s.point.y.toFixed(3),
      })),
    });
  }

  // Stash the offset path's SVG data so renderers can consume the smooth
  // (round-jointed) curve directly without walking the graph polygon
  // (which only carries input anchor positions, not arc-tessellated samples).
  if (graph._inflatedPaths) {
    graph._inflatedPaths.push({
      data:     pickedPath.pathData,
      closed:   pickedPath.closed,
      clockwise: pickedPath.clockwise,
    });
  }

  // For each input graph point, find its corresponding position on the
  // offset path. Two strategies, split by LOCK (not by outwardNormal):
  //  - LOCKED points (chain endpoints, edge-midpoints on slot edge,
  //    slot corners) → formula motion = basePos + raw distance ×
  //    outwardNormal × miterScale. Locked axes get snapped to basePos
  //    by applyLocks at the end. Cross-tile determinism is the goal:
  //    edge-midpoints have axis-aligned outwardNormal so formula motion's
  //    parallel-to-edge component is 0 → they stay put; chain endpoints
  //    are fully locked so they don't move at all.
  //  - UNLOCKED points (interior outer-concave, interior outer-convex,
  //    body vertices) → arc-length aligned to nearest offset path
  //    location. Uses paper.js's elastic clamp so 4 concaves converging
  //    on a deflate land on the clamped offset polygon (= no self-
  //    intersection / crossing red lines), instead of the unbounded
  //    formula motion collapsing them onto a single point.
  const pathTotalLen = pickedPath.length;
  const inputArclen = new Array(N);
  inputArclen[0] = 0;
  for (let i = 1; i < N; i++) {
    inputArclen[i] = inputArclen[i - 1] + Math.hypot(
      allVerts[i].x - allVerts[i - 1].x,
      allVerts[i].y - allVerts[i - 1].y,
    );
  }
  const inputTotalLen = inputArclen[N - 1] + Math.hypot(
    allVerts[0].x - allVerts[N - 1].x,
    allVerts[0].y - allVerts[N - 1].y,
  );

  // Align input vertex 0 to its nearest position on the offset path so
  // arc-length distribution doesn't rotate (= shape stays "in phase").
  let anchorArclen = 0;
  if (pathTotalLen > 1e-9) {
    const nearest = pickedPath.getNearestLocation(new paper.Point(allVerts[0].x, allVerts[0].y));
    if (nearest) anchorArclen = nearest.offset;
  }

  const arcScale = inputTotalLen > 1e-9 ? pathTotalLen / inputTotalLen : 0;

  for (let i = 0; i < N; i++) {
    const v = allVerts[i];
    const p = graph.points.get(v.id);
    if (!p) continue;
    const lx = !!p.lock?.x;
    const ly = !!p.lock?.y;
    const anyLocked = lx || ly;

    if (anyLocked && p.outwardNormal) {
      applyFormulaMotion(p, v, effectiveDistance, graph);
    } else {
      const outArc = ((anchorArclen + inputArclen[i] * arcScale) % pathTotalLen + pathTotalLen) % pathTotalLen;
      const point = pickedPath.getPointAt(outArc) ?? pickedPath.firstSegment.point;
      p.pos.x = lx ? v.x : point.x;
      p.pos.y = ly ? v.y : point.y;
    }
  }

  offsetResult.remove();
}

function pickLargestPath(paths) {
  let best = null;
  let bestArea = -Infinity;
  for (const p of paths) {
    if (!p.segments || p.segments.length < 3) continue;
    const a = Math.abs(p.area);
    if (a > bestArea) { bestArea = a; best = p; }
  }
  return best;
}

// Accepts only SINGLE polygon (no splits) with at least 3 segments and
// area >= minArea. Splits mean topology change → arc-length write-back
// can't smoothly map input vertices to output → use a smaller delta.
function isAcceptablePaperResult(result, minArea) {
  if (!result) return false;
  // CompoundPath = multiple sub-paths = topology split. Reject.
  if (result.children && result.children.length > 1) return false;
  const target = result.children?.length === 1 ? result.children[0] : result;
  if (!target.segments || target.segments.length < 3) return false;
  if (typeof minArea === "number" && Math.abs(target.area) < minArea) return false;
  return true;
}

function signedPolygonArea(verts) {
  let a = 0;
  for (let i = 0; i < verts.length; i++) {
    const j = (i + 1) % verts.length;
    a += verts[i].x * verts[j].y - verts[j].x * verts[i].y;
  }
  return a * 0.5;
}

function collapseToCentroid(graph, allVerts) {
  let cx = 0, cy = 0;
  for (const v of allVerts) { cx += v.x; cy += v.y; }
  cx /= allVerts.length;
  cy /= allVerts.length;
  for (const v of allVerts) {
    const p = graph.points.get(v.id);
    if (!p) continue;
    p.pos.x = (p.lock?.x) ? v.x : cx;
    p.pos.y = (p.lock?.y) ? v.y : cy;
  }
}

// Per-vertex formula motion for any point with an outwardNormal.
// pos = basePos + RAW distance × outwardNormal × miterScale, capped per
// axis at half the tile's cell size. Per-axis lock honored. Same formula
// as the legacy clipper.js path — cross-tile match relies on it.
function applyFormulaMotion(p, v, distance, graph) {
  const lx = !!p.lock?.x;
  const ly = !!p.lock?.y;
  const ms = p.miterScale ?? 1;
  const cellW = graph.meta.cell?.w ?? 1;
  const cellH = graph.meta.cell?.h ?? 1;
  const rawMotionX = lx ? 0 : distance * p.outwardNormal.x * ms;
  const rawMotionY = ly ? 0 : distance * p.outwardNormal.y * ms;
  const capX = cellW * 0.5;
  const capY = cellH * 0.5;
  const motionX = Math.sign(rawMotionX) * Math.min(Math.abs(rawMotionX), capX);
  const motionY = Math.sign(rawMotionY) * Math.min(Math.abs(rawMotionY), capY);
  p.pos.x = lx ? v.x : v.x + motionX;
  p.pos.y = ly ? v.y : v.y + motionY;
}

function polygonEnclosesFilled(graph, allVerts) {
  // Centroid-only sampling is insufficient for L / plus shapes; sample
  // each pattern cell against the input polygon.
  const pattern = graph.meta.pattern;
  const cell = graph.meta.cell;
  if (!pattern || !cell) return true;

  let filledIn = 0, emptyIn = 0;
  for (let r = 0; r < pattern.length; r++) {
    for (let c = 0; c < pattern[r].length; c++) {
      const v = pattern[r][c];
      const filled = Array.isArray(v) ? v.some((x) => x) : !!v;
      const wx = graph.meta.origin.x + (c + 0.5) * cell.w;
      const wy = graph.meta.origin.y + (r + 0.5) * cell.h;
      if (pointInPolygon(allVerts, wx, wy)) {
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
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
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
