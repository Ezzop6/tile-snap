// Source-bitmap preprocessor that makes opposite edges compatible so the
// texture tiles seamlessly. `widthPercent` (0..50) is a fraction of the
// SHORTER source dimension — keeps the visual effect consistent across
// resolutions (8% looks the same on a 32px and a 256px tile). Two modes:
//   "mirror"  — each edge band blends with the mirrored other side.
//   "average" — each edge band fades into the per-pixel L+R average.
// Cached per (source, poolKey, mode, widthPercent).

const _cache = new WeakMap();

export function applyAutoTileableImpl(srcCanvas, poolKey, widthPercent, mode = "mirror", axis = "both") {
  if (!srcCanvas || !widthPercent || widthPercent <= 0) return srcCanvas;
  let perSrc = _cache.get(srcCanvas);
  if (!perSrc) { perSrc = new Map(); _cache.set(srcCanvas, perSrc); }
  const cacheKey = `${poolKey}:${mode}:${axis}:${widthPercent}`;
  let cached = perSrc.get(cacheKey);
  if (cached) return cached;
  cached = buildSeamless(srcCanvas, widthPercent, mode, axis);
  perSrc.set(cacheKey, cached);
  return cached;
}

function buildSeamless(srcCanvas, widthPercent, mode, axis) {
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

  const doH = axis !== "v";
  const doV = axis !== "h";

  if (doH) {
    for (let y = 0; y < H; y++) {
      const rowBase = y * W * 4;
      for (let i = 0; i < N; i++) {
        const a = i / N;
        const li = rowBase + i * 4;
        const ri = rowBase + (W - 1 - i) * 4;
        for (let c = 0; c < 4; c++) {
          const L = src.data[li + c];
          const R = src.data[ri + c];
          if (mode === "average") {
            const avg = (L + R) * 0.5;
            data[li + c] = L * a + avg * (1 - a);
            data[ri + c] = R * a + avg * (1 - a);
          } else {
            data[li + c] = L * a + R * (1 - a);
            data[ri + c] = R * a + L * (1 - a);
          }
        }
      }
    }
  }
  if (doV) {
    const inter = new Uint8ClampedArray(data);
    for (let x = 0; x < W; x++) {
      for (let i = 0; i < N; i++) {
        const a = i / N;
        const ti = (i * W + x) * 4;
        const bi = ((H - 1 - i) * W + x) * 4;
        for (let c = 0; c < 4; c++) {
          const T = inter[ti + c];
          const B = inter[bi + c];
          if (mode === "average") {
            const avg = (T + B) * 0.5;
            data[ti + c] = T * a + avg * (1 - a);
            data[bi + c] = B * a + avg * (1 - a);
          } else {
            data[ti + c] = T * a + B * (1 - a);
            data[bi + c] = B * a + T * (1 - a);
          }
        }
      }
    }
  }

  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  out.getContext("2d", { willReadFrequently: true }).putImageData(new ImageData(data, W, H), 0, 0);
  return out;
}
