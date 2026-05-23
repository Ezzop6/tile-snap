// Source-pattern cell tint. Faint blue background showing which cells of
// slot.array are filled — the "intent" reference under the actual rendered
// cut. Independent of any graph ops; reads slot.array directly.

const TINT = "rgba(59, 158, 255, 0.22)";

export function drawCellPattern(ctx, slot, origin, size) {
  const pattern = slot.array;
  if (!pattern?.length || !pattern[0]?.length) return;
  const rows  = pattern.length;
  const cols  = pattern[0].length;
  const cellW = size / cols;
  const cellH = size / rows;
  ctx.save();
  ctx.fillStyle = TINT;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v  = pattern[r][c];
      const on = Array.isArray(v) ? v.some((x) => x) : !!v;
      if (!on) continue;
      ctx.fillRect(origin.x + c * cellW, origin.y + r * cellH, cellW, cellH);
    }
  }
  ctx.restore();
}
