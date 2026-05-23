import { applySharpenImpl } from "./impl.js";

export function applySharpen(srcCanvas, poolKey, amount, radius, threshold) {
  return applySharpenImpl(srcCanvas, poolKey, amount, radius, threshold);
}
