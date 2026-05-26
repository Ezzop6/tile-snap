// aSideLabel/bSideLabel = caller's "this side" labels relative to
// traversal direction (H edges: above=left; V edges: left=right
// in y-down screen coords). Null for internal connections.
export function sideOf(role, a, b, aSideLabel, bSideLabel) {
  if (role !== "cut" && role !== "closure") return null;
  if (a === 1) return aSideLabel;
  if (b === 1) return bSideLabel;
  return null;
}
