import { state } from "../../../../controller/state.js";

// Per-slot, per-pool D4 transform of the texture bitmap. Applied around
// the slot centre so the rendered tile stays inside its bounds.
export function applyTextureTransformImpl(ctx, slot, poolKey, origin, viewSize) {
  if (slot?.index == null) return;
  const tx = state.getSlotTextureTransform(slot.index, poolKey);
  if (!tx || (tx.rotate === 0 && !tx.flipH)) return;
  const cx = origin.x + viewSize / 2;
  const cy = origin.y + viewSize / 2;
  ctx.translate(cx, cy);
  if (tx.flipH) ctx.scale(-1, 1);
  if (tx.rotate) ctx.rotate(tx.rotate * Math.PI / 2);
  ctx.translate(-cx, -cy);
}
