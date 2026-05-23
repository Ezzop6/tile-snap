// Shared 2D geometry helpers. Pure functions, no DOM, no state.

// Distance from point (px,py) to the segment a→b. Degenerate (zero-length)
// segments fall back to point-to-point distance.
export function pointToSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx, qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

// Min distance from (x,y) to any segment in a flat [ax,ay,bx,by,...] array.
// Returns Infinity when no segments. Used by edge-aware noise + debug
// connection hit-test.
export function minDistanceToSegments(segments, x, y) {
  let best = Infinity;
  for (let i = 0; i < segments.length; i += 4) {
    const d = pointToSegmentDistance(x, y, segments[i], segments[i + 1], segments[i + 2], segments[i + 3]);
    if (d < best) best = d;
  }
  return best;
}
