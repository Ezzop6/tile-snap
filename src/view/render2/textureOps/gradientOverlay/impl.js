// Linear gradient blended over the tile. `direction` picks one of four
// axes (T→B, L→R, B→T, R→L); the gradient goes from t=0 (no change) at
// the start to t=1 (full effect) at the end. Polarity = darken (multiply
// toward black) or lighten (lerp toward white). `strength` 0..100 scales
// the peak effect. Cached.

const _cache = new WeakMap();

export function applyGradientOverlayImpl(srcCanvas, poolKey, strength, direction = "tb", polarity = "dark") {
  if (!srcCanvas || !strength || strength <= 0) return srcCanvas;
  let perSrc = _cache.get(srcCanvas);
  if (!perSrc) { perSrc = new Map(); _cache.set(srcCanvas, perSrc); }
  const cacheKey = `${poolKey}:${strength}:${direction}:${polarity}`;
  let cached = perSrc.get(cacheKey);
  if (cached) return cached;
  cached = build(srcCanvas, strength, direction, polarity);
  perSrc.set(cacheKey, cached);
  return cached;
}

function build(srcCanvas, strengthPct, direction, polarity) {
  const W = srcCanvas.width;
  const H = srcCanvas.height;
  if (!W || !H) return srcCanvas;
  const k = strengthPct / 100;
  const light = polarity === "light";

  const sctx = srcCanvas.getContext("2d", { willReadFrequently: true });
  const src  = sctx.getImageData(0, 0, W, H).data;
  const out  = new Uint8ClampedArray(src.length);

  const tAt = pickAxis(direction);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = tAt(x, y, W, H);
      const a = k * t;
      const i = (y * W + x) * 4;
      if (light) {
        out[i]     = src[i]     + (255 - src[i])     * a;
        out[i + 1] = src[i + 1] + (255 - src[i + 1]) * a;
        out[i + 2] = src[i + 2] + (255 - src[i + 2]) * a;
      } else {
        out[i]     = src[i]     * (1 - a);
        out[i + 1] = src[i + 1] * (1 - a);
        out[i + 2] = src[i + 2] * (1 - a);
      }
      out[i + 3] = src[i + 3];
    }
  }

  const outCanvas = document.createElement("canvas");
  outCanvas.width = W; outCanvas.height = H;
  outCanvas.getContext("2d", { willReadFrequently: true }).putImageData(new ImageData(out, W, H), 0, 0);
  return outCanvas;
}

function pickAxis(dir) {
  switch (dir) {
    case "lr": return (x, _y, W) => x / (W - 1 || 1);
    case "bt": return (_x, y, _W, H) => 1 - y / (H - 1 || 1);
    case "rl": return (x, _y, W) => 1 - x / (W - 1 || 1);
    case "tb":
    default:   return (_x, y, _W, H) => y / (H - 1 || 1);
  }
}
