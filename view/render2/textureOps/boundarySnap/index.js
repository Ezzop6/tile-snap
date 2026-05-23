import { applyBoundarySnapImpl } from "./impl.js";

export function applyBoundarySnap(srcCanvas, poolKey, width) {
  return applyBoundarySnapImpl(srcCanvas, poolKey, width);
}
