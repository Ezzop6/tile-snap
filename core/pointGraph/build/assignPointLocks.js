// Slot corner = both axes locked. Edge midpoint = only perpendicular
// axis locked, so it can slide along its edge — adjacent tile's
// matching midpoint slides the same way (same cell pattern), keeping
// tile boundaries aligned after inflate.
export function assignPointLock(r, c, rows, cols) {
  return {
    x: c === 0 || c === cols,
    y: r === 0 || r === rows,
  };
}
