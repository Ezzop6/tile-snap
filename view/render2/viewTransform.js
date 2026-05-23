import { REFERENCE_SLOT_SIZE } from "./buildSlotGraph.js";

export function viewScale(viewSize) {
  return viewSize / REFERENCE_SLOT_SIZE;
}

// Apply slot origin + ref→view scale so the renderer body can draw
// in REFERENCE coords (0..REFERENCE_SLOT_SIZE). Returns scale so the
// caller can compensate stroke widths (lineWidth = px / scale).
export function withSlotTransform(ctx, origin, viewSize, fn) {
  const scale = viewSize / REFERENCE_SLOT_SIZE;
  ctx.save();
  ctx.translate(origin.x, origin.y);
  ctx.scale(scale, scale);
  try { fn(scale); } finally { ctx.restore(); }
}
