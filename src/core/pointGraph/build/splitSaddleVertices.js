// Mirrors dual/splitSaddleVertices: bridge-corner pair pre-separated along its
// outward normal so the two chains don't sit on the same point post-split.
// Without the offset the chains visually merge into an X-cross even though the
// chain graph is correctly bridged.
const DEFAULT_BRIDGE_OFFSET = 0.25;

export function splitSaddleVertices(graph, opts = {}) {
  const pattern = graph.meta.pattern;
  if (!pattern) return;
  const bridgeOffset = Number.isFinite(opts.bridgeOffset)
    ? Math.max(0, Math.min(1, opts.bridgeOffset))
    : DEFAULT_BRIDGE_OFFSET;
  const saddles = [];
  for (const p of graph.points.values()) {
    if (p.cornerType === "saddle" && p.cutDegree === 4) saddles.push(p);
  }
  for (const saddle of saddles) splitOne(graph, saddle, pattern, bridgeOffset);
}

function splitOne(graph, saddle, pattern, bridgeOffset) {
  const [, rsStr, csStr] = saddle.id.split("_");
  const rs = Number(rsStr);
  const cs = Number(csStr);

  const cellAt = (r, c) =>
    (r < 0 || r >= pattern.length || c < 0 || c >= pattern[0].length)
      ? 0
      : (Array.isArray(pattern[r][c]) ? (pattern[r][c].some((x) => x) ? 1 : 0)
                                       : (pattern[r][c] ? 1 : 0));
  const nw = cellAt(rs - 1, cs - 1);
  const ne = cellAt(rs - 1, cs);
  const sw = cellAt(rs,     cs - 1);
  const se = cellAt(rs,     cs);

  // Bridge vertex wraps EMPTY corner; `side` names it, normal points into it.
  // See dual/splitSaddleVertices.js for full rationale.
  const halfSqrt2 = Math.SQRT1_2;
  let halves;
  if (nw && se && !ne && !sw) {
    halves = [
      { side: "ne", normal: { x:  halfSqrt2, y: -halfSqrt2 }, dirs: new Set(["N", "E"]) },
      { side: "sw", normal: { x: -halfSqrt2, y:  halfSqrt2 }, dirs: new Set(["S", "W"]) },
    ];
  } else if (ne && sw && !nw && !se) {
    halves = [
      { side: "nw", normal: { x: -halfSqrt2, y: -halfSqrt2 }, dirs: new Set(["N", "W"]) },
      { side: "se", normal: { x:  halfSqrt2, y:  halfSqrt2 }, dirs: new Set(["S", "E"]) },
    ];
  } else {
    return;
  }

  const cuts = [];
  for (const conn of graph.connections.values()) {
    if (conn.role !== "cut") continue;
    if (conn.from === saddle.id || conn.to === saddle.id) cuts.push(conn);
  }

  const cell = graph.meta.cell;
  const cellSize = cell ? (cell.w + cell.h) * 0.5 : 0;
  const offsetMag = cellSize * bridgeOffset;

  for (const half of halves) {
    const newId = `${saddle.id}__${half.side}`;
    const ox = offsetMag * half.normal.x;
    const oy = offsetMag * half.normal.y;
    graph.points.set(newId, {
      id:            newId,
      basePos:       { x: saddle.basePos.x + ox, y: saddle.basePos.y + oy },
      pos:           { x: saddle.pos.x     + ox, y: saddle.pos.y     + oy },
      lock:          { x: false, y: false, rotation: false },
      cornerType:    "bridge-corner",
      outwardNormal: half.normal,
      miterScale:    Math.SQRT2,
      cutDegree:     2,
      chainEndpoint: false,
    });

    for (const cut of cuts) {
      const otherId = cut.from === saddle.id ? cut.to : cut.from;
      const [, roStr, coStr] = otherId.split("_");
      const ro = Number(roStr), co = Number(coStr);
      let dir;
      if      (ro < rs) dir = "N";
      else if (ro > rs) dir = "S";
      else if (co < cs) dir = "W";
      else              dir = "E";
      if (!half.dirs.has(dir)) continue;
      if (cut.from === saddle.id) cut.from = newId;
      if (cut.to   === saddle.id) cut.to   = newId;
    }
  }

  graph.points.delete(saddle.id);
}
