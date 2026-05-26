import { waveImpl } from "./impl.js";

// Single + dual share one impl today. Re-introduce single.js / dual.js +
// per-kind branching here if/when behaviour diverges.
export function wave(graph, opts) {
  return waveImpl(graph, opts);
}
