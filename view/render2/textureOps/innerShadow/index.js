import { applyInnerShadowImpl } from "./impl.js";

export function applyInnerShadow(srcCanvas, poolKey, width, opacity, polarity) {
  return applyInnerShadowImpl(srcCanvas, poolKey, width, opacity, polarity);
}
