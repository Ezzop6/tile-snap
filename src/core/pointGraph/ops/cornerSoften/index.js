import { cornerSoftenImpl } from "./impl.js";

// Single + dual share one impl today. Re-introduce single.js / dual.js +
// per-kind branching here if/when behaviour diverges.
export function cornerSoften(graph, opts) {
  return cornerSoftenImpl(graph, opts);
}
