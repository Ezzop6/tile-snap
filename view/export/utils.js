export function formatNum(n) {
  return (Math.round(n * 10) / 10).toString();
}

// Re-export so existing `import { clamp } from "./utils.js"` callers keep working.
export { clamp } from "../../core/math.js";
