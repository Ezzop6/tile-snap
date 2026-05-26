import { buildPointGraph as buildImpl } from "./buildPointGraph.js";

// Single + dual share one impl today. gridKind ("single" | "dual") is passed
// through as graph.meta.kind so downstream ops can dispatch. Reintroduce
// single/ and dual/ subdirs with a per-kind branch here if/when build
// behaviour diverges. connectedSaddle is independent of gridKind — both
// pipelines handle both saddle modes via assignChainIds.
export function buildPointGraph(slot, slotSize, origin, opts = {}) {
  return buildImpl(slot, slotSize, origin, {
    kind:               opts.gridKind === "dual" ? "dual" : "single",
    connectedSaddle:    opts.connectedSaddle === true,
    saddleBridgeOffset: opts.saddleBridgeOffset,
  });
}
