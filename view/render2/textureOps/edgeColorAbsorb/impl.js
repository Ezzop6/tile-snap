// Edge color absorption: compute the average colour of the source's
// outer border, then fade the inner band toward that colour with a
// linear gradient (full absorb at edge → no change at band-inside).
// Result: adjacent tiles' edges converge on the same hue/tint without
// changing the tile's interior. Cached per (source, poolKey, width, strength).

const _cache = new WeakMap();

export function applyEdgeColorAbsorbImpl(srcCanvas, poolKey, widthPercent, strength) {
  if (!srcCanvas || !widthPercent || widthPercent <= 0 || !strength || strength <= 0) return srcCanvas;
  let perSrc = _cache.get(srcCanvas);
  if (!perSrc) { perSrc = new Map(); _cache.set(srcCanvas, perSrc); }
  const cacheKey = `${poolKey}:${widthPercent}:${strength}`;
  let cached = perSrc.get(cacheKey);
  if (cached) return cached;
  cached = build(srcCanvas, widthPercent, strength);
  perSrc.set(cacheKey, cached);
  return cached;
}

function build(srcCanvas, widthPercent, strengthPct) {
  const W = srcCanvas.width;
  const H = srcCanvas.height;
  if (!W || !H) return srcCanvas;
  const refDim = Math.min(W, H);
  const N = Math.max(1, Math.min(
    Math.round((widthPercent / 100) * refDim),
    Math.floor(W / 2), Math.floor(H / 2),
  ));
  const k = strengthPct / 100;

  const sctx = srcCanvas.getContext("2d", { willReadFrequently: true });
  const src  = sctx.getImageData(0, 0, W, H).data;
  const out  = new Uint8ClampedArray(src);

  // Average border pixels (top + bottom rows + left + right cols, minus
  // corners counted once).
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let x = 0; x < W; x++) {
    const t = x * 4;
    const b = ((H - 1) * W + x) * 4;
    sr += src[t]     + src[b];
    sg += src[t + 1] + src[b + 1];
    sb += src[t + 2] + src[b + 2];
    n += 2;
  }
  for (let y = 1; y < H - 1; y++) {
    const l = y * W * 4;
    const r = (y * W + (W - 1)) * 4;
    sr += src[l]     + src[r];
    sg += src[l + 1] + src[r + 1];
    sb += src[l + 2] + src[r + 2];
    n += 2;
  }
  const eR = sr / n, eG = sg / n, eB = sb / n;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (d >= N) continue;
      const a = k * (1 - d / N);
      const i = (y * W + x) * 4;
      out[i]     = src[i]     + (eR - src[i])     * a;
      out[i + 1] = src[i + 1] + (eG - src[i + 1]) * a;
      out[i + 2] = src[i + 2] + (eB - src[i + 2]) * a;
    }
  }

  const outCanvas = document.createElement("canvas");
  outCanvas.width = W; outCanvas.height = H;
  outCanvas.getContext("2d", { willReadFrequently: true }).putImageData(new ImageData(out, W, H), 0, 0);
  return outCanvas;
}
