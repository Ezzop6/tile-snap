import { isLayerActive } from "../debugPanel.js";
import { drawNoiseOverlay as drawNoiseOverlayShared } from "../render2/noiseOverlay.js";
import { SLOT_SIZE } from "./constants.js";

// Cell tint draws under everything else: marks which cells of the slot
// pattern are "on" (filled) so the user can correlate cut geometry with
// the source pattern at a glance.
export function drawSlotCellTints(ctx, slot, origin) {
  const pattern = slot.array;
  if (!pattern?.length || !pattern[0]?.length) return;
  const rows = pattern.length;
  const cols = pattern[0].length;
  const cellW = SLOT_SIZE / cols;
  const cellH = SLOT_SIZE / rows;
  ctx.save();
  ctx.fillStyle = "rgba(59, 158, 255, 0.22)";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = pattern[r][c];
      const on = Array.isArray(v) ? v.some((x) => x) : !!v;
      if (!on) continue;
      ctx.fillRect(origin.x + c * cellW, origin.y + r * cellH, cellW, cellH);
    }
  }
  ctx.restore();
}

// Wires the shared overlay renderer to debug's per-side layer toggles.
export function drawNoiseOverlay(ctx, slot, graph, origin, viewSize) {
  drawNoiseOverlayShared(ctx, slot, graph, origin, viewSize, (side) => {
    return isLayerActive(side === "holes" ? "overlay.noiseHoles" : "overlay.noisePatches");
  });
}
