// RGB-space tonal adjust. Order applied: brightness → contrast →
// per-channel R/G/B offsets → gamma. Each param defaults to identity
// (brightness/contrast/RGB = 0, gamma = 100 = γ 1.0). Cached per
// (source, poolKey, all params).

const _cache = new WeakMap();

export function applyColorAdjustImpl(srcCanvas, poolKey, params) {
  if (!srcCanvas) return srcCanvas;
  const b  = params?.brightness | 0;
  const c  = params?.contrast   | 0;
  const r  = params?.red        | 0;
  const g  = params?.green      | 0;
  const bl = params?.blue       | 0;
  const gm = params?.gamma ?? 100;
  const identity = b === 0 && c === 0 && r === 0 && g === 0 && bl === 0 && gm === 100;
  if (identity) return srcCanvas;

  let perSrc = _cache.get(srcCanvas);
  if (!perSrc) { perSrc = new Map(); _cache.set(srcCanvas, perSrc); }
  const cacheKey = `${poolKey}:${b}:${c}:${r}:${g}:${bl}:${gm}`;
  let cached = perSrc.get(cacheKey);
  if (cached) return cached;
  cached = build(srcCanvas, b, c, r, g, bl, gm);
  perSrc.set(cacheKey, cached);
  return cached;
}

function build(srcCanvas, b, c, rOff, gOff, blOff, gammaPct) {
  const W = srcCanvas.width;
  const H = srcCanvas.height;
  if (!W || !H) return srcCanvas;

  const sctx = srcCanvas.getContext("2d", { willReadFrequently: true });
  const src  = sctx.getImageData(0, 0, W, H);
  const data = new Uint8ClampedArray(src.data);

  const bShift  = b * 2.55;
  const cScale  = 1 + c / 100;
  const rShift  = rOff * 2.55;
  const gShift  = gOff * 2.55;
  const blShift = blOff * 2.55;
  // gammaPct 100 → 1.0, 50 → 0.5 (brighter midtones), 200 → 2.0 (darker midtones)
  const invGamma = 1 / (gammaPct / 100);
  const useGamma = gammaPct !== 100;

  for (let i = 0; i < data.length; i += 4) {
    let r  = src.data[i]     + bShift + rShift;
    let g  = src.data[i + 1] + bShift + gShift;
    let bl = src.data[i + 2] + bShift + blShift;
    r  = (r  - 128) * cScale + 128;
    g  = (g  - 128) * cScale + 128;
    bl = (bl - 128) * cScale + 128;
    if (useGamma) {
      r  = 255 * Math.pow(Math.max(0, Math.min(255, r))  / 255, invGamma);
      g  = 255 * Math.pow(Math.max(0, Math.min(255, g))  / 255, invGamma);
      bl = 255 * Math.pow(Math.max(0, Math.min(255, bl)) / 255, invGamma);
    }
    data[i]     = r;
    data[i + 1] = g;
    data[i + 2] = bl;
    data[i + 3] = src.data[i + 3];
  }

  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  out.getContext("2d", { willReadFrequently: true }).putImageData(new ImageData(data, W, H), 0, 0);
  return out;
}
