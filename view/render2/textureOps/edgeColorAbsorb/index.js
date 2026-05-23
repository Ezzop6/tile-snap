import { applyEdgeColorAbsorbImpl } from "./impl.js";

export function applyEdgeColorAbsorb(srcCanvas, poolKey, width, strength) {
  return applyEdgeColorAbsorbImpl(srcCanvas, poolKey, width, strength);
}
