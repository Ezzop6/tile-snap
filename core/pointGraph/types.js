// No closed-loop assumption: loops are emergent for consumers that need them.

export const LINE = { type: "line" };

// (cx, cy) = offset from chord midpoint to the quadratic Bezier control point.
export function arc(cx, cy) {
  return { type: "arc", cx, cy };
}

// h1/h2 are vectors from from/to to control points (paper.js convention).
export function bezier(h1, h2) {
  return { type: "bezier", h1: { ...h1 }, h2: { ...h2 } };
}

// basePos is immutable reference; pos is mutated by transforms.
export function makePoint(id, basePos, lock = {}) {
  return {
    id,
    basePos: { x: basePos.x, y: basePos.y },
    pos:     { x: basePos.x, y: basePos.y },
    lock: {
      x:        lock.x        === true,
      y:        lock.y        === true,
      rotation: lock.rotation === true,
    },
  };
}

export function makeConnection(id, from, to, kind, role, curve = LINE) {
  return { id, from, to, kind, role, curve };
}

export function makeGraph(meta = {}) {
  return {
    points:      new Map(),
    connections: new Map(),
    meta: {
      slotSize: meta.slotSize ?? 0,
      origin:   meta.origin   ?? { x: 0, y: 0 },
      cell:     meta.cell     ?? { w: 0, h: 0 },
      rows:     meta.rows     ?? 0,
      cols:     meta.cols     ?? 0,
    },
  };
}

export function addPoint(graph, point) {
  graph.points.set(point.id, point);
  return point;
}

export function addConnection(graph, conn) {
  graph.connections.set(conn.id, conn);
  return conn;
}

export function* filterConnections(graph, pred) {
  for (const conn of graph.connections.values()) {
    if (pred(conn)) yield conn;
  }
}

export function* filterPoints(graph, pred) {
  for (const point of graph.points.values()) {
    if (pred(point)) yield point;
  }
}
