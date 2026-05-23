import { state } from "../../controller/state.js";
import { buildSlotGraph } from "../render2/buildSlotGraph.js";
import { showToast } from "../toast.js";
import { filterPayload } from "../debugPanel.js";
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
    report("point",
           `[debug] POINT ${point.id} (slot #${slot.index})`,
           buildPointPayload(point, slot));
    return true;
  }

  const conn = findNearestConnection(graph, localX, localY, connTol);
  if (conn) {
    dbgState.selected = { kind: "connection", slotIndex: slot.index, entity: conn };
    report("connection",
           `[debug] CONNECTION ${conn.id} (${conn.role}, ${conn.kind}, slot #${slot.index})`,
           buildConnectionPayload(conn, graph, slot));
    return true;
  }

  dbgState.selected = { kind: "slot", slotIndex: slot.index };
  report("slot",
         `[debug] SLOT #${slot.index} (col ${slot.col}, row ${slot.row})`,
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

function report(kind, label, full) {
  const payload = filterPayload(kind, full);
  dbgState.lastReport = { label, payload };
  copyToClipboard(label, payload);
}

function buildPointPayload(point, slot) {
  return {
    id:            point.id,
    basePos:       point.basePos,
    pos:           point.pos,
    lock:          point.lock,
    cornerType:    point.cornerType,
    outwardNormal: point.outwardNormal,
    miterScale:    point.miterScale,
    cutDegree:     point.cutDegree,
    chainEndpoint: point.chainEndpoint ?? false,
    slot:          { index: slot.index, col: slot.col, row: slot.row },
  };
}

function buildConnectionPayload(conn, graph, slot) {
  const from = graph.points.get(conn.from);
  const to   = graph.points.get(conn.to);
  const chordLen = from && to
    ? +Math.hypot(to.pos.x - from.pos.x, to.pos.y - from.pos.y).toFixed(3)
    : null;
  return {
    id:           conn.id,
    from:         from ? { id: conn.from, pos: from.pos, basePos: from.basePos, cornerType: from.cornerType } : { id: conn.from },
    to:           to   ? { id: conn.to,   pos: to.pos,   basePos: to.basePos,   cornerType: to.cornerType }   : { id: conn.to   },
    kind:         conn.kind,
    role:         conn.role,
    curve:        conn.curve,
    interiorSide: conn.interiorSide,
    chainId:      conn.chainId,
    chordLen,
    slot:         { index: slot.index, col: slot.col, row: slot.row },
  };
}

function buildSlotPayload(slot, graph, origin) {
  const t = state.template;
  const pointPositions = Array.from(graph.points.values()).map((p) => ({
    id:            p.id,
    cornerType:    p.cornerType,
    basePos:       p.basePos,
    pos:           p.pos,
    outwardNormal: p.outwardNormal,
    miterScale:    p.miterScale,
    chainEndpoint: p.chainEndpoint ?? false,
    lock:          p.lock,
  }));
  const arcs = [];
  for (const conn of graph.connections.values()) {
    if (conn.curve?.type !== "arc") continue;
    const a = graph.points.get(conn.from);
    const b = graph.points.get(conn.to);
    if (!a || !b) continue;
    const dx = b.pos.x - a.pos.x;
    const dy = b.pos.y - a.pos.y;
    const len = Math.hypot(dx, dy);
    let control = null;
    if (len > 1e-9) {
      const px = -dy / len;
      const py =  dx / len;
      const bow = (conn.curve.bowProportion ?? 0) * len;
      control = {
        x: +((a.pos.x + b.pos.x) / 2 + px * bow).toFixed(3),
        y: +((a.pos.y + b.pos.y) / 2 + py * bow).toFixed(3),
      };
    }
    arcs.push({
      id:       conn.id,
      from:     conn.from,
      to:       conn.to,
      chordLen: +len.toFixed(3),
      curve:    conn.curve,
      control,
    });
  }
  return {
    index:           slot.index,
    col:             slot.col,
    row:             slot.row,
    array:           slot.array,
    origin,
    terrainMode:     t?.terrainMode,
    gridKind:        t?.gridKind,
    connectedSaddle: t?.connectedSaddle === true,
    seed:            state.seed,
    globalCurve:     state.globalCurve,
    noiseParams:     state.noiseParams,
    graph,
    inflateDebug:    graph._inflateDebug ?? null,
    pointPositions,
    arcs,
  };
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
