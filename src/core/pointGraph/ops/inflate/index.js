import { inflateClipper } from "./clipper.js";

// Polygon offset via Clipper. Single + dual graphs share one code path —
// the polygon is built from chain + closure conns regardless of grid kind.
export function inflate(graph, distance) {
  return inflateClipper(graph, distance);
}
