import { simplexNoise2D } from "../../../noise.js";
import { arcControlPoint as arcControl } from "../../render.js";
import { clamp01 } from "../../../math.js";

// Higher SAMPLES_PER_CELL than MAX_CYCLES × 2 (Nyquist) so spike tips
// register as actual triangle vertices in the wave-vertex polyline,
// not get aliased away between samples.
const SAMPLES_PER_CELL = 36;
const LEN_STEPS = 8;
const WAVE_FREQ_MAX_CYCLES = 8;
const JITTER_AMP_RANGE = 3.5;
const NOISE_PEAK = 0.82;
const INV_NOISE_PEAK = 1 / NOISE_PEAK;

export function waveImpl(graph, opts = {}) {
  const amplitude = opts.amplitude ?? 0;
  const frequency = opts.frequency ?? 0;
  const jitter    = opts.jitter ?? 0;
  const symmetric = clamp01(opts.symmetric ?? 1);
  const seed      = opts.seed ?? 0;
  const slotCol   = opts.slotCol ?? 0;
  const slotRow   = opts.slotRow ?? 0;
  if (!graph || !amplitude || frequency <= 1e-6) return graph;

  const cellSize = (graph.meta.cell.w + graph.meta.cell.h) / 2;
  const minX = graph.meta.origin.x;
  const minY = graph.meta.origin.y;
  const maxX = minX + graph.meta.slotSize;
  const maxY = minY + graph.meta.slotSize;

  const chainIds = new Set();
  for (const conn of graph.connections.values()) {
    if (conn.role === "cut" && conn.chainId != null) chainIds.add(conn.chainId);
  }
  for (const chainId of chainIds) {
    processChain(
      graph, chainId, amplitude, frequency, jitter, symmetric,
      cellSize, slotCol, slotRow, seed,
      minX, minY, maxX, maxY,
    );
  }
  return graph;
}

function processChain(
  graph, chainId, amplitude, frequency, jitter, symmetric,
  cellSize, slotCol, slotRow, seed,
  minX, minY, maxX, maxY,
) {
  const ordered = walkChain(graph, chainId);
  if (!ordered.length) return;

  // Precompute per-segment metadata so the inner sample loop never re-
  // resolves graph points, never recomputes interiorSign, and uses a
  // fast inline path for line cuts (the common case after inflate).
  const segments = [];
  let cumArc = 0;
  for (const { cut, fromPid } of ordered) {
    const cutFrom = graph.points.get(cut.from);
    const cutTo   = graph.points.get(cut.to);
    if (!cutFrom || !cutTo) continue;
    const segLen = approxCurveLength(cutFrom.pos, cutTo.pos, cut.curve);
    const isLine = !cut.curve || cut.curve.type === "line";
    const interiorSign = cut.interiorSide === "right" ? 1 : -1;
    const reversed = cut.from !== fromPid;
    // For line cuts we can derive perp once per segment from the chord
    // direction; arc/bezier need per-sample tangent. perp is always
    // relative to curve direction (cutFrom→cutTo) — chain-walk direction
    // doesn't enter into it (interior side is a geometric property of
    // the curve, same regardless of walker).
    let linePerpX = 0, linePerpY = 0;
    if (isLine) {
      const dx = cutTo.pos.x - cutFrom.pos.x;
      const dy = cutTo.pos.y - cutFrom.pos.y;
      const lenInv = 1 / Math.max(1e-12, Math.hypot(dx, dy));
      const tanX = dx * lenInv;
      const tanY = dy * lenInv;
      linePerpX = -tanY * interiorSign;
      linePerpY =  tanX * interiorSign;
    }
    segments.push({
      cut, cutFrom, cutTo, fromPid, reversed,
      cumStart: cumArc, segLen,
      isLine, interiorSign,
      linePerpX, linePerpY,
    });
    cumArc += segLen;
  }
  const totalArc = cumArc;
  if (totalArc < 1e-6) return;

  const startPid = ordered[0].fromPid;
  const lastSeg  = segments[segments.length - 1];
  const endPid   = lastSeg.cut.from === lastSeg.fromPid
    ? lastSeg.cut.to : lastSeg.cut.from;

  const N = Math.max(4, Math.round(totalArc / cellSize * SAMPLES_PER_CELL));

  // One hash base per chain; suffix-only mutation avoids 4 string builds.
  const baseKey = `${chainId}|${slotCol}|${slotRow}|${seed}|`;
  const noiseOffsetX  = hash01(baseKey + "nx") * 1000;
  const noiseOffsetY  = hash01(baseKey + "ny") * 1000;
  const jitterOffsetX = hash01(baseKey + "jx") * 1000 + 500;
  const jitterOffsetY = hash01(baseKey + "jy") * 1000 + 500;
  const noiseScale = cellSize / Math.max(1e-6, WAVE_FREQ_MAX_CYCLES * frequency);
  const jitterScale = noiseScale * 3;
  const invNoiseScale  = 1 / noiseScale;
  const invJitterScale = 1 / jitterScale;
  // Anchors = arc positions where wave must collapse to 0. Chain endpoints
  // always; interior corners (tangent flip between adjacent segments) too
  // — without that, perpendicular offsets on either side of a corner pull
  // in different directions and consecutive samples cross → self-intersection.
  const anchors = buildAnchors(graph, segments, totalArc);
  const numAnchors = anchors.length;
  const fadeArc = cellSize * 0.4;
  const invFadeArc = fadeArc > 0 ? 1 / fadeArc : 0;
  // Hoist sharpening exponent (constant per chain).
  const sharpPower = 1 + 3 * (1 - symmetric);
  const oneMinusSym = 1 - symmetric;

  // Monotonic walking pointers — both segments and anchors are arc-sorted
  // and `s` increases each iteration, so we never need to re-scan from 0.
  let segIdx = 0;
  let anchorIdx = 0;

  const newVertices = [];
  for (let i = 1; i < N; i++) {
    const s = i / N * totalArc;
    // Advance segIdx forward while current seg's end is past s.
    while (segIdx < segments.length - 1
      && s >= segments[segIdx].cumStart + segments[segIdx].segLen) {
      segIdx++;
    }
    const seg = segments[segIdx];
    const tChainInSeg = (s - seg.cumStart) / seg.segLen;
    const tIntr = seg.reversed ? 1 - tChainInSeg : tChainInSeg;

    let samplePosX, samplePosY, sampleBaseX, sampleBaseY, perpX, perpY;
    if (seg.isLine) {
      // Inline line lerp: avoids two object-returning sampleCurve calls.
      const af = seg.cutFrom, bt = seg.cutTo;
      samplePosX  = af.pos.x     + (bt.pos.x     - af.pos.x)     * tIntr;
      samplePosY  = af.pos.y     + (bt.pos.y     - af.pos.y)     * tIntr;
      sampleBaseX = af.basePos.x + (bt.basePos.x - af.basePos.x) * tIntr;
      sampleBaseY = af.basePos.y + (bt.basePos.y - af.basePos.y) * tIntr;
      perpX = seg.linePerpX;
      perpY = seg.linePerpY;
    } else {
      const sp  = sampleCurve(seg.cutFrom.pos,     seg.cutTo.pos,     seg.cut.curve, tIntr);
      const sb  = sampleCurve(seg.cutFrom.basePos, seg.cutTo.basePos, seg.cut.curve, tIntr);
      const tan = sampleTangent(seg.cutFrom.pos,   seg.cutTo.pos,     seg.cut.curve, tIntr);
      const tanLen = Math.hypot(tan.x, tan.y);
      if (tanLen < 1e-6) continue;
      samplePosX = sp.x; samplePosY = sp.y;
      sampleBaseX = sb.x; sampleBaseY = sb.y;
      const tanInv = 1 / tanLen;
      perpX = -tan.y * tanInv * seg.interiorSign;
      perpY =  tan.x * tanInv * seg.interiorSign;
    }

    // Primary noise — simplex along arc gives an organic non-periodic profile.
    const raw = simplexNoise2D(noiseOffsetX + s * invNoiseScale, noiseOffsetY, seed);
    // Asymmetric mode (symmetric → 0) sharpens peaks: |raw|^power squashes
    // mid values → discrete spikes from near-flat baseline.
    const absRaw = raw < 0 ? -raw : raw;
    let rawNorm = absRaw * INV_NOISE_PEAK;
    if (rawNorm > 1) rawNorm = 1;
    const sharpAbs = Math.pow(rawNorm, sharpPower) * NOISE_PEAK;
    const sharpSigned = raw >= 0 ? sharpAbs : -sharpAbs;
    const mixed = symmetric * sharpSigned + oneMinusSym * sharpAbs;
    const ampMod = jitter > 0
      ? 1 + jitter * JITTER_AMP_RANGE
          * simplexNoise2D(jitterOffsetX + s * invJitterScale, jitterOffsetY, seed + 1)
      : 1;

    // Walk anchors monotonically. anchors[] is sorted by arc-position;
    // since s increases, nearest anchor is either anchors[anchorIdx] (left)
    // or anchors[anchorIdx+1] (right). Advance idx while next anchor is closer.
    while (anchorIdx < numAnchors - 1
      && Math.abs(s - anchors[anchorIdx + 1]) < Math.abs(s - anchors[anchorIdx])) {
      anchorIdx++;
    }
    const distLeft  = Math.abs(s - anchors[anchorIdx]);
    const distRight = anchorIdx + 1 < numAnchors
      ? Math.abs(s - anchors[anchorIdx + 1])
      : Infinity;
    const nearestAnchor = distLeft < distRight ? distLeft : distRight;

    let fade = nearestAnchor * invFadeArc;
    if (fade > 1) fade = 1;
    if (invFadeArc === 0) fade = 1;
    const d = amplitude * mixed * ampMod * fade;

    let posX = samplePosX + perpX * d;
    let posY = samplePosY + perpY * d;
    let baseX = sampleBaseX + perpX * d;
    let baseY = sampleBaseY + perpY * d;
    if (posX < minX) posX = minX; else if (posX > maxX) posX = maxX;
    if (posY < minY) posY = minY; else if (posY > maxY) posY = maxY;
    if (baseX < minX) baseX = minX; else if (baseX > maxX) baseX = maxX;
    if (baseY < minY) baseY = minY; else if (baseY > maxY) baseY = maxY;

    const id = `chain_${chainId}__w${i}`;
    graph.points.set(id, {
      id,
      basePos: { x: baseX, y: baseY },
      pos:     { x: posX,  y: posY  },
      lock:          { x: false, y: false, rotation: false },
      cornerType:    "wave-vertex",
      outwardNormal: { x: perpX, y: perpY },
      miterScale:    null,
      cutDegree:     2,
      chainEndpoint: false,
    });
    newVertices.push(id);
  }

  for (const seg of segments) graph.connections.delete(seg.cut.id);

  const chain = [startPid, ...newVertices, endPid];
  const baseInteriorSide = segments[0].cut.interiorSide;
  const baseKind = segments[0].cut.kind;
  for (let i = 0; i < chain.length - 1; i++) {
    const id = `chain_${chainId}__seg${i}`;
    graph.connections.set(id, {
      id,
      from:         chain[i],
      to:           chain[i + 1],
      kind:         baseKind,
      role:         "cut",
      curve:        { type: "line" },
      interiorSide: baseInteriorSide,
      chainId,
    });
  }
}

// Ordered traversal of one chain. Starts at chainEndpoint (cutDegree=1
// in chain) for open chains; arbitrary cut for closed loops.
function walkChain(graph, chainId) {
  const cuts = [];
  for (const conn of graph.connections.values()) {
    if (conn.chainId === chainId) cuts.push(conn);
  }
  if (!cuts.length) return [];

  const byPoint = new Map();
  for (const cut of cuts) {
    for (const pid of [cut.from, cut.to]) {
      let arr = byPoint.get(pid);
      if (!arr) { arr = []; byPoint.set(pid, arr); }
      arr.push(cut);
    }
  }

  let startPid = null;
  for (const [pid, arr] of byPoint) {
    if (arr.length === 1) { startPid = pid; break; }
  }
  if (!startPid) startPid = cuts[0].from;

  const ordered = [];
  const visited = new Set();
  let cur = startPid;
  while (true) {
    const arr = byPoint.get(cur) || [];
    const next = arr.find((c) => !visited.has(c.id));
    if (!next) break;
    visited.add(next.id);
    ordered.push({ cut: next, fromPid: cur });
    cur = next.from === cur ? next.to : next.from;
  }
  return ordered;
}

function buildAnchors(graph, segments, totalArc) {
  const out = [0];
  for (let i = 0; i < segments.length - 1; i++) {
    const tA = trailingTangent(graph, segments[i]);
    const tB = trailingTangent(graph, segments[i + 1]);
    if (!tA || !tB) continue;
    const dot = tA.x * tB.x + tA.y * tB.y;
    if (dot < 0.95) out.push(segments[i + 1].cumStart);
  }
  out.push(totalArc);
  return out;
}

function trailingTangent(graph, seg) {
  const cutFrom = seg.cutFrom || graph.points.get(seg.cut.from);
  const cutTo   = seg.cutTo   || graph.points.get(seg.cut.to);
  if (!cutFrom || !cutTo) return null;
  const reversed = seg.cut.from !== seg.fromPid;
  const a = reversed ? cutTo  : cutFrom;
  const b = reversed ? cutFrom : cutTo;
  const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  return { x: dx / len, y: dy / len };
}

function approxCurveLength(from, to, curve) {
  if (!curve || curve.type === "line") {
    return Math.hypot(to.x - from.x, to.y - from.y);
  }
  let len = 0;
  let prev = sampleCurve(from, to, curve, 0);
  for (let i = 1; i <= LEN_STEPS; i++) {
    const cur = sampleCurve(from, to, curve, i / LEN_STEPS);
    len += Math.hypot(cur.x - prev.x, cur.y - prev.y);
    prev = cur;
  }
  return len;
}

function sampleCurve(a, b, curve, t) {
  switch (curve?.type) {
    case "arc": {
      const ctrl = arcControl(a, b, curve);
      const u  = 1 - t;
      return {
        x: u * u * a.x + 2 * u * t * ctrl.x + t * t * b.x,
        y: u * u * a.y + 2 * u * t * ctrl.y + t * t * b.y,
      };
    }
    case "bezier": {
      const h1x = a.x + curve.h1.x, h1y = a.y + curve.h1.y;
      const h2x = b.x + curve.h2.x, h2y = b.y + curve.h2.y;
      const u  = 1 - t;
      return {
        x: u*u*u * a.x + 3*u*u*t * h1x + 3*u*t*t * h2x + t*t*t * b.x,
        y: u*u*u * a.y + 3*u*u*t * h1y + 3*u*t*t * h2y + t*t*t * b.y,
      };
    }
    case "line":
    default:
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
}

function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function sampleTangent(a, b, curve, t) {
  switch (curve?.type) {
    case "arc": {
      const ctrl = arcControl(a, b, curve);
      const u  = 1 - t;
      return {
        x: 2 * u * (ctrl.x - a.x) + 2 * t * (b.x - ctrl.x),
        y: 2 * u * (ctrl.y - a.y) + 2 * t * (b.y - ctrl.y),
      };
    }
    case "bezier": {
      const h1x = a.x + curve.h1.x, h1y = a.y + curve.h1.y;
      const h2x = b.x + curve.h2.x, h2y = b.y + curve.h2.y;
      const u  = 1 - t;
      return {
        x: 3*u*u * (h1x - a.x) + 6*u*t * (h2x - h1x) + 3*t*t * (b.x - h2x),
        y: 3*u*u * (h1y - a.y) + 6*u*t * (h2y - h1y) + 3*t*t * (b.y - h2y),
      };
    }
    case "line":
    default:
      return { x: b.x - a.x, y: b.y - a.y };
  }
}
