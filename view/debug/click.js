import { state } from "../../controller/state.js";
import { buildSlotGraph } from "../render2/buildSlotGraph.js";
import { showToast } from "../toast.js";
import { isAspectActive } from "../debugPanel.js";
import { pointToSegmentDistance } from "../../core/geometry.js";
import { dbgState } from "./state.js";
import {
  SLOT_SIZE, SLOT_SCALE, POINT_HIT_RADIUS, CONN_HIT_TOLERANCE,
  slotOrigin,
} from "./constants.js";

// Returns true if the click changed selection (caller should repaint).
export function onClick(e) {
  const t = state.template;
  if (!t || !dbgState.stage) return false;
  if (dbgState.stage.isPanning()) return false;
  const local = dbgState.stage.clientToContent(e.clientX, e.clientY);
  if (!local) return false;
  const x = local.x, y = local.y;

  const slot = slotAt(t, x, y);
  if (!slot) {
    dbgState.selected   = null;
    dbgState.lastReport = null;
    return true;
  }
  const origin = slotOrigin(slot);
  const graph = buildSlotGraph(slot);
  const localX = (x - origin.x) / SLOT_SCALE;
  const localY = (y - origin.y) / SLOT_SCALE;
  const hitR    = POINT_HIT_RADIUS   / SLOT_SCALE;
  const connTol = CONN_HIT_TOLERANCE / SLOT_SCALE;

  const point = findNearestPoint(graph, localX, localY, hitR);
  if (point) {
    dbgState.selected = { kind: "point", slotIndex: slot.index, entity: point };
    report(`[debug] POINT ${point.id} (slot #${slot.index})`,
           buildPointPayload(point, slot));
    return true;
  }

  const conn = findNearestConnection(graph, localX, localY, connTol);
  if (conn) {
    dbgState.selected = { kind: "connection", slotIndex: slot.index, entity: conn };
    report(`[debug] CONNECTION ${conn.id} (${conn.role}, ${conn.kind}, slot #${slot.index})`,
           buildConnectionPayload(conn, graph, slot));
    return true;
  }

  dbgState.selected = { kind: "slot", slotIndex: slot.index };
  report(`[debug] SLOT #${slot.index} (col ${slot.col}, row ${slot.row})`,
         buildSlotPayload(slot, graph, origin));
  return true;
}

// Header-button handler: re-emits whatever was selected last.
export function copyLastReport() {
  if (!dbgState.lastReport) {
    showToast("Nothing selected yet", { kind: "info" });
    return;
  }
  copyToClipboard(dbgState.lastReport.label, dbgState.lastReport.payload);
}

function report(label, payload) {
  dbgState.lastReport = { label, payload };
  copyToClipboard(label, payload);
}

// Aspect key a connection belongs to (mirrors drawGraph.layerKeyFor) so the
// copied set matches the drawn set.
function connAspectKey(conn) {
  if (conn.role === "merged-cut") return "role.merged";
  if (conn.role === "cut" && typeof conn.chainId === "string" && conn.chainId.startsWith("noise_")) {
    return "role.noise";
  }
  return `role.${conn.role}`;
}

// Point payload — core geometry always; the OPTIONAL fields are gated by the
// marker aspect that draws them, so what's copied == what's visible.
// compact = omit the redundant `slot` ref (used inside a slot snapshot).
function buildPointPayload(point, slot, compact = false) {
  const out = {
    id:         point.id,
    cornerType: point.cornerType,
    pos:        point.pos,
    basePos:    point.basePos,
    miterScale: point.miterScale,
    cutDegree:  point.cutDegree,
  };
  if (isAspectActive("marker.lockRing"))         out.lock          = point.lock;
  if (isAspectActive("decoration.outwardNormal")) out.outwardNormal = point.outwardNormal;
  if (isAspectActive("marker.endpointDot"))      out.chainEndpoint = point.chainEndpoint ?? false;
  if (!compact) out.slot = { index: slot.index, col: slot.col, row: slot.row };
  return out;
}

// Connection payload — geometry + curve always; interiorSide / chainId gated by
// their decoration aspect.
function buildConnectionPayload(conn, graph, slot, compact = false) {
  const from = graph.points.get(conn.from);
  const to   = graph.points.get(conn.to);
  const chordLen = from && to
    ? +Math.hypot(to.pos.x - from.pos.x, to.pos.y - from.pos.y).toFixed(3)
    : null;
  const out = {
    id:    conn.id,
    role:  conn.role,
    kind:  conn.kind,
    from:  from ? { id: conn.from, pos: from.pos, basePos: from.basePos, cornerType: from.cornerType } : { id: conn.from },
    to:    to   ? { id: conn.to,   pos: to.pos,   basePos: to.basePos,   cornerType: to.cornerType }   : { id: conn.to   },
    curve: conn.curve,
    chordLen,
  };
  if (isAspectActive("decoration.sideTick"))    out.interiorSide = conn.interiorSide;
  if (isAspectActive("decoration.chainOffset")) out.chainId      = conn.chainId;
  if (!compact) out.slot = { index: slot.index, col: slot.col, row: slot.row };
  return out;
}

// Slot snapshot — assembled from the SAME enabled aspects that draw, so the
// copied data is exactly what's visible in that slot. slot meta is the always-on
// header (which slot). Points / connections only for enabled aspects; overlays +
// dumps add their params when enabled.
function buildSlotPayload(slot, graph, origin) {
  const t = state.template;
  const out = {
    index:           slot.index,
    col:             slot.col,
    row:             slot.row,
    array:           slot.array,
    origin,
    terrainMode:     t?.terrainMode,
    gridKind:        t?.gridKind,
    connectedSaddle: t?.connectedSaddle === true,
  };

  const points = [];
  for (const p of graph.points.values()) {
    if (!isAspectActive(`corner.${p.cornerType}`)) continue;
    points.push(buildPointPayload(p, slot, true));
  }
  if (points.length) out.points = points;

  const connections = [];
  for (const conn of graph.connections.values()) {
    if (!isAspectActive(connAspectKey(conn))) continue;
    connections.push(buildConnectionPayload(conn, graph, slot, true));
  }
  if (connections.length) out.connections = connections;

  if (isAspectActive("overlay.noiseHoles") || isAspectActive("overlay.noisePatches")) {
    out.noiseParams = state.noiseParams;
  }
  if (isAspectActive("data.params")) {
    out.seed        = state.seed;
    out.globalCurve = state.globalCurve;
    out.noiseParams = state.noiseParams;
  }
  if (isAspectActive("data.graph"))        out.graph        = graph;
  if (isAspectActive("data.inflateDebug")) out.inflateDebug = graph._inflateDebug ?? null;

  return out;
}

function slotAt(template, x, y) {
  for (const slot of template.slots) {
    const o = slotOrigin(slot);
    if (x >= o.x && x < o.x + SLOT_SIZE && y >= o.y && y < o.y + SLOT_SIZE) {
      return slot;
    }
  }
  return null;
}

function findNearestPoint(graph, x, y, maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const p of graph.points.values()) {
    const d = Math.hypot(p.pos.x - x, p.pos.y - y);
    if (d <= bestDist) { bestDist = d; best = p; }
  }
  return best;
}

function findNearestConnection(graph, x, y, maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const conn of graph.connections.values()) {
    const a = graph.points.get(conn.from);
    const b = graph.points.get(conn.to);
    if (!a || !b) continue;
    const d = pointToSegmentDistance(x, y, a.pos.x, a.pos.y, b.pos.x, b.pos.y);
    if (d <= bestDist) { bestDist = d; best = conn; }
  }
  return best;
}

function copyToClipboard(label, payload) {
  try {
    const json = JSON.stringify({ label, payload }, replacer(), 2);
    navigator.clipboard?.writeText(json).catch((err) => {
      showToast(`Clipboard write failed: ${err.message ?? err}`, { kind: "error" });
    });
  } catch (err) {
    showToast(`Serialize failed: ${err.message ?? err}`, { kind: "error" });
  }
}

// Flattens Maps/Sets and breaks cycles so graph payloads survive
// JSON.stringify.
function replacer() {
  const seen = new WeakSet();
  return function (_key, value) {
    if (value instanceof Map) {
      const out = {};
      for (const [k, v] of value) out[k] = v;
      return out;
    }
    if (value instanceof Set) return [...value];
    if (value && typeof value === "object") {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    }
    return value;
  };
}
