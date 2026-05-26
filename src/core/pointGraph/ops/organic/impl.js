// Pre-pipeline structural jitter. Runs FIRST so the downstream ops
// (inflate/cornerSoften/wave) cascade onto an already-perturbed graph —
// every tile gets a different chain shape, not just per-point noise.
//
// Hash is keyed on (slotCol, slotRow, localCellX, localCellY, seed) →
// view-independent: the SAME slot produces the SAME shift regardless of
// the render scale or world origin (Map debug at 96px, preview overlay
// at 30px and main canvas at 64px must all agree).
export function organicImpl(graph, opts = {}) {
  const amplitude = opts.amplitude ?? 0;
  const seed      = opts.seed ?? 0;
  const slotCol   = opts.slotCol ?? 0;
  const slotRow   = opts.slotRow ?? 0;
  if (!graph || !amplitude) return graph;

  const minX = graph.meta.origin.x;
  const minY = graph.meta.origin.y;
  const maxX = minX + graph.meta.slotSize;
  const maxY = minY + graph.meta.slotSize;
  const cellSize = (graph.meta.cell.w + graph.meta.cell.h) / 2;
  const clampX = (v) => Math.min(Math.max(v, minX), maxX);
  const clampY = (v) => Math.min(Math.max(v, minY), maxY);

  for (const point of graph.points.values()) {
    // Tile-boundary points (any axis locked) must stay fixed — moving
    // them at all would break tileability with the neighbour tile.
    if (point.lock?.x || point.lock?.y) continue;

    const lx = Math.round((point.basePos.x - minX) / cellSize);
    const ly = Math.round((point.basePos.y - minY) / cellSize);
    // Separate x/y hashes → true 2D random shift (not just along
    // outwardNormal). Seed + slot mixed in so user can reroll variants
    // and tiles still differ.
    const jx = (hash(lx, ly, slotCol, slotRow, seed,         0xa1) * 2 - 1) * amplitude;
    const jy = (hash(lx, ly, slotCol, slotRow, seed ^ 0x5af, 0xb7) * 2 - 1) * amplitude;

    point.pos.x     = clampX(point.pos.x     + jx);
    point.pos.y     = clampY(point.pos.y     + jy);
    point.basePos.x = clampX(point.basePos.x + jx);
    point.basePos.y = clampY(point.basePos.y + jy);
  }
  return graph;
}

function hash(lx, ly, sc, sr, seed, salt) {
  let h = 2166136261 ^ salt;
  h ^= lx;   h = Math.imul(h, 16777619);
  h ^= ly;   h = Math.imul(h, 16777619);
  h ^= sc;   h = Math.imul(h, 16777619);
  h ^= sr;   h = Math.imul(h, 16777619);
  h ^= seed; h = Math.imul(h, 16777619);
  h ^= h >>> 13; h = Math.imul(h, 16777619);
  return ((h >>> 0) % 100000) / 100000;
}
