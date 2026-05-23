// Colour utilities used by the .tres terrain swatch picker and by future
// per-source brightness / contrast / colour-ramp ops. Pure functions —
// no state, no DOM (except a transient 2D context for centre-pixel
// sampling in inverseColorOfTile).

export const FALLBACK_COLOR = "0.5, 0.5, 0.5, 1";

// Picks a high-contrast swatch derived from the tile's centre pixel:
//   - hue rotated 180° (= complementary)
//   - saturation forced to max (= vivid, doesn't blend with muted textures)
//   - lightness flipped (dark texture → bright swatch, light → dark)
// Pure RGB inversion was too muddy for desaturated textures; HSL gives a
// reliably contrasting marker.
export function inverseColorOfTile(input, tileCol, tileRow) {
  const tile = input?.tiles?.find((t) => t.col === tileCol && t.row === tileRow)
            || input?.tiles?.[0];
  const canvas = tile?.canvas || input?.source?.canvas;
  if (!canvas) return `Color(${FALLBACK_COLOR})`;
  try {
    // willReadFrequently hint silences Canvas2D readback warning. Single
    // getImageData call but the canvas may be reused across exports.
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const cx = canvas.width  >> 1;
    const cy = canvas.height >> 1;
    const d = ctx.getImageData(cx, cy, 1, 1).data;
    const { h, l } = rgbToHsl(d[0], d[1], d[2]);
    const newH = (h + 0.5) % 1;       // complementary
    const newS = 1.0;                  // max saturation
    const newL = l > 0.5 ? 0.18 : 0.78; // strong lightness contrast
    const [r, g, b] = hslToRgb(newH, newS, newL);
    return `Color(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)}, 1)`;
  } catch (err) {
    console.warn("[colorHelpers] inverseColorOfTile failed:", err);
    return `Color(${FALLBACK_COLOR})`;
  }
}

// 8-bit RGB → HSL (h, s, l all in 0..1). Used by inverseColorOfTile +
// upcoming colour-ramp texture op (samples LUT by lightness).
export function rgbToHsl(r8, g8, b8) {
  const r = r8 / 255, g = g8 / 255, b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if      (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else                h = (r - g) / d + 4;
    h /= 6;
  }
  return { h, s, l };
}

// HSL → linear RGB (each channel 0..1). Pair with rgbToHsl for HSL
// adjustment passes (hue rotate, saturation push, ramp remap, …).
export function hslToRgb(h, s, l) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueToRgb(p, q, h + 1/3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1/3)];
}

function hueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1/6) return p + (q - p) * 6 * t;
  if (t < 1/2) return q;
  if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
  return p;
}
