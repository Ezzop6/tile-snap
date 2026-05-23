import { applyAutoTileableImpl } from "./impl.js";

export function applyAutoTileable(srcCanvas, poolKey, width, mode, axis) {
  return applyAutoTileableImpl(srcCanvas, poolKey, width, mode, axis);
}
