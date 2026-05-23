// Like split, plus bridges 4-cut saddles by pairing cuts that share an empty corner side.
export function assignChainIdsBridge(graph) {
  const parent = new Map();
  for (const conn of graph.connections.values()) {
    if (conn.role === "cut") parent.set(conn.id, conn.id);
    else conn.chainId = null;
  }
  const find = (id) => {
    let r = id;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(id) !== r) {
      const next = parent.get(id);
      parent.set(id, r);
      id = next;
    }
    return r;
  };
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const cutsByPoint = new Map();
  for (const conn of graph.connections.values()) {
    if (conn.role !== "cut") continue;
    for (const pid of [conn.from, conn.to]) {
      let arr = cutsByPoint.get(pid);
      if (!arr) { arr = []; cutsByPoint.set(pid, arr); }
      arr.push(conn.id);
    }
  }
  for (const cuts of cutsByPoint.values()) {
    if (cuts.length === 2) union(cuts[0], cuts[1]);
  }

  const pattern = graph.meta.pattern;
  if (pattern) {
    for (const [pid, cuts] of cutsByPoint) {
      if (cuts.length !== 4) continue;
      bridgeSaddle(graph, pid, cuts, pattern, union);
    }
  }

  for (const conn of graph.connections.values()) {
    if (conn.role === "cut") conn.chainId = find(conn.id);
  }

  for (const point of graph.points.values()) {
    const cuts = cutsByPoint.get(point.id);
    point.cutDegree     = cuts ? cuts.length : 0;
    point.chainEndpoint = point.cutDegree === 1;
  }
}

function bridgeSaddle(graph, pid, cuts, pattern, union) {
  const [, rsStr, csStr] = pid.split("_");
  const rs = Number(rsStr);
  const cs = Number(csStr);

  const cellAt = (r, c) =>
    (r < 0 || r >= pattern.length || c < 0 || c >= pattern[0].length)
      ? 0
      : (Array.isArray(pattern[r][c]) ? (pattern[r][c].some((x) => x) ? 1 : 0)
                                       : (pattern[r][c] ? 1 : 0));
  const nw = cellAt(rs - 1, cs - 1);
  const ne = cellAt(rs - 1, cs);
  const sw = cellAt(rs,     cs - 1);
  const se = cellAt(rs,     cs);

  const dirOf = new Map();
  for (const cutId of cuts) {
    const conn = graph.connections.get(cutId);
    const otherId = (conn.from === pid) ? conn.to : conn.from;
    const [, roStr, coStr] = otherId.split("_");
    const ro = Number(roStr), co = Number(coStr);
    if      (ro < rs) dirOf.set(cutId, "N");
    else if (ro > rs) dirOf.set(cutId, "S");
    else if (co < cs) dirOf.set(cutId, "W");
    else              dirOf.set(cutId, "E");
  }

  // Pair by EMPTY corner side; see dual/assignChainIds/bridge.js for rationale.
  let pairA, pairB;
  if (nw && se && !ne && !sw) {
    pairA = cuts.filter((id) => dirOf.get(id) === "N" || dirOf.get(id) === "E");
    pairB = cuts.filter((id) => dirOf.get(id) === "S" || dirOf.get(id) === "W");
  } else if (ne && sw && !nw && !se) {
    pairA = cuts.filter((id) => dirOf.get(id) === "N" || dirOf.get(id) === "W");
    pairB = cuts.filter((id) => dirOf.get(id) === "S" || dirOf.get(id) === "E");
  } else {
    return;
  }

  if (pairA.length === 2) union(pairA[0], pairA[1]);
  if (pairB.length === 2) union(pairB[0], pairB[1]);
}
