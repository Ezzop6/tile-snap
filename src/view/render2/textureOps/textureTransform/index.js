import { applyTextureTransformImpl } from "./impl.js";

export function applyTextureTransform(ctx, slot, poolKey, origin, viewSize) {
  return applyTextureTransformImpl(ctx, slot, poolKey, origin, viewSize);
}
