// Union cuts that share a 2-cut point; saddles (4-cut) stay split for diagonal-pair fills.
export function assignChainIdsSplit(graph) {
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

  for (const conn of graph.connections.values()) {
    if (conn.role === "cut") conn.chainId = find(conn.id);
  }

  for (const point of graph.points.values()) {
    const cuts = cutsByPoint.get(point.id);
    point.cutDegree     = cuts ? cuts.length : 0;
    point.chainEndpoint = point.cutDegree === 1;
  }
}
