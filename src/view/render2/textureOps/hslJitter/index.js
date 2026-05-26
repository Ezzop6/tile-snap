import { applyHslJitterImpl } from "./impl.js";

export function applyHslJitter(srcCanvas, poolKey, hueJ, satJ, lightJ, scale) {
  return applyHslJitterImpl(srcCanvas, poolKey, hueJ, satJ, lightJ, scale);
}
