// Per-tile "soft seam" pass: blur a narrow band along all four edges so
// any leftover discontinuity (e.g. after autoTileable+boundarySnap couldn't
// fully match) reads as a soft transition. `widthPercent` (0..25) sets
// the band thickness as % of the shorter source dimension; blur radius
// scales with it. Cached per (source, poolKey, widthPercent).

const _cache = new WeakMap();

export function applyGaussianBlurImpl(srcCanvas, poolKey, widthPercent) {
  if (!srcCanvas || !widthPercent || widthPercent <= 0) return srcCanvas;
  let perSrc = _cache.get(srcCanvas);
  if (!perSrc) { perSrc = new Map(); _cache.set(srcCanvas, perSrc); }
  const cacheKey = `${poolKey}:${widthPercent}`;
  let cached = perSrc.get(cacheKey);
  if (cached) return cached;
  cached = buildHealed(srcCanvas, widthPercent);
  perSrc.set(cacheKey, cached);
  return cached;
}

function buildHealed(srcCanvas, widthPercent) {
  const W = srcCanvas.width;
  const H = srcCanvas.height;
  if (!W || !H) return srcCanvas;
  const refDim = Math.min(W, H);
  const N = Math.max(1, Math.min(
    Math.round((widthPercent / 100) * refDim),
    Math.floor(W / 2), Math.floor(H / 2),
  ));
  const blurRadius = Math.max(1, Math.round(N / 2));

  // Step 1: blurred copy of the full tile (canvas filter is GPU-fast).
  const blurred = document.createElement("canvas");
  blurred.width = W; blurred.height = H;
  const bctx = blurred.getContext("2d", { willReadFrequently: true });
  bctx.filter = `blur(${blurRadius}px)`;
  bctx.drawImage(srcCanvas, 0, 0);

  // Step 2: output = original; overlay blurred slice in each edge band.
  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  const octx = out.getContext("2d", { willReadFrequently: true });
  octx.drawImage(srcCanvas, 0, 0);
  octx.drawImage(blurred, 0,     0,     N, H, 0,     0,     N, H);  // L
  octx.drawImage(blurred, W - N, 0,     N, H, W - N, 0,     N, H);  // R
  octx.drawImage(blurred, 0,     0,     W, N, 0,     0,     W, N);  // T
  octx.drawImage(blurred, 0,     H - N, W, N, 0,     H - N, W, N);  // B
  return out;
}
