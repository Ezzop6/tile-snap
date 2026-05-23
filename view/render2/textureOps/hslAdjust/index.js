import { applyHslAdjustImpl } from "./impl.js";

export function applyHslAdjust(srcCanvas, poolKey, params) {
  return applyHslAdjustImpl(srcCanvas, poolKey, params);
}
