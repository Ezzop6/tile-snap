// Pixel-exact boundary match: force the outer N pixels on opposite edges
// to be identical (per-pixel mean of L+R). `widthPercent` (0..25) is a
// fraction of the SHORTER source dimension — resolution-independent.
// Cached per (source, poolKey, widthPercent).

const _cache = new WeakMap();

export function applyBoundarySnapImpl(srcCanvas, poolKey, widthPercent) {
  if (!srcCanvas || !widthPercent || widthPercent <= 0) return srcCanvas;
  let perSrc = _cache.get(srcCanvas);
  if (!perSrc) { perSrc = new Map(); _cache.set(srcCanvas, perSrc); }
  const cacheKey = `${poolKey}:${widthPercent}`;
  let cached = perSrc.get(cacheKey);
  if (cached) return cached;
  cached = buildSnapped(srcCanvas, widthPercent);
  perSrc.set(cacheKey, cached);
  return cached;
}

function buildSnapped(srcCanvas, widthPercent) {
  const W = srcCanvas.width;
  const H = srcCanvas.height;
  if (!W || !H) return srcCanvas;
  const refDim = Math.min(W, H);
  const N = Math.max(1, Math.min(
    Math.round((widthPercent / 100) * refDim),
    Math.floor(W / 2), Math.floor(H / 2),
  ));

  const sctx = srcCanvas.getContext("2d", { willReadFrequently: true });
  const src  = sctx.getImageData(0, 0, W, H);
  const data = new Uint8ClampedArray(src.data);

  // Horizontal: L[i] = R[i] = mean(L,R) for each y, i ∈ [0,N).
  for (let y = 0; y < H; y++) {
    const rowBase = y * W * 4;
    for (let i = 0; i < N; i++) {
      const li = rowBase + i * 4;
      const ri = rowBase + (W - 1 - i) * 4;
      for (let c = 0; c < 4; c++) {
        const m = (src.data[li + c] + src.data[ri + c]) * 0.5;
        data[li + c] = m;
        data[ri + c] = m;
      }
    }
  }
  // Vertical: read from already-blended `data`.
  const inter = new Uint8ClampedArray(data);
  for (let x = 0; x < W; x++) {
    for (let i = 0; i < N; i++) {
      const ti = (i * W + x) * 4;
      const bi = ((H - 1 - i) * W + x) * 4;
      for (let c = 0; c < 4; c++) {
        const m = (inter[ti + c] + inter[bi + c]) * 0.5;
        data[ti + c] = m;
        data[bi + c] = m;
      }
    }
  }

  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  out.getContext("2d", { willReadFrequently: true }).putImageData(new ImageData(data, W, H), 0, 0);
  return out;
}
