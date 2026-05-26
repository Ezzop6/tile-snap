import { assignChainIdsSplit }  from "./split.js";
import { assignChainIdsBridge } from "./bridge.js";

export function assignChainIds(graph, opts = {}) {
  if (opts.connectedSaddle === true) assignChainIdsBridge(graph);
  else                                assignChainIdsSplit(graph);
}
