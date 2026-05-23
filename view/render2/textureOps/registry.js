import { applyAutoTileable }     from "./autoTileable/index.js";
import { applyBoundarySnap }     from "./boundarySnap/index.js";
import { applyEdgeColorAbsorb }  from "./edgeColorAbsorb/index.js";
import { applyColorAdjust }      from "./colorAdjust/index.js";
import { applyHslAdjust }        from "./hslAdjust/index.js";
import { applyHslJitter }        from "./hslJitter/index.js";
import { applyGaussianBlur }     from "./gaussianBlur/index.js";
import { applySharpen }          from "./sharpen/index.js";
import { applyInnerShadow }      from "./innerShadow/index.js";
import { applyNoiseOverlay }     from "./noiseOverlay/index.js";
import { applyGradientOverlay }  from "./gradientOverlay/index.js";

// Single source of truth for the per-pool bitmap pipeline. Add a new op =
// one entry here; state defaults, slotComposite chain, and texOpsPanel UI
// all read from this. Each control declares min/max/step/default so the
// registry doubles as schema for the auto-generated sliders.
//
// `apply(srcCanvas, poolKey, params)` is called in order; ops are
// responsible for cache/identity short-circuits internally.
// `category` field groups ops into collapsible sections in the panel.

// Visual order in panel. Ops are bucketed by category in UI; pipeline
// chain order still follows TEXTURE_OPS array order.
export const TEXTURE_OP_CATEGORIES = [
  { id: "edgeMatch",  label: "Edge match"    },
  { id: "edgeAccent", label: "Edge accent"   },
  { id: "color",      label: "Color / tonal" },
  { id: "detail",     label: "Detail"        },
  { id: "effects",    label: "Effects"       },
];

export const TEXTURE_OPS = [
  {
    name: "autoTileable",
    label: "Auto-tileable",
    category: "edgeMatch",
    apply: (c, k, p) => applyAutoTileable(c, k, p.width, p.mode, p.axis),
    controls: [
      {
        type: "slider", key: "width", label: "Width %",
        min: 0, max: 50, step: 1, default: 0,
        tooltip: "Width of the edge band that's blended with its mirrored/averaged counterpart, as a percentage of the shorter source dimension. 0 = no blend.",
      },
      {
        type: "select", key: "mode", label: "Mode", default: "mirror",
        options: [
          { value: "mirror",  label: "mirror"  },
          { value: "average", label: "average" },
        ],
        tooltip: "Mirror = each edge blends with mirrored other side (preserves local features). Average = each edge fades into per-pixel mean (smoother, more uniform).",
      },
      {
        type: "select", key: "axis", label: "Axis", default: "both",
        options: [
          { value: "both", label: "both"       },
          { value: "h",    label: "horizontal" },
          { value: "v",    label: "vertical"   },
        ],
        tooltip: "Which edge pairs to blend. Useful for non-square sources or when only one axis needs seamlessness.",
      },
    ],
  },
  {
    name: "boundarySnap",
    label: "Boundary snap",
    category: "edgeMatch",
    apply: (c, k, p) => applyBoundarySnap(c, k, p.width),
    controls: [
      {
        type: "slider", key: "width", label: "Width %",
        min: 0, max: 25, step: 1, default: 0,
        tooltip: "Force the outer N pixels on opposite edges to be pixel-exact identical (per-pixel mean), as a percentage of the shorter source dimension. Hard alternative to Auto-tileable.",
      },
    ],
  },
  {
    name: "edgeColorAbsorb",
    label: "Edge color absorb",
    category: "edgeMatch",
    apply: (c, k, p) => applyEdgeColorAbsorb(c, k, p.width, p.strength),
    controls: [
      { type: "slider", key: "width",    label: "Width %",    min: 0, max: 50,  step: 1, default: 0,
        tooltip: "Width of the inner band that fades into the source's border-average colour. % of shorter source dim." },
      { type: "slider", key: "strength", label: "Strength %", min: 0, max: 100, step: 1, default: 50,
        tooltip: "Peak absorption at the edge (0 = no change, 100 = full replace by border-average colour)." },
    ],
  },
  {
    name: "innerShadow",
    label: "Inner shadow",
    category: "edgeAccent",
    apply: (c, k, p) => applyInnerShadow(c, k, p.width, p.opacity, p.polarity),
    controls: [
      { type: "slider", key: "width",   label: "Width %",   min: 0, max: 50,  step: 1, default: 0,
        tooltip: "Band of the shadow/highlight, % of shorter source dim. 0 = off." },
      { type: "slider", key: "opacity", label: "Opacity %", min: 0, max: 100, step: 1, default: 50,
        tooltip: "Peak opacity at the edge, fading to 0 at band-inside." },
      { type: "select", key: "polarity", label: "Polarity", default: "dark",
        options: [
          { value: "dark",  label: "shadow (darken)" },
          { value: "light", label: "highlight (lighten)" },
        ],
        tooltip: "Darken inward (shadow) or lighten inward (inner glow)." },
    ],
  },
  {
    name: "colorAdjust",
    label: "RGB tonal",
    category: "color",
    apply: (c, k, p) => applyColorAdjust(c, k, p),
    controls: [
      { type: "slider", key: "brightness", label: "Brightness", min: -100, max: 100, step: 1, default: 0,
        tooltip: "Linear RGB shift. −100 = black, +100 = white." },
      { type: "slider", key: "contrast",   label: "Contrast",   min: -100, max: 100, step: 1, default: 0,
        tooltip: "Stretch/compress around midpoint 128. −100 = flat grey, +100 = max contrast." },
      { type: "slider", key: "gamma",      label: "Gamma %",    min: 25,   max: 400, step: 1, default: 100,
        tooltip: "Non-linear midtone curve. 100 = neutral, <100 brightens midtones, >100 darkens them." },
      { type: "slider", key: "red",        label: "Red",        min: -100, max: 100, step: 1, default: 0,
        tooltip: "Per-channel offset on red. Negative = remove red, positive = add red." },
      { type: "slider", key: "green",      label: "Green",      min: -100, max: 100, step: 1, default: 0,
        tooltip: "Per-channel offset on green." },
      { type: "slider", key: "blue",       label: "Blue",       min: -100, max: 100, step: 1, default: 0,
        tooltip: "Per-channel offset on blue." },
    ],
  },
  {
    name: "hslAdjust",
    label: "HSL adjust",
    category: "color",
    apply: (c, k, p) => applyHslAdjust(c, k, p),
    controls: [
      { type: "slider", key: "hue",        label: "Hue",        min: -180, max: 180, step: 1, default: 0,
        tooltip: "Rotate hue around the colour wheel (HSL H component). −180..+180 deg." },
      { type: "slider", key: "saturation", label: "Saturation", min: -100, max: 100, step: 1, default: 0,
        tooltip: "Scale HSL S component. −100 = greyscale, +100 = 2× boost." },
      { type: "slider", key: "lightness",  label: "Lightness",  min: -100, max: 100, step: 1, default: 0,
        tooltip: "Additive shift on HSL L. −100 = black, +100 = white." },
    ],
  },
  {
    name: "hslJitter",
    label: "HSL jitter",
    category: "color",
    apply: (c, k, p) => applyHslJitter(c, k, p.hue, p.saturation, p.lightness, p.scale),
    controls: [
      { type: "slider", key: "hue",        label: "Hue ±°",     min: 0, max: 180, step: 1, default: 0,
        tooltip: "Max random hue rotation per block (±degrees)." },
      { type: "slider", key: "saturation", label: "Sat ±%",     min: 0, max: 100, step: 1, default: 0,
        tooltip: "Max random saturation offset per block (±%)." },
      { type: "slider", key: "lightness",  label: "Light ±%",   min: 0, max: 100, step: 1, default: 0,
        tooltip: "Max random lightness offset per block (±%)." },
      { type: "slider", key: "scale",      label: "Scale px",   min: 1, max: 32,  step: 1, default: 4,
        tooltip: "Block size: 1 = per-pixel jitter, 32 = chunky regions sharing one offset." },
    ],
  },
  {
    name: "gaussianBlur",
    label: "Gaussian blur",
    category: "detail",
    apply: (c, k, p) => applyGaussianBlur(c, k, p.width),
    controls: [
      {
        type: "slider", key: "width", label: "Width %",
        min: 0, max: 25, step: 1, default: 0,
        tooltip: "Gaussian blur applied in a narrow band along all four edges, as % of shorter source dim. Softens leftover seams after Auto-tileable / Boundary snap without forcing edge match.",
      },
    ],
  },
  {
    name: "sharpen",
    label: "Sharpen",
    category: "detail",
    apply: (c, k, p) => applySharpen(c, k, p.amount, p.radius, p.threshold),
    controls: [
      { type: "slider", key: "amount",    label: "Amount %",  min: 0, max: 100, step: 1, default: 0,
        tooltip: "Unsharp-mask strength: enhances high-frequency detail. 0 = off, 100 = 2× residual." },
      { type: "slider", key: "radius",    label: "Radius px", min: 1, max: 5,   step: 1, default: 1,
        tooltip: "Blur radius for the unsharp mask. Bigger radius = wider sharpening halo." },
      { type: "slider", key: "threshold", label: "Threshold", min: 0, max: 50,  step: 1, default: 0,
        tooltip: "Only sharpen where local contrast exceeds this. Prevents amplifying flat-area noise." },
    ],
  },
  {
    name: "noiseOverlay",
    label: "Noise overlay",
    category: "effects",
    apply: (c, k, p) => applyNoiseOverlay(c, k, p.amount, p.type, p.scale),
    controls: [
      { type: "slider", key: "amount", label: "Amount %", min: 0, max: 100, step: 1, default: 0,
        tooltip: "Grain strength. 0 = none, 100 = ±127 max swing per channel." },
      { type: "select", key: "type",   label: "Type",     default: "mono",
        options: [
          { value: "mono",  label: "monochrome" },
          { value: "color", label: "color"      },
        ],
        tooltip: "Monochrome = same offset on R/G/B (luminance noise). Color = independent per-channel offsets." },
      { type: "slider", key: "scale",  label: "Scale px", min: 1, max: 8,   step: 1, default: 1,
        tooltip: "Block size for noise sampling. 1 = per-pixel, 8 = chunky 8×8 blocks." },
    ],
  },
  {
    name: "gradientOverlay",
    label: "Gradient overlay",
    category: "effects",
    apply: (c, k, p) => applyGradientOverlay(c, k, p.strength, p.direction, p.polarity),
    controls: [
      { type: "slider", key: "strength", label: "Strength %", min: 0, max: 100, step: 1, default: 0,
        tooltip: "Peak gradient effect at the far edge. 0 = off." },
      { type: "select", key: "direction", label: "Direction", default: "tb",
        options: [
          { value: "tb", label: "top → bottom" },
          { value: "lr", label: "left → right" },
          { value: "bt", label: "bottom → top" },
          { value: "rl", label: "right → left" },
        ],
        tooltip: "Axis of the gradient. Start = no change; end = full effect." },
      { type: "select", key: "polarity", label: "Polarity", default: "dark",
        options: [
          { value: "dark",  label: "darken" },
          { value: "light", label: "lighten" },
        ],
        tooltip: "Multiply toward black or lerp toward white." },
    ],
  },
];

// Build a fresh per-pool defaults bag from the registry.
export function buildOpDefaults() {
  const out = {};
  for (const op of TEXTURE_OPS) {
    out[op.name] = {};
    for (const ctrl of op.controls) out[op.name][ctrl.key] = ctrl.default;
  }
  return out;
}
