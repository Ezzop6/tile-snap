// Random grain. `amount` 0..100 ⇒ ±strength applied per noise sample.
//   type "mono"  — same offset on R/G/B (luminance noise, no hue shift)
//   type "color" — independent offsets on each channel
// `scale` 1..8 = block size in pixels: every scale×scale block shares
// one sample → chunky noise at higher values. Seed deterministic per
// (W, H, amount, type, scale). Cached.

const _cache = new WeakMap();

export function applyNoiseOverlayImpl(srcCanvas, poolKey, amount, type = "mono", scale = 1) {
  if (!srcCanvas || !amount || amount <= 0) return srcCanvas;
  let perSrc = _cache.get(srcCanvas);
  if (!perSrc) { perSrc = new Map(); _cache.set(srcCanvas, perSrc); }
  const cacheKey = `${poolKey}:${amount}:${type}:${scale}`;
  let cached = perSrc.get(cacheKey);
  if (cached) return cached;
  cached = buildNoisy(srcCanvas, amount, type, scale);
  perSrc.set(cacheKey, cached);
  return cached;
}

function buildNoisy(srcCanvas, amount, type, scale) {
  const W = srcCanvas.width;
  const H = srcCanvas.height;
  if (!W || !H) return srcCanvas;

  const sctx = srcCanvas.getContext("2d", { willReadFrequently: true });
  const src  = sctx.getImageData(0, 0, W, H).data;
  const out  = new Uint8ClampedArray(src.length);
  const strength = (amount / 100) * 127;
  const blk = Math.max(1, scale | 0);
  const isColor = type === "color";

  // Pre-generate noise grid (W/blk × H/blk) once, then sample per pixel.
  const cols = Math.ceil(W / blk);
  const rows = Math.ceil(H / blk);
  let s = ((W * 31 + H) ^ ((amount | 0) * 9973) ^ (blk * 17) ^ (isColor ? 31337 : 1)) | 0 || 1;
  const rand = () => { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 0) % 1_000_003) / 1_000_003; };
  const channels = isColor ? 3 : 1;
  const noise = new Float32Array(cols * rows * channels);
  for (let i = 0; i < noise.length; i++) noise[i] = (rand() - 0.5) * 2 * strength;

  for (let y = 0; y < H; y++) {
    const by = Math.floor(y / blk);
    for (let x = 0; x < W; x++) {
      const bx = Math.floor(x / blk);
      const ni = (by * cols + bx) * channels;
      const i  = (y * W + x) * 4;
      if (isColor) {
        out[i]     = src[i]     + noise[ni];
        out[i + 1] = src[i + 1] + noise[ni + 1];
        out[i + 2] = src[i + 2] + noise[ni + 2];
      } else {
        const n = noise[ni];
        out[i]     = src[i]     + n;
        out[i + 1] = src[i + 1] + n;
        out[i + 2] = src[i + 2] + n;
      }
      out[i + 3] = src[i + 3];
    }
  }

  const outCanvas = document.createElement("canvas");
  outCanvas.width = W; outCanvas.height = H;
  outCanvas.getContext("2d", { willReadFrequently: true }).putImageData(new ImageData(out, W, H), 0, 0);
  return outCanvas;
}
