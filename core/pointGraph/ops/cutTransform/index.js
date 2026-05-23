import { cutTransformImpl } from "./impl.js";

// Single + dual share one impl today. Re-introduce single.js / dual.js +
// per-kind branching here if/when behaviour diverges.
export function cutTransform(graph, opts) {
  return cutTransformImpl(graph, opts);
}
