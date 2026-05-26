// Inner shadow: darken (or lighten) a gradient band along all four edges.
// Param `polarity` picks dark or light; `width` = band, `opacity` = peak
// strength at the edge fading to 0 at band-inside. Cached.

const _cache = new WeakMap();

export function applyInnerShadowImpl(srcCanvas, poolKey, widthPercent, opacity, polarity = "dark") {
  if (!srcCanvas || !widthPercent || widthPercent <= 0 || !opacity || opacity <= 0) return srcCanvas;
  let perSrc = _cache.get(srcCanvas);
  if (!perSrc) { perSrc = new Map(); _cache.set(srcCanvas, perSrc); }
  const cacheKey = `${poolKey}:${widthPercent}:${opacity}:${polarity}`;
  let cached = perSrc.get(cacheKey);
  if (cached) return cached;
  cached = build(srcCanvas, widthPercent, opacity, polarity);
  perSrc.set(cacheKey, cached);
  return cached;
}

function build(srcCanvas, widthPercent, opacityPct, polarity) {
  const W = srcCanvas.width;
  const H = srcCanvas.height;
  if (!W || !H) return srcCanvas;
  const refDim = Math.min(W, H);
  const N = Math.max(1, Math.min(
    Math.round((widthPercent / 100) * refDim),
    Math.floor(W / 2), Math.floor(H / 2),
  ));
  const k = opacityPct / 100;
  const light = polarity === "light";

  const sctx = srcCanvas.getContext("2d", { willReadFrequently: true });
  const src  = sctx.getImageData(0, 0, W, H).data;
  const out  = new Uint8ClampedArray(src);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (d >= N) continue;
      const a = k * (1 - d / N);
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
    }
  }

  const outCanvas = document.createElement("canvas");
  outCanvas.width = W; outCanvas.height = H;
  outCanvas.getContext("2d", { willReadFrequently: true }).putImageData(new ImageData(out, W, H), 0, 0);
  return outCanvas;
}
