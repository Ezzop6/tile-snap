import { applyGradientOverlayImpl } from "./impl.js";

export function applyGradientOverlay(srcCanvas, poolKey, strength, direction, polarity) {
  return applyGradientOverlayImpl(srcCanvas, poolKey, strength, direction, polarity);
}
