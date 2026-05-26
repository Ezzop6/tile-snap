// Shared tile-resolution picker options — used by the Sources resolution
// select (per project, with "Auto") and the bundle resolution override (forced
// value, no "Auto"). Single source of truth for the preset list + option HTML.

export const RESOLUTION_PRESETS = [16, 32, 48, 64, 96, 128, 256];

// <option> HTML for a resolution <select>. `current` = selected px (null =
// auto / unset). When `autoValue` is a number, prepends an "Auto (N px)" option
// (selected when current is null); pass null for no auto option. A non-preset
// `current` is added so loaded odd values still show.
export function resolutionOptions(current, autoValue) {
  const sizes = (current == null || RESOLUTION_PRESETS.includes(current))
    ? RESOLUTION_PRESETS
    : [...RESOLUTION_PRESETS, current].sort((a, b) => a - b);
  const opts = [];
  if (autoValue != null) {
    opts.push(`<option value=""${current == null ? " selected" : ""}>Auto (${autoValue} px)</option>`);
  }
  for (const n of sizes) {
    opts.push(`<option value="${n}"${current === n ? " selected" : ""}>${n} px</option>`);
  }
  return opts.join("");
}
