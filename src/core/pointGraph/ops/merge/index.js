import { mergeImpl } from "./impl.js";

// Single + dual share one impl today. Re-introduce single.js / dual.js +
// per-kind branching here if/when behaviour diverges.
export function merge(graph, opts) {
  return mergeImpl(graph, opts);
}
