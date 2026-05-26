// Tiny shared numeric helpers — were duplicated across stage / handles /
// export-utils (clamp) and wave / outline / texture-ops (clamp01).

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
