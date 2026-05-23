import {
  makeGraph, addPoint, addConnection,
  makePoint, makeConnection,
  LINE,
} from "../types.js";
import { cellOn }            from "./cellOn.js";
import { classifyRole }      from "./classifyRole.js";
import { sideOf }            from "./sideOf.js";
import { classifyCorner }    from "./classifyCorner.js";
import { assignPointLock }   from "./assignPointLocks.js";
import { assignChainIds }    from "./assignChainIds/index.js";
import { splitSaddleVertices } from "./splitSaddleVertices.js";

// Stamps graph.meta.kind from opts.kind ("single" | "dual") so downstream
// ops can dispatch. Pattern is stashed on meta for downstream consumers
// that need raw cell values without holding a reference to slot.
export function buildPointGraph(slot, slotSize, origin, opts = {}) {
  const pattern = slot?.array;
  if (!pattern || !pattern.length || !pattern[0].length) {
    return makeGraph({ slotSize, origin });
  }
  const rows  = pattern.length;
  const cols  = pattern[0].length;
  const cellW = slotSize / cols;
  const cellH = slotSize / rows;

  const graph = makeGraph({
    slotSize,
    origin,
    cell: { w: cellW, h: cellH },
    rows, cols,
  });
  graph.meta.pattern = pattern;
  graph.meta.kind    = opts.kind === "dual" ? "dual" : "single";

  const cellAt = (r, c) =>
    (r < 0 || r >= rows || c < 0 || c >= cols) ? -1
    : (cellOn(pattern[r][c]) ? 1 : 0);

  const pointId = (r, c) => `p_${r}_${c}`;
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const cellsAround = {
        nw: cellAt(r - 1, c - 1),
        ne: cellAt(r - 1, c),
        sw: cellAt(r,     c - 1),
        se: cellAt(r,     c),
      };
      const { cornerType, outwardNormal, miterScale } = classifyCorner(cellsAround);
      const point = makePoint(
        pointId(r, c),
        { x: origin.x + c * cellW, y: origin.y + r * cellH },
        assignPointLock(r, c, rows, cols),
      );
      point.cornerType    = cornerType;
      point.outwardNormal = outwardNormal;
      point.miterScale    = miterScale;
      addPoint(graph, point);
    }
  }

  const connId = (a, b) => `c_${a}_${b}`;

  // Horizontal edges go east; above cell is on traversal's LEFT.
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      const above = cellAt(r - 1, c);
      const below = cellAt(r,     c);
      const onEdge = (r === 0 || r === rows);
      const role   = classifyRole(above, below);
      const conn   = makeConnection(
        connId(pointId(r, c), pointId(r, c + 1)),
        pointId(r, c), pointId(r, c + 1),
        onEdge ? "outer" : "inner",
        role,
        LINE,
      );
      conn.interiorSide = sideOf(role, above, below, "left", "right");
      addConnection(graph, conn);
    }
  }
  // Vertical edges go south; left cell sits on traversal's RIGHT in
  // y-down screen coords (= west is walker's right going south).
  for (let c = 0; c <= cols; c++) {
    for (let r = 0; r < rows; r++) {
      const left  = cellAt(r, c - 1);
      const right = cellAt(r, c);
      const onEdge = (c === 0 || c === cols);
      const role   = classifyRole(left, right);
      const conn   = makeConnection(
        connId(pointId(r, c), pointId(r + 1, c)),
        pointId(r, c), pointId(r + 1, c),
        onEdge ? "outer" : "inner",
        role,
        LINE,
      );
      conn.interiorSide = sideOf(role, left, right, "right", "left");
      addConnection(graph, conn);
    }
  }

  assignChainIds(graph, { connectedSaddle: opts.connectedSaddle === true });
  if (opts.connectedSaddle === true) {
    splitSaddleVertices(graph, { bridgeOffset: opts.saddleBridgeOffset });
  }

  return graph;
}
