// Rendering metadata for PointGraph: pure data + pure math, no DOM.
// Canvas drawing lives in view/render2/drawGraph.js.

// edge-midpoint is green (not sky-blue) to avoid blending with the
// cell-tint rgba(59,158,255,0.22) on filled cells.
export const CORNER_COLOR = {
  "outer-convex":   "#ffd400",
  "outer-concave":  "#ff8800",
  "edge-midpoint":  "#44dd88",
  "saddle":         "#ff00aa",
  "bridge-corner":  "#9a6cff",
  "soften-vertex":  "#00ccdd",
  "wave-vertex":    "#88ff66",
  "noise-vertex":   "#cc88ff",
  "merged-vertex":  "#ff9933",
  "interior":       "#3a3a3a",
  "exterior":       "#222",
};

export const CORNER_LABEL = {
  "outer-convex":   "outer convex — 90° (1 cell on)",
  "edge-midpoint":  "edge midpoint — 180° flat (2 adjacent on)",
  "outer-concave":  "outer concave — 270° reflex (3 cells on)",
  "saddle":         "saddle — 2× 90° touching (2 diagonal on)",
  "bridge-corner":  "bridge corner — saddle split into 2 vertices per chain",
  "soften-vertex":  "soften vertex — corner cut into 2 + chord/arc (chamfer↔round blend)",
  "wave-vertex":    "wave vertex — sine displacement along cut",
  "noise-vertex":   "noise vertex — island contour traced from noise mask",
  "merged-vertex":  "merged vertex — boolean of curve cut ± noise islands",
  "interior":       "interior — no corner (4 on)",
  "exterior":       "exterior — no corner (0 on)",
};

export const ROLE_COLOR = {
  cut:      "#ff5555",
  closure:  "#3b9eff",
  internal: "#444",
};

// curve.bowProportion = perpendicular bow as fraction of chord length, signed
// in the direction perpendicular-CCW of conn.from → conn.to. Pass reversed=true
// when the walk traverses the connection in reverse (a corresponds to conn.to)
// so the bow side flips to match — otherwise the arc renders on the opposite
// side of the chord.
export function arcControlPoint(a, b, curve, reversed = false) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { x: a.x, y: a.y };
  const px = -dy / len;
  const py =  dx / len;
  const sign = reversed ? -1 : 1;
  const bow = (curve.bowProportion ?? 0) * len * sign;
  return { x: (a.x + b.x) / 2 + px * bow, y: (a.y + b.y) / 2 + py * bow };
}
