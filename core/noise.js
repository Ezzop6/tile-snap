import { scaleToPeriodPx } from "./noise_params.js";
import { minDistanceToSegments } from "./geometry.js";

const SAMPLE_PX = 2;

// Forced 0 within this fraction of the slot edge so neighbouring tiles never
// show clipped half-islands.
const HARD_EDGE_FRAC = 0.05;

// Noise field keyed to the template's logical slot grid: the same slot always
// samples the same world coord regardless of render size. 64 matches the
// project's default tile size which keeps slider tunings intuitive.
const REFERENCE_SLOT_SIZE = 64;

let _simplex = null;
let _simplexSeed = null;

function getSimplex(seed) {
  if (_simplex && _simplexSeed === seed) return _simplex;
  const ctor = window.SimplexNoise;
  if (!ctor) throw new Error("simplex-noise library not loaded");
  _simplex = new ctor(String(seed));
  _simplexSeed = seed;
  return _simplex;
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
  // density 0..1 maps inversely to threshold in [-1, +1].
  const threshold = 1 - 2 * Math.max(0, Math.min(1, params.density));

  const cols = Math.ceil(size.w / SAMPLE_PX) + 1;
  const rows = Math.ceil(size.h / SAMPLE_PX) + 1;
  const data = new Uint8Array(cols * rows);
  // Raw noise sample per cell; edge-aware fade in noiseImpl re-thresholds
  // using `values * edgeWeight > threshold`. -2 marks "killed at slot edge"
  // so re-threshold can't accidentally reactivate those cells.
  const values = new Float32Array(cols * rows);

  for (let r = 0; r < rows; r++) {
    const py = r * SAMPLE_PX;
    const fy = py / size.h;
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const px = c * SAMPLE_PX;
      const fx = px / size.w;

      const dx = Math.min(fx, 1 - fx);
      const dy = Math.min(fy, 1 - fy);
      if (Math.min(dx, dy) <= HARD_EDGE_FRAC) { data[idx] = 0; values[idx] = -2; continue; }

      const tx = (slotCol + fx) * REFERENCE_SLOT_SIZE;
      const ty = (slotRow + fy) * REFERENCE_SLOT_SIZE;
      const n  = sampler(simplex, tx * freq, ty * freq);
      values[idx] = n;
      data[idx]   = n > threshold ? 1 : 0;
    }
  }

  return { cols, rows, data, values, threshold, cell: SAMPLE_PX, origin };
}

// Holes inside larger regions emit as separate paths; the caller decides
// whether they become CompoundPath holes ("holes") or additional positive
// regions ("patches").
export function maskToContours(mask) {
  const paper = window.paper;
  if (!paper) throw new Error("paper.js not loaded");
  const { cols, rows, data, cell, origin } = mask;

  const edges = [];

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const tl = data[r * cols + c];
      const tr = data[r * cols + c + 1];
      const bl = data[(r + 1) * cols + c];
      const br = data[(r + 1) * cols + c + 1];
      const code = (tl << 3) | (tr << 2) | (br << 1) | bl;
      const x0 = origin.x + c * cell;
      const y0 = origin.y + r * cell;
      const xm = x0 + cell / 2;
      const ym = y0 + cell / 2;
      const xr = x0 + cell;
      const yb = y0 + cell;
      // Marching squares case table: edges directed so island (1) is on the LEFT.
      switch (code) {
        case 0:  /* 0000 */ break;
        case 1:  /* 0001 */ edges.push({ from: [x0, ym], to: [xm, yb] }); break;
        case 2:  /* 0010 */ edges.push({ from: [xm, yb], to: [xr, ym] }); break;
        case 3:  /* 0011 */ edges.push({ from: [x0, ym], to: [xr, ym] }); break;
        case 4:  /* 0100 */ edges.push({ from: [xr, ym], to: [xm, y0] }); break;
        case 5:  /* 0101 saddle */
          edges.push({ from: [x0, ym], to: [xm, y0] });
          edges.push({ from: [xr, ym], to: [xm, yb] });
          break;
        case 6:  /* 0110 */ edges.push({ from: [xm, yb], to: [xm, y0] }); break;
        case 7:  /* 0111 */ edges.push({ from: [x0, ym], to: [xm, y0] }); break;
        case 8:  /* 1000 */ edges.push({ from: [xm, y0], to: [x0, ym] }); break;
        case 9:  /* 1001 */ edges.push({ from: [xm, y0], to: [xm, yb] }); break;
        case 10: /* 1010 saddle */
          edges.push({ from: [xm, y0], to: [xr, ym] });
          edges.push({ from: [xm, yb], to: [x0, ym] });
          break;
        case 11: /* 1011 */ edges.push({ from: [xm, y0], to: [xr, ym] }); break;
        case 12: /* 1100 */ edges.push({ from: [xr, ym], to: [x0, ym] }); break;
        case 13: /* 1101 */ edges.push({ from: [xr, ym], to: [xm, yb] }); break;
        case 14: /* 1110 */ edges.push({ from: [xm, yb], to: [x0, ym] }); break;
        case 15: /* 1111 */ break;
      }
    }
  }

  // Endpoints compare exactly: same xm/ym arithmetic for shared cell edges, no FP tolerance needed.
  const startMap = new Map();
  for (const e of edges) startMap.set(keyOf(e.from), e);

  const loops = [];
  const used = new Set();
  for (let i = 0; i < edges.length; i++) {
    if (used.has(i)) continue;
    const loop = [];
    let cur = edges[i];
    let safety = edges.length + 1;
    while (cur && safety-- > 0) {
      const idx = edges.indexOf(cur);
      if (used.has(idx)) break;
      used.add(idx);
      loop.push(cur.from);
      cur = startMap.get(keyOf(cur.to));
    }
    if (loop.length >= 3) loops.push(loop);
  }

  return loops.map(loop => {
    const path = new paper.Path({
      segments: loop.map(([x, y]) => new paper.Point(x, y)),
      closed: true,
      insert: false,
    });
    return path;
  });
}

function keyOf([x, y]) {
  return `${x.toFixed(3)}|${y.toFixed(3)}`;
}

// Edge-aware fade: noise weakens near the boundary by raising the
// effective threshold. At distance >= fadePx the cell uses the normal
// density threshold; at the edge (d=0) the threshold is bumped all the
// way to +1 (= "only the strongest noise survives"). Density-independent
// — the multiplicative `v*w` version only nudged thresholds for low
// density, this version moves the visible edge for any density.
// segments: flat [ax,ay,bx,by,...] in same coords as mask cells.
export function applyEdgeFade(mask, segments, fadePx) {
  if (!fadePx || fadePx <= 0 || !segments?.length) return;
  const { cols, rows, data, values, threshold, cell, origin } = mask;
  if (!values) return;
  const bumpRange = 1 - threshold;
  for (let r = 0; r < rows; r++) {
    const py = origin.y + r * cell + cell * 0.5;
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (!data[idx]) continue;
      const v = values[idx];
      if (v < -1) continue;
      const px = origin.x + c * cell + cell * 0.5;
      const d = minDistanceToSegments(segments, px, py);
      const w = Math.min(1, d / fadePx);
      const effective = threshold + (1 - w) * bumpRange;
      if (v <= effective) data[idx] = 0;
    }
  }
}

export function buildNoiseIslands(slot, origin, size, params, seed) {
  const mask = buildNoiseMask(slot.col, slot.row, origin, size, params, seed);
  const contours = maskToContours(mask);
  return { mask, contours };
}
