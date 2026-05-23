// Unsharp-mask sharpening: output = src + (src - blurred) * strength,
// applied only where |src - blurred| > threshold so flat areas stay
// untouched (= no noise amplification). `amount` 0..100 scales strength,
// `radius` 1..5 sets blur radius (halo size), `threshold` 0..50 gates
// the application. Cached per (source, poolKey, amount, radius, threshold).

const _cache = new WeakMap();

export function applySharpenImpl(srcCanvas, poolKey, amount, radius = 1, threshold = 0) {
  if (!srcCanvas || !amount || amount <= 0) return srcCanvas;
  let perSrc = _cache.get(srcCanvas);
  if (!perSrc) { perSrc = new Map(); _cache.set(srcCanvas, perSrc); }
  const cacheKey = `${poolKey}:${amount}:${radius}:${threshold}`;
  let cached = perSrc.get(cacheKey);
  if (cached) return cached;
  cached = buildSharpened(srcCanvas, amount, radius, threshold);
  perSrc.set(cacheKey, cached);
  return cached;
}

function buildSharpened(srcCanvas, amount, radius, threshold) {
  const W = srcCanvas.width;
  const H = srcCanvas.height;
  if (!W || !H) return srcCanvas;
  const strength = amount / 50;        // 100 → 2×
  const blurR    = Math.max(1, radius | 0);
  const thr      = Math.max(0, threshold | 0);

  const blurred = document.createElement("canvas");
  blurred.width = W; blurred.height = H;
  const bctx = blurred.getContext("2d", { willReadFrequently: true });
  bctx.filter = `blur(${blurR}px)`;
  bctx.drawImage(srcCanvas, 0, 0);

  const sctx = srcCanvas.getContext("2d", { willReadFrequently: true });
  const src  = sctx.getImageData(0, 0, W, H).data;
  const blur = blurred.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const out  = new Uint8ClampedArray(src.length);

  for (let i = 0; i < src.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const diff = src[i + c] - blur[i + c];
      out[i + c] = Math.abs(diff) > thr ? src[i + c] + diff * strength : src[i + c];
    }
    out[i + 3] = src[i + 3];
  }

  const outCanvas = document.createElement("canvas");
  outCanvas.width = W; outCanvas.height = H;
  outCanvas.getContext("2d", { willReadFrequently: true }).putImageData(new ImageData(out, W, H), 0, 0);
  return outCanvas;
}
