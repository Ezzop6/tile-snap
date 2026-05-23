// Whole-graph geometric transform around slot center. Applied as the very
// last pipeline op so cut, noise, and merged-cut chains all move together
// — one mirror = the full tile mirrors. Identity (rotate=0, flipH=false)
// early-returns so existing templates without cutTransform pay nothing.
//
// Coordinate convention: rotate steps are CW in screen space (y-down):
//   (x, y) → (-y, x) in centered coords per step.
// flipH = mirror across the slot's vertical axis. flipH applies BEFORE
// rotate so the (flipH × rotate) encoding covers all 8 D4 elements.
//
// Arc bow sign flips iff flipH (rotation preserves the signed
// perpendicular-CCW orientation relative to chord direction). Bezier
// handle offsets transform as vectors.

export function cutTransformImpl(graph, opts = {}) {
  const rotate = ((opts.rotate | 0) % 4 + 4) % 4;
  const flipH  = !!opts.flipH;
  if (rotate === 0 && !flipH) return graph;
  if (!graph || !graph.meta?.slotSize) return graph;

  const S = graph.meta.slotSize;
  const cx = S / 2;
  const cy = S / 2;

  for (const p of graph.points.values()) {
    if (p.pos)     transformPos(p.pos, cx, cy, flipH, rotate);
    if (p.basePos) transformPos(p.basePos, cx, cy, flipH, rotate);
    if (p.outwardNormal) {
      const v = transformVec(p.outwardNormal.x, p.outwardNormal.y, flipH, rotate);
      p.outwardNormal.x = v.x;
      p.outwardNormal.y = v.y;
    }
  }

  for (const c of graph.connections.values()) {
    const curve = c.curve;
    if (!curve) continue;
    if (curve.type === "arc") {
      if (flipH) curve.bowProportion = -(curve.bowProportion ?? 0);
    } else if (curve.type === "bezier") {
      if (curve.h1) {
        const v = transformVec(curve.h1.x, curve.h1.y, flipH, rotate);
        curve.h1.x = v.x; curve.h1.y = v.y;
      }
      if (curve.h2) {
        const v = transformVec(curve.h2.x, curve.h2.y, flipH, rotate);
        curve.h2.x = v.x; curve.h2.y = v.y;
      }
    }
  }

  return graph;
}

function transformPos(p, cx, cy, flipH, rotate) {
  let x = p.x - cx;
  let y = p.y - cy;
  if (flipH) x = -x;
  for (let i = 0; i < rotate; i++) {
    const t = x; x = -y; y = t;
  }
  p.x = x + cx;
  p.y = y + cy;
}

function transformVec(x, y, flipH, rotate) {
  if (flipH) x = -x;
  for (let i = 0; i < rotate; i++) {
    const t = x; x = -y; y = t;
  }
  return { x, y };
}

// Linear inverse of cutTransform for vectors / deltas. D4 has two cases:
// reflections (flipH=true) are involutions (T^-1 = T); pure rotations
// invert by rotating (4-r) steps. Used by slot-editor drag to convert a
// delta seen in transformed space back to untransformed cell-fraction
// coordinates expected by state.tileOffsets.
export function inverseTransformVec(x, y, opts = {}) {
  const rotate = ((opts.rotate | 0) % 4 + 4) % 4;
  const flipH  = !!opts.flipH;
  if (rotate === 0 && !flipH) return { x, y };
  if (flipH) {
    x = -x;
    for (let i = 0; i < rotate; i++) {
      const t = x; x = -y; y = t;
    }
  } else {
    const inv = (4 - rotate) % 4;
    for (let i = 0; i < inv; i++) {
      const t = x; x = -y; y = t;
    }
  }
  return { x, y };
}
