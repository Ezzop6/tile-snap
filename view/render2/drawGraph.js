import { arcControlPoint, CORNER_COLOR } from "../../core/pointGraph/render.js";

const DEFAULTS = {
  cutColor:        "#ff5555",
  noiseCutColor:   "#cc88ff",
  mergedCutColor:  "#ff9933",
  closureColor:    "#3b9eff",
  internalColor:   "#444",
  cutWidth:      2,
  closureWidth:  1.25,
  internalWidth: 0.75,
  // Outer kind = slot-perimeter edges; dashed so they read as "frame"
  // without losing role colour.
  outerKindDash: [3, 2],
  outerRingRadius:   5,
  outerRingWidth:    1.4,
  innerRingRadius:   3,
  innerRingWidth:    1.2,
  endpointDotRadius: 1.5,
  branchSquareHalf:  2,
  normalLength:  8,
  normalColor:   "rgba(255, 255, 255, 0.45)",
  showNormals:   true,
  // Chain hue is rendered as a PARALLEL OFFSET, not as a stroke
  // replacement, so the main role colour stays readable.
  chainColors:   true,
  chainOffset:   3,
  chainStroke:   1,
  sideTickLength: 4,
  sideTickColor:  "rgba(255, 255, 255, 0.55)",
  // Below this segment length (px in canvas-logical space) skip chain
  // offset + side tick — wave subdivision produces dense short segments.
  shortSegMin:    8,
  showInternal:  true,
  showPoints:    true,
};

export function drawGraph(ctx, graph, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (!ctx || !graph) return;
  const layerOn = (key) => (o.layers ? o.layers[key] !== false : true);

  ctx.save();
  ctx.lineCap  = "round";
  ctx.lineJoin = "round";

  for (const conn of graph.connections.values()) {
    const roleKey = layerKeyFor(conn);
    if (!layerOn(roleKey)) continue;
    drawConnection(ctx, graph, conn, o, layerOn);
  }

  // Original corner points (edge-midpoint, outer-convex, …) keep their
  // internal connections but lose their cut/closure adjacency once
  // wave / cornerSoften absorbs the chain — drawing their rings leaves
  // orphan markers floating off the path. Skip ring + normal for any
  // non-structural point with no visible adjacency.
  const visibleAdj = visibleAdjacencyIds(graph);

  if (layerOn("decoration.outwardNormal")) {
    for (const point of graph.points.values()) {
      if (isOrphaned(point, visibleAdj)) continue;
      drawNormal(ctx, point, o);
    }
  }

  for (const point of graph.points.values()) {
    if (isOrphaned(point, visibleAdj)) continue;
    drawPoint(ctx, point, o, layerOn);
  }

  ctx.restore();
}

// Maps each connection to its own layer key so original cuts, noise
// contour chains, and boolean-merge results can be toggled independently.
function layerKeyFor(conn) {
  if (conn.role === "merged-cut") return "role.merged";
  if (conn.role === "cut" && typeof conn.chainId === "string" && conn.chainId.startsWith("noise_")) {
    return "role.noise";
  }
  return `role.${conn.role}`;
}

const STRUCTURAL_POINTS = new Set(["exterior", "interior"]);

function isOrphaned(point, visibleAdj) {
  if (STRUCTURAL_POINTS.has(point.cornerType)) return false;
  return !visibleAdj.has(point.id);
}

function visibleAdjacencyIds(graph) {
  const s = new Set();
  for (const conn of graph.connections.values()) {
    if (conn.role !== "cut" && conn.role !== "closure") continue;
    s.add(conn.from);
    s.add(conn.to);
  }
  return s;
}

function drawConnection(ctx, graph, conn, o, layerOn) {
  const a = graph.points.get(conn.from);
  const b = graph.points.get(conn.to);
  if (!a || !b) return;

  ctx.save();
  ctx.strokeStyle = roleStrokeColor(conn, o);
  ctx.lineWidth   = strokeWidthFor(conn, o);
  if (conn.kind === "outer" && layerOn("kindOuterDash")) ctx.setLineDash(o.outerKindDash);
  strokeCurvePath(ctx, a.pos, b.pos, conn.curve);
  ctx.restore();

  // Wave subdivides cuts into short segments (~3px); chain offset
  // and side tick on every one collapses into solid noise. Skip
  // those decorations when the segment is too short to read.
  const segLen = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y);
  const shortSeg = segLen < o.shortSegMin;

  if (!shortSeg && conn.role === "cut" && conn.chainId != null && layerOn("decoration.chainOffset")) {
    const off = perpendicularOffset(a.pos, b.pos, conn.interiorSide, o.chainOffset);
    ctx.save();
    ctx.translate(off.x, off.y);
    ctx.strokeStyle = chainColor(conn.chainId);
    ctx.lineWidth   = o.chainStroke;
    strokeCurvePath(ctx, a.pos, b.pos, conn.curve);
    ctx.restore();
  }

  if (!shortSeg && conn.interiorSide && (conn.role === "cut" || conn.role === "closure") && layerOn("decoration.sideTick")) {
    drawSideTick(ctx, a.pos, b.pos, conn.interiorSide, o);
  }
}

function strokeCurvePath(ctx, a, b, curve) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  switch (curve?.type) {
    case "bezier": {
      const h1 = curve.h1, h2 = curve.h2;
      ctx.bezierCurveTo(
        a.x + h1.x, a.y + h1.y,
        b.x + h2.x, b.y + h2.y,
        b.x, b.y,
      );
      break;
    }
    case "arc": {
      const ctrl = arcControlPoint(a, b, curve);
      ctx.quadraticCurveTo(ctrl.x, ctrl.y, b.x, b.y);
      break;
    }
    case "line":
    default:
      ctx.lineTo(b.x, b.y);
      break;
  }
  ctx.stroke();
}

// Clockwise 90° rotation in y-down screen coords: (dx,dy) → (-dy,dx).
// "right" of east-bound traversal = south (= positive y).
function perpendicularOffset(a, b, side, dist) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: 0, y: 0 };
  let px = -dy / len * dist;
  let py =  dx / len * dist;
  if (side === "left") { px = -px; py = -py; }
  return { x: px, y: py };
}

function drawSideTick(ctx, a, b, side, o) {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const off = perpendicularOffset(a, b, side, o.sideTickLength);
  ctx.save();
  ctx.strokeStyle = o.sideTickColor;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(mid.x, mid.y);
  ctx.lineTo(mid.x + off.x, mid.y + off.y);
  ctx.stroke();
  ctx.restore();
}

function drawPoint(ctx, point, o, layerOn) {
  const { x, y } = point.pos;
  const cornerKey = `corner.${point.cornerType}`;
  const cornerVisible = layerOn(cornerKey);

  // Dense path-interior vertices (wave + noise loops) → 2px dot; full
  // ring markers would drown out the actual cut path.
  if (point.cornerType === "wave-vertex" || point.cornerType === "noise-vertex") {
    if (!cornerVisible) return;
    ctx.fillStyle = CORNER_COLOR[point.cornerType];
    ctx.fillRect(x - 1, y - 1, 2, 2);
    return;
  }

  if (cornerVisible) {
    ctx.strokeStyle = CORNER_COLOR[point.cornerType] || "#888";
    ctx.lineWidth   = o.outerRingWidth;
    ctx.beginPath();
    ctx.arc(x, y, o.outerRingRadius, 0, Math.PI * 2);
    ctx.stroke();
  }

  const locked = point.lock?.x || point.lock?.y || point.lock?.rotation;
  if (locked && layerOn("marker.lockRing")) {
    ctx.strokeStyle = "#000";
    ctx.lineWidth   = o.innerRingWidth;
    ctx.beginPath();
    ctx.arc(x, y, o.innerRingRadius, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (point.chainEndpoint && layerOn("marker.endpointDot")) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x, y, o.endpointDotRadius, 0, Math.PI * 2);
    ctx.fill();
  } else if (point.cutDegree >= 3 && layerOn("marker.branchSquare")) {
    const h = o.branchSquareHalf;
    ctx.fillStyle = "#fff";
    ctx.fillRect(x - h, y - h, h * 2, h * 2);
  }
}

function drawNormal(ctx, point, o) {
  const n = point.outwardNormal;
  if (!n) return;
  // Wave-vertex keeps its normal for downstream noise op but the
  // arrows would clutter the cut path (N=16 per cut).
  if (point.cornerType === "wave-vertex") return;
  ctx.save();
  ctx.strokeStyle = o.normalColor;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(point.pos.x, point.pos.y);
  ctx.lineTo(point.pos.x + n.x * o.normalLength, point.pos.y + n.y * o.normalLength);
  ctx.stroke();
  ctx.restore();
}

function roleStrokeColor(conn, o) {
  if (conn.role === "merged-cut") return o.mergedCutColor;
  if (conn.role === "cut" && typeof conn.chainId === "string" && conn.chainId.startsWith("noise_")) {
    return o.noiseCutColor;
  }
  switch (conn.role) {
    case "cut":      return o.cutColor;
    case "closure":  return o.closureColor;
    default:         return o.internalColor;
  }
}

function strokeWidthFor(conn, o) {
  switch (conn.role) {
    case "cut":        return o.cutWidth;
    case "merged-cut": return o.cutWidth;
    case "closure":    return o.closureWidth;
    default:           return o.internalWidth;
  }
}

// Golden-angle hue per chainId string. Same string in → same hue out.
function chainColor(chainId) {
  let h = 0;
  for (let i = 0; i < chainId.length; i++) {
    h = (h * 31 + chainId.charCodeAt(i)) | 0;
  }
  const hue = ((h * 137.508) % 360 + 360) % 360;
  return `hsl(${hue.toFixed(0)}, 80%, 62%)`;
}
