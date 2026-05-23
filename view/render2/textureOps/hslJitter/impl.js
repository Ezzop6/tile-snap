// Per-block random HSL perturbation. Each `scale`×`scale` block of the
// source gets one (hue, sat, light) offset within ±jitter%, then every
// pixel in that block is HSL-shifted by it. Seed deterministic per
// (W, H, params) so the pattern is stable across cache rebuilds.

const _cache = new WeakMap();

export function applyHslJitterImpl(srcCanvas, poolKey, hueJ, satJ, lightJ, scale) {
  const h = hueJ   | 0;
  const s = satJ   | 0;
  const l = lightJ | 0;
  if (!srcCanvas || (h === 0 && s === 0 && l === 0)) return srcCanvas;
  let perSrc = _cache.get(srcCanvas);
  if (!perSrc) { perSrc = new Map(); _cache.set(srcCanvas, perSrc); }
  const cacheKey = `${poolKey}:${h}:${s}:${l}:${scale}`;
  let cached = perSrc.get(cacheKey);
  if (cached) return cached;
  cached = build(srcCanvas, h, s, l, scale);
  perSrc.set(cacheKey, cached);
  return cached;
}

function build(srcCanvas, hueJ, satJ, lightJ, scale) {
  const W = srcCanvas.width;
  const H = srcCanvas.height;
  if (!W || !H) return srcCanvas;
  const blk = Math.max(1, scale | 0);
  const cols = Math.ceil(W / blk);
  const rows = Math.ceil(H / blk);
  let s = ((W * 31 + H) ^ (hueJ * 9973) ^ (satJ * 1597) ^ (lightJ * 31)) | 0 || 1;
  const rand = () => { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 0) % 1_000_003) / 1_000_003; };

  // Pre-sample one (h, s, l) offset per block.
  const blockOffsets = new Float32Array(cols * rows * 3);
  for (let i = 0; i < cols * rows; i++) {
    blockOffsets[i * 3]     = (rand() - 0.5) * 2 * (hueJ   / 360);  // h in 0..1 wrap
    blockOffsets[i * 3 + 1] = (rand() - 0.5) * 2 * (satJ   / 100);  // s delta
    blockOffsets[i * 3 + 2] = (rand() - 0.5) * 2 * (lightJ / 100) * 0.5; // l delta
  }

  const sctx = srcCanvas.getContext("2d", { willReadFrequently: true });
  const src  = sctx.getImageData(0, 0, W, H).data;
  const out  = new Uint8ClampedArray(src.length);

  for (let y = 0; y < H; y++) {
    const by = Math.floor(y / blk);
    for (let x = 0; x < W; x++) {
      const bx = Math.floor(x / blk);
      const bi = (by * cols + bx) * 3;
      const i = (y * W + x) * 4;
      const [hh, ss, ll] = rgbToHsl(src[i], src[i + 1], src[i + 2]);
      const nh = (hh + blockOffsets[bi]     + 1) % 1;
      const ns = clamp01(ss + blockOffsets[bi + 1]);
      const nl = clamp01(ll + blockOffsets[bi + 2]);
      const [r, g, b] = hslToRgb(nh, ns, nl);
      out[i]     = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = src[i + 3];
    }
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
