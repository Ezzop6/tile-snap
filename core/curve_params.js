// Slider widgets always read/write 0..1 against state.globalCurve. What 0..1
// means in pixels/radians lives here so scaling a slider's reach is one edit.

export const GLOBAL_CURVE_PARAMS = {
  // Fraction of each leg consumed at every eligible corner. 1.0 → meets
  // neighbour at midpoint (per-side clamp). Replaces old chamfer/roundness
  // amount knob — one slider for "how much corner to alter".
  cornerSoftness: { min: 0, max: 1, default: 0, effectScale: 1 },

  // Shape of the corner cut: 0 = flat chamfer (straight chord), 1 = full arc
  // (max bow through original corner), in between = arc with partial bow.
  // No effect when cornerSoftness = 0.
  cornerArcness:  { min: 0, max: 1, default: 0, effectScale: 1 },

  // Magnitude of the noise-driven perpendicular offset (cellSize fraction).
  // Sign flips the bias direction when waveSymmetric < 1.
  waveAmplitude: { min: -1, max: 1, default: 0, effectScale: 0.5 },

  // Spatial frequency of the underlying noise: 0 → no wave (cut stays as
  // drawn by upstream ops); 1 → wave op's "natural" packing (= 8 cycles per
  // cell). State range goes up to 4 so the slider can drive 32 cycles/cell
  // for fine bristle textures. UI slider stays 0..100 (uiScale=25 → state*25).
  waveFrequency: { min: 0, max: 4, default: 0, effectScale: 1, uiScale: 25 },

  // Secondary noise layer on TOP of the primary wave that scales the
  // amplitude up/down along the chain — makes the wave non-uniform without
  // shifting its phase.
  waveJitter: { min: 0, max: 1, default: 0, effectScale: 1 },

  // 0 = bumps only one side (= bias in amplitude sign direction); 1 = both
  // sides (= zero-mean displacement). Slider, not bool.
  waveSymmetric: { min: 0, max: 1, default: 1, effectScale: 1 },

  // Negative = deflate. Math in inflateOutline multiplies by a signed amount.
  inflate: { min: -1, max: 1, default: 0, effectScale: 0.5 },

  // Pre-pipeline 2D random shift seeded from project seed. Map mode
  // multiplies by cellSize (so state 1.0 = full cellSize amplitude with
  // effectScale 0.5); preview's renderer uses its own factor.
  organic: { min: 0, max: 1, default: 0, effectScale: 0.5 },

  // Absolute pixels (NOT cell-relative) so preview and export pixel-match across
  // templates with different pattern sizes. Centred on the cut so half lands on
  // each side, which avoids a ghost line on the opposite side from bitmap AA.
  // effectScale = max px shown on the slider. Lowered from 10 → the stacked
  // gradient renderer in outline.js doubles slider value (= visible 2× width)
  // and adds visible ring jumps at every integer crossing; useful range is
  // small enough that 4 px slider max is plenty in practice.
  outlineWidth: { min: 0, max: 1, default: 0, effectScale: 4 },

  outlineColor: { default: "#000000" },
};

export function defaultGlobalCurve() {
  const out = {};
  for (const [key, spec] of Object.entries(GLOBAL_CURVE_PARAMS)) {
    out[key] = spec.default;
  }
  return out;
}
