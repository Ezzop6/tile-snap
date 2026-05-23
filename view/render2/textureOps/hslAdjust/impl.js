// HSL-space adjustment trio.
//   hue (−180..+180 deg): rotation around the colour wheel
//   saturation (−100..+100): scale on S component (−100 → grey, +100 → 2× boost)
//   lightness  (−100..+100): additive shift on L (−100 → black, +100 → white)
// Identity (all zero) short-circuits. Cached per (source, poolKey, h, s, l).

const _cache = new WeakMap();

export function applyHslAdjustImpl(srcCanvas, poolKey, params) {
  if (!srcCanvas) return srcCanvas;
  const h = (params?.hue        | 0);
  const s = (params?.saturation | 0);
  const l = (params?.lightness  | 0);
  if (h === 0 && s === 0 && l === 0) return srcCanvas;

  let perSrc = _cache.get(srcCanvas);
  if (!perSrc) { perSrc = new Map(); _cache.set(srcCanvas, perSrc); }
  const cacheKey = `${poolKey}:${h}:${s}:${l}`;
  let cached = perSrc.get(cacheKey);
  if (cached) return cached;
  cached = build(srcCanvas, h, s, l);
  perSrc.set(cacheKey, cached);
  return cached;
}

function build(srcCanvas, hueDeg, satPct, lightPct) {
  const W = srcCanvas.width;
  const H = srcCanvas.height;
  if (!W || !H) return srcCanvas;

  const hueShift   = ((hueDeg % 360) + 360) % 360 / 360;
  const satScale   = 1 + satPct / 100;          // −100 → 0, +100 → 2
  const lightShift = (lightPct / 100) * 0.5;    // ±100 → ±0.5

  const sctx = srcCanvas.getContext("2d", { willReadFrequently: true });
  const src  = sctx.getImageData(0, 0, W, H).data;
  const out  = new Uint8ClampedArray(src.length);

  for (let i = 0; i < src.length; i += 4) {
    const [h, s, l] = rgbToHsl(src[i], src[i + 1], src[i + 2]);
    const h2 = (h + hueShift) % 1;
    const s2 = clamp01(s * satScale);
    const l2 = clamp01(l + lightShift);
    const [r, g, b] = hslToRgb(h2, s2, l2);
    out[i]     = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = src[i + 3];
  }

  const outCanvas = document.createElement("canvas");
  outCanvas.width = W; outCanvas.height = H;
  outCanvas.getContext("2d", { willReadFrequently: true }).putImageData(new ImageData(out, W, H), 0, 0);
  return outCanvas;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) * 0.5;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if      (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else                h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const v = l * 255;
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    hue2rgb(p, q, h + 1 / 3) * 255,
    hue2rgb(p, q, h)         * 255,
    hue2rgb(p, q, h - 1 / 3) * 255,
  ];
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
