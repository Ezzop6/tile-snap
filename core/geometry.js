// Shared 2D geometry helpers. Pure functions, no DOM, no state.

// Squared distance from point (px,py) to the segment a→b. The sqrt-free core;
// callers that compare against a radius square the radius instead of rooting
// every distance. Degenerate (zero-length) segments fall back to point-to-point.
export function pointToSegmentDistanceSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) {
    const ex = px - ax, ey = py - ay;
    return ex * ex + ey * ey;
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx, qy = ay + t * dy;
  const ex = px - qx, ey = py - qy;
  return ex * ex + ey * ey;
}

// Distance from point (px,py) to the segment a→b. Used by debug connection
// hit-test, which needs the actual distance (not a threshold check).
export function pointToSegmentDistance(px, py, ax, ay, bx, by) {
  return Math.sqrt(pointToSegmentDistanceSq(px, py, ax, ay, bx, by));
}

// True iff (x,y) lies within `radius` of ANY segment in a flat
// [ax,ay,bx,by,...] array. Squared-distance compare (no sqrt) + early-exit on
// the first hit — the "is the cut near?" query, much cheaper than computing the
// full min distance. Used by the noise edge fade (core/noise.js#applyCutFade).
export function anySegmentWithin(segments, x, y, radius) {
  const r2 = radius * radius;
  for (let i = 0; i < segments.length; i += 4) {
    if (pointToSegmentDistanceSq(x, y, segments[i], segments[i + 1], segments[i + 2], segments[i + 3]) < r2) {
      return true;
    }
  }
  return false;
}
