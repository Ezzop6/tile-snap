// Replaces chamfer + roundness. Each corner is cut at `softness` fraction
// of both legs and reconnected by a single arc whose control point is lerped
// from chord midpoint (arcness=0 → flat chamfer) to the original corner
// (arcness=1 → full bow). Same eligibility as old roundness — geometric, so
// organic-perturbed corners still register; locked + slot-edge skipped.
const FLAT_COS_THRESHOLD = -0.99;

export function cornerSoftenImpl(graph, opts = {}) {
  const softness = opts.softness ?? 0;
  const arcness  = opts.arcness  ?? 0;
  if (!graph || softness <= 0) return graph;

  const visibleByPoint = visibleAdjacencyMap(graph);

  const targets = [];
  for (const point of graph.points.values()) {
    if (point.lock?.x || point.lock?.y) continue;
    const adj = visibleByPoint.get(point.id);
    if (!adj || adj.length !== 2) continue;
    if (adj.some((c) => c.kind === "outer")) continue;
    if (isNearFlat(graph, point, adj)) continue;
    targets.push({ point, legs: adj });
  }

  // Pass 1: compute new vertex positions from the ORIGINAL graph. Mutating
  // sequentially in one pass would let later corners see legs shortened by
  // earlier corners' new vertices, producing asymmetric dA/dB for symmetric
  // layouts.
  const plans = [];
  for (const { point, legs } of targets) {
    const plan = planOne(graph, point, legs, softness, arcness);
    if (plan) plans.push(plan);
  }

  for (const plan of plans) applyPlan(graph, plan);

  mergeCoincidentSoftVertices(graph);

  return graph;
}

function mergeCoincidentSoftVertices(graph) {
  // At softness=1 adjacent corners' soft verts land on the same point;
  // collapse into a single merged peak vertex so inflate moves it once
  // (per-vertex bisector) and the peak stays a clean point under inflate
  // rather than two near-coincident points that spread apart with miter
  // geometry.
  const EPS = 1e-3;
  const softIds = [];
  for (const p of graph.points.values()) {
    if (p.cornerType === "soften-vertex") softIds.push(p.id);
  }
  const buckets = new Map();
  for (const id of softIds) {
    const p = graph.points.get(id);
    const kx = Math.round(p.pos.x / EPS);
    const ky = Math.round(p.pos.y / EPS);
    const key = `${kx},${ky}`;
    let arr = buckets.get(key);
    if (!arr) { arr = []; buckets.set(key, arr); }
    arr.push(id);
  }
  for (const ids of buckets.values()) {
    if (ids.length < 2) continue;
    const keep = ids[0];
    for (let i = 1; i < ids.length; i++) {
      const drop = ids[i];
      for (const conn of graph.connections.values()) {
        if (conn.from === drop) conn.from = keep;
        if (conn.to === drop) conn.to = keep;
      }
      graph.points.delete(drop);
    }
    const keepP = graph.points.get(keep);
    if (keepP) {
      keepP.cornerType = "merged-vertex";
      // Drop inherited normal/scale — merged vert uses per-vertex bisector
      // (its angle in the polygon comes from current adjacent edges and is
      // preserved by Clipper miter join at inflate time).
      keepP.outwardNormal = null;
      keepP.miterScale = null;
    }
  }
  for (const conn of [...graph.connections.values()]) {
    if (conn.from === conn.to) graph.connections.delete(conn.id);
  }
}

function planOne(graph, point, [conn1, conn2], softness, arcness) {
  const ptA = graph.points.get(otherId(conn1, point.id));
  const ptB = graph.points.get(otherId(conn2, point.id));
  if (!ptA || !ptB) return null;

  const lenA = Math.hypot(ptA.pos.x - point.pos.x, ptA.pos.y - point.pos.y);
  const lenB = Math.hypot(ptB.pos.x - point.pos.x, ptB.pos.y - point.pos.y);
  if (lenA < 1e-6 || lenB < 1e-6) return null;
  // softness=1 → dA = 0.5 × leg. Adjacent corners' soft verts coincide at
  // shared edge midpoint → mergeCoincidentSoftVertices collapses them into
  // one peak vertex. Without merge, per-vertex bisector inflate makes the
  // tiny gap between near-coincident soft verts SPREAD with inflate (=
  // polygon "rozjizdi" instead of having a clean peak).
  const dA = softness * 0.5 * lenA;
  const dB = softness * 0.5 * lenB;

  const v1Pos  = lerp(point.pos,     ptA.pos,     dA / lenA);
  const v2Pos  = lerp(point.pos,     ptB.pos,     dB / lenB);
  const v1Base = lerp(point.basePos, ptA.basePos, dA / lenA);
  const v2Base = lerp(point.basePos, ptB.basePos, dB / lenB);

  // Bow stored as proportion of chord length on the perpendicular axis (signed
  // by which side the corner is on). Lets the renderer recompute control
  // point dynamically from current sva/svb positions, so the arc shape
  // (proportionally) survives inflate / wave moving the chamfer endpoints.
  const midX = (v1Pos.x + v2Pos.x) * 0.5;
  const midY = (v1Pos.y + v2Pos.y) * 0.5;
  const chordX = v2Pos.x - v1Pos.x;
  const chordY = v2Pos.y - v1Pos.y;
  const chordLen = Math.hypot(chordX, chordY);
  let bowProportion = 0;
  if (chordLen > 1e-9) {
    const perpCCWx = -chordY / chordLen;
    const perpCCWy =  chordX / chordLen;
    const cornerDirX = point.pos.x - midX;
    const cornerDirY = point.pos.y - midY;
    const bowSigned = cornerDirX * perpCCWx + cornerDirY * perpCCWy;
    bowProportion = (bowSigned / chordLen) * arcness;
  }

  const diagSide = diagInteriorSide(point, conn1, ptA, v1Pos, v2Pos);
  const inheritedNormal = point.outwardNormal
    ? { x: point.outwardNormal.x, y: point.outwardNormal.y }
    : null;
  const inheritedScale  = point.miterScale ?? null;

  return { point, conn1, conn2, v1Pos, v2Pos, v1Base, v2Base, bowProportion, diagSide,
           inheritedNormal, inheritedScale };
}

function diagInteriorSide(point, conn1, ptA, v1Pos, v2Pos) {
  const conn1TanX = ptA.pos.x - point.pos.x;
  const conn1TanY = ptA.pos.y - point.pos.y;
  const tLen = Math.hypot(conn1TanX, conn1TanY);
  if (tLen < 1e-6) return conn1.interiorSide;
  let cpx = -conn1TanY / tLen;
  let cpy =  conn1TanX / tLen;
  const conn1Reversed = conn1.from !== point.id;
  const effSide = conn1Reversed
    ? (conn1.interiorSide === "left" ? "right" : "left")
    : conn1.interiorSide;
  if (effSide === "right") { cpx = -cpx; cpy = -cpy; }
  const intX = -cpx, intY = -cpy;
  const chordX = v2Pos.x - v1Pos.x;
  const chordY = v2Pos.y - v1Pos.y;
  const cross = chordX * intY - chordY * intX;
  return cross > 0 ? "right" : "left";
}

function applyPlan(graph, plan) {
  const { point, conn1, conn2, v1Pos, v2Pos, v1Base, v2Base, bowProportion, diagSide,
          inheritedNormal, inheritedScale } = plan;
  const v1Id = `${point.id}__sva`;
  const v2Id = `${point.id}__svb`;
  graph.points.set(v1Id, makeSoftenVertex(v1Id, v1Pos, v1Base, inheritedNormal, inheritedScale));
  graph.points.set(v2Id, makeSoftenVertex(v2Id, v2Pos, v2Base, inheritedNormal, inheritedScale));

  if (conn1.from === point.id) conn1.from = v1Id; else conn1.to = v1Id;
  if (conn2.from === point.id) conn2.from = v2Id; else conn2.to = v2Id;

  const role = (conn1.role === "cut" || conn2.role === "cut") ? "cut" : "closure";
  const diagId = `${point.id}__svdiag`;
  graph.connections.set(diagId, {
    id:           diagId,
    from:         v1Id,
    to:           v2Id,
    kind:         "inner",
    role,
    curve:        { type: "arc", bowProportion },
    interiorSide: diagSide,
    chainId:      conn1.chainId ?? conn2.chainId ?? null,
  });

  graph.points.delete(point.id);
}

function makeSoftenVertex(id, pos, basePos, outwardNormal, miterScale) {
  return {
    id,
    basePos:       { x: basePos.x, y: basePos.y },
    pos:           { x: pos.x,     y: pos.y },
    lock:          { x: false, y: false, rotation: false },
    cornerType:    "soften-vertex",
    outwardNormal: outwardNormal ? { x: outwardNormal.x, y: outwardNormal.y } : null,
    miterScale:    miterScale ?? null,
    cutDegree:     2,
    chainEndpoint: false,
  };
}

function visibleAdjacencyMap(graph) {
  const m = new Map();
  for (const conn of graph.connections.values()) {
    if (conn.role !== "cut" && conn.role !== "closure") continue;
    for (const pid of [conn.from, conn.to]) {
      let arr = m.get(pid);
      if (!arr) { arr = []; m.set(pid, arr); }
      arr.push(conn);
    }
  }
  return m;
}

function isNearFlat(graph, point, [c1, c2]) {
  const a = graph.points.get(otherId(c1, point.id));
  const b = graph.points.get(otherId(c2, point.id));
  if (!a || !b) return true;
  const ax = a.pos.x - point.pos.x, ay = a.pos.y - point.pos.y;
  const bx = b.pos.x - point.pos.x, by = b.pos.y - point.pos.y;
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
  if (la < 1e-6 || lb < 1e-6) return true;
  return (ax * bx + ay * by) / (la * lb) < FLAT_COS_THRESHOLD;
}

function otherId(conn, pid) {
  return conn.from === pid ? conn.to : conn.from;
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
