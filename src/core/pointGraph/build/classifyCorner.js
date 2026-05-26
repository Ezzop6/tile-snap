// Returns { cornerType, outwardNormal, miterScale } from the 4 cells
// touching the point. Saddle (2 diagonal on) keeps outwardNormal=null
// — single-grid splits saddles, so the vertex itself is geometrically
// undefined. miterScale = 1/sin(α/2) for proper polygon offset.
export function classifyCorner(cells) {
  const isOn   = (v) => v === 1;
  const filled = [isOn(cells.nw), isOn(cells.ne), isOn(cells.sw), isOn(cells.se)];
  const count  = filled.reduce((n, b) => n + (b ? 1 : 0), 0);

  let nx = 0, ny = 0;
  if (filled[0]) { nx += 0.5; ny += 0.5; }
  if (filled[1]) { nx -= 0.5; ny += 0.5; }
  if (filled[2]) { nx += 0.5; ny -= 0.5; }
  if (filled[3]) { nx -= 0.5; ny -= 0.5; }

  let cornerType;
  if      (count === 0) cornerType = "exterior";
  else if (count === 4) cornerType = "interior";
  else if (count === 1) cornerType = "outer-convex";
  else if (count === 3) cornerType = "outer-concave";
  else {
    const diagonal = (filled[0] && filled[3]) || (filled[1] && filled[2]);
    cornerType = diagonal ? "saddle" : "edge-midpoint";
  }

  const len = Math.hypot(nx, ny);
  const outwardNormal = len > 1e-6
    ? { x: nx / len, y: ny / len }
    : null;

  const miterScale =
    cornerType === "outer-convex"  ? Math.SQRT2 :
    cornerType === "outer-concave" ? Math.SQRT2 :
    cornerType === "edge-midpoint" ? 1 :
    null;

  return { cornerType, outwardNormal, miterScale };
}
