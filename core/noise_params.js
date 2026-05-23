// Per-layer parameters. A and B layers each get an independent copy so
// both can run simultaneously (A = "holes", B = "patches" in pipeline).
// edgeFade is a fraction of REF cell size — fadePx = edgeFade * (slotSize/cols).
// 0 = no fade (current behaviour), 1 = fade over a full cell width. Default 0
// keeps existing projects unchanged; user opts in per layer.
export const NOISE_LAYER_PARAMS = {
  type:     { type: "enum",   values: ["simplex", "ridged", "billowy", "fbm", "worley"], default: "simplex" },
  density:  { min: 0, max: 1, default: 0.5, effectScale: 1 },
  scale:    { min: 0, max: 1, default: 0.5, effectScale: 1 },
  edgeFade: { min: 0, max: 1, default: 0,   effectScale: 1 },
};

export const NOISE_LAYER_KEYS = ["A", "B"];

// Side mapping is fixed: A always renders as "holes" (carve into filled),
// B always renders as "patches" (add to empty). Layer names track this.
export const NOISE_LAYER_SIDE = { A: "holes", B: "patches" };

// Top-level project seed (used by noise + variant random).
export const DEFAULT_SEED = 42;
export const SEED_MIN = 0;
export const SEED_MAX = 99999;

export function defaultNoiseLayer() {
  const out = { enabled: false };
  for (const [key, spec] of Object.entries(NOISE_LAYER_PARAMS)) {
    out[key] = spec.default;
  }
  return out;
}

export function defaultNoiseParams() {
  const out = {};
  for (const k of NOISE_LAYER_KEYS) out[k] = defaultNoiseLayer();
  return out;
}

// Logarithmic mapping feels more linear than a straight lerp.
// slider 0 -> period ~256 px (huge blobs), slider 1 -> ~16 px (tight grain).
export function scaleToPeriodPx(scale01) {
  const s = Math.max(0, Math.min(1, scale01));
  return 256 / Math.pow(16, s);
}
