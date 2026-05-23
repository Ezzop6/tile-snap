export function formatNum(n) {
  return (Math.round(n * 10) / 10).toString();
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
