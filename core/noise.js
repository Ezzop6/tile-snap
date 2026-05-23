import { scaleToPeriodPx } from "./noise_params.js";

const SAMPLE_PX = 2;

// Forced 0 within this fraction of the slot edge so neighbouring tiles never
// show clipped half-islands.
const HARD_EDGE_FRAC = 0.05;

// Noise field keyed to the template's logical slot grid: the same slot always
// samples the same world coord regardless of render size. 64 matches the
// project's default tile size which keeps slider tunings intuitive.
const REFERENCE_SLOT_SIZE = 64;

// One paint mixes several seeds in quick succession (noise A = seed, noise B =
// seed+9973, wave = seed + seed+1), so a single-entry memo thrashed and rebuilt
// the simplex (512-entry permutation tables) ~per slot per layer. A small LRU
// keyed by seed keeps every seed used in a paint warm → built once, not ~140×.
const _simplexCache = new Map();
const SIMPLEX_CACHE_MAX = 8;

function getSimplex(seed) {
  const cached = _simplexCache.get(seed);
  if (cached) return cached;
  const ctor = window.SimplexNoise;
  if (!ctor) throw new Error("simplex-noise library not loaded");
  const inst = new ctor(String(seed));
  _simplexCache.set(seed, inst);
  if (_simplexCache.size > SIMPLEX_CACHE_MAX) {
    _simplexCache.delete(_simplexCache.keys().next().value);
  }
  return inst;
}

// Samplers: (simplex, x, y) -> value in [-1, +1] so threshold compares uniformly.

function sampleSimplex(simplex, x, y) {
  return simplex.noise2D(x, y);
}

export function simplexNoise2D(x, y, seed) {
  return getSimplex(seed).noise2D(x, y);
}

function sampleRidged(simplex, x, y) {
  const n = simplex.noise2D(x, y);
  return (1 - Math.abs(n)) * 2 - 1;
}

function sampleBillowy(simplex, x, y) {
  return Math.abs(simplex.noise2D(x, y)) * 2 - 1;
}

function sampleFbm(simplex, x, y) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let maxSum = 0;
  for (let i = 0; i < 4; i++) {
    sum    += amp * simplex.noise2D(x * freq, y * freq);
    maxSum += amp;
    amp    *= 0.5;
    freq   *= 2.0;
  }
  return sum / maxSum;
}

// Worley F1: jitter one feature point per integer cell, pick nearest from 3x3.
// Output remapped so high "noise" = far from feature = island interior.
function sampleWorley(simplex, x, y) {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let minD2 = Infinity;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const gx = cx + ox;
      const gy = cy + oy;
      const jx = simplex.noise2D(gx * 17.31, gy * 23.97) * 0.5 + 0.5;
      const jy = simplex.noise2D(gx * 41.13 + 0.5, gy * 11.59 + 0.5) * 0.5 + 0.5;
      const fx = gx + jx;
      const fy = gy + jy;
      const dx = fx - x;
      const dy = fy - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < minD2) minD2 = d2;
    }
  }
  const d = Math.min(1, Math.sqrt(minD2));
  return d * 2 - 1;
}

const SAMPLERS = {
  simplex: sampleSimplex,
  ridged:  sampleRidged,
  billowy: sampleBillowy,
  fbm:     sampleFbm,
  worley:  sampleWorley,
};

export const NOISE_TYPES = Object.keys(SAMPLERS);

// Sampling lives in template space: same slot produces the same noise pattern
// in every view; only sample resolution + contour pixel coords differ.
export function buildNoiseMask(slotCol, slotRow, origin, size, params, seed) {
  const simplex = getSimplex(seed);
  const sampler = SAMPLERS[params.type] || SAMPLERS.simplex;
  const periodPx = Math.max(1, scaleToPeriodPx(params.scale));
  const freq = 1 / periodPx;
  // Mask-calibrated density: slider 0..1 → threshold 0.9..0, i.e. ~0%..~50%
  // coverage. 50% is the practical max for a mask (beyond that the region is
  // more carved away than kept). Simplex clusters near 0, so threshold 0 ≈ 50%
  // coverage and the mapping spends most travel in the sparse zone where masks
  // actually live.
  const d = Math.max(0, Math.min(1, params.density));
  const threshold = 0.9 * (1 - d);

  const cols = Math.ceil(size.w / SAMPLE_PX) + 1;
  const rows = Math.ceil(size.h / SAMPLE_PX) + 1;
  const data = new Uint8Array(cols * rows);

  for (let r = 0; r < rows; r++) {
    const py = r * SAMPLE_PX;
    const fy = py / size.h;
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const px = c * SAMPLE_PX;
      const fx = px / size.w;

      const dx = Math.min(fx, 1 - fx);
      const dy = Math.min(fy, 1 - fy);
      // Hard zero within a fraction of the slot edge so neighbouring tiles never
      // show clipped half-islands. This margin is for cross-tile continuity and
      // is intentionally separate from the (composition-level) edge fade.
      if (Math.min(dx, dy) <= HARD_EDGE_FRAC) { data[idx] = 0; continue; }

      const tx = (slotCol + fx) * REFERENCE_SLOT_SIZE;
      const ty = (slotRow + fy) * REFERENCE_SLOT_SIZE;
      const n  = sampler(simplex, tx * freq, ty * freq);
      data[idx]   = n > threshold ? 1 : 0;
    }
  }

  return { cols, rows, data, cell: SAMPLE_PX, origin };
}

