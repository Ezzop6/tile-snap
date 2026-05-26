import { applyColorAdjustImpl } from "./impl.js";

export function applyColorAdjust(srcCanvas, poolKey, params) {
  return applyColorAdjustImpl(srcCanvas, poolKey, params);
}
