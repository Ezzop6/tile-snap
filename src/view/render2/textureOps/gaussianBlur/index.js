import { applyGaussianBlurImpl } from "./impl.js";

export function applyGaussianBlur(srcCanvas, poolKey, width) {
  return applyGaussianBlurImpl(srcCanvas, poolKey, width);
}
