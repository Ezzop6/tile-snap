import { applyNoiseOverlayImpl } from "./impl.js";

export function applyNoiseOverlay(srcCanvas, poolKey, amount, type, scale) {
  return applyNoiseOverlayImpl(srcCanvas, poolKey, amount, type, scale);
}
