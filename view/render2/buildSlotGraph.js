// Shared "build a PointGraph for one slot with all ops applied" function.
// Consumed by debug stage, mapView (preview overlay), mainView (preview
// main canvas), and export.
//
// SINGLE SOURCE OF TRUTH: the graph is always built and operated on at
// REFERENCE_SLOT_SIZE × REFERENCE_SLOT_SIZE in coords starting at (0,0).
// View-specific (slotSize, origin) is applied AFTER all ops by scaling
// every point. Every consumer therefore sees the SAME geometry — only
// the final pixel positions differ. Without this, each op would have to
// be made view-independent on its own (we tried; it's fragile).

import { state } from "../../controller/state.js";
import { buildPointGraph } from "../../core/pointGraph/build/index.js";
import { isInteracting } from "./interactionGate.js";
import { GLOBAL_CURVE_PARAMS } from "../../core/curve_params.js";
import { timed } from "../../core/trace.js";

import { organic } from "../../core/pointGraph/ops/organic/index.js";
import { inflate } from "../../core/pointGraph/ops/inflate/index.js";
import { cornerSoften } from "../../core/pointGraph/ops/cornerSoften/index.js";
import { wave } from "../../core/pointGraph/ops/wave/index.js";
import { noise } from "../../core/pointGraph/ops/noise/index.js";
import { merge } from "../../core/pointGraph/ops/merge/index.js";
import { cutTransform } from "../../core/pointGraph/ops/cutTransform/index.js";

// 96 divides cleanly by common pattern dims (1, 2, 3, 4, 6, 8, 12),
// keeps integer cellSize for 3-cell patterns (32 px) → stable hash
// rounding. All graph coords live in this space; views apply
// ctx.scale(viewSize / REFERENCE_SLOT_SIZE) at render time.
export const REFERENCE_SLOT_SIZE = 96;
// Inflate must produce IDENTICAL chain-endpoint motion in adjacent tiles
// at their shared edge, otherwise the cut chain "breaks apart" between
// tiles of different cell density (3×3 vs 5×5 etc). Using a fixed baseline
// (1/3 of slot, the smallest standard cell size) instead of per-tile
// cellSize keeps inflate amount identical across tiles.
const INFLATE_BASELINE = REFERENCE_SLOT_SIZE / 3;

// Per-event graph cache. mainView + mapView + slotEditor + debug stage
// each call buildSlotGraph for every slot when the same state event fires —
// without dedup we rebuild the full pipeline (organic / cornerSoften /
// inflate / wave / noise / merge) 3-4× per slot per tick. Cache spans the
// listeners of ONE state event and is invalidated by the next graph-
// affecting state event. Bypassed when opts has any per-call override
// (export variants, stopBeforeWave) — those produce graphs not
// interchangeable with the default-opts result.
//
// Keying by slot reference alone (object identity) is insufficient: a
// loaded project whose template id matches the current builtin
// (defaultTemplate is BUILTIN[0], getTemplateById returns the SAME ref
// for that id) replays the same slot refs across the template change,
// so a cache hit returns a graph built with the pre-restore curve
// params. Listener-based invalidation handles that case — every state
// event that affects the graph clears the cache before view listeners
// run (this module's listeners register at import time, before any
// init*View() call hooks up its refresh listeners).
const _slotGraphCache = new Map();

const CACHE_INVALIDATING_EVENTS = [
  "template:changed",
  "global-curve:changed",
  "noise:changed",
  "seed:changed",
  "tile-offsets:changed",
  "slot-cut-transform:changed",
];
for (const ev of CACHE_INVALIDATING_EVENTS) {
  state.addEventListener(ev, () => _slotGraphCache.clear());
}

function optsAreCacheable(opts) {
  return !opts.curveOverride
    && !opts.noiseOverride
    && opts.includeNoise === undefined
    && opts.includeWave === undefined
    && !opts.stopBeforeWave;
}

export function buildSlotGraph(slot, opts = {}) {
  const cacheable = optsAreCacheable(opts);
  if (cacheable && _slotGraphCache.has(slot)) {
    return _slotGraphCache.get(slot);
  }
  const t = state.template;
  const graph = timed("curve:buildPointGraph", () => buildPointGraph(
    slot,
    REFERENCE_SLOT_SIZE,
    { x: 0, y: 0 },
    {
      gridKind: t?.gridKind || "single",
      connectedSaddle: t?.connectedSaddle === true,
      saddleBridgeOffset: t?.saddleBridgeOffset,
    },
  ));
  timed("curve:tileOffsets", () => applyTileOffsets(graph, slot));
  applyOps(graph, slot, opts);
  timed("curve:cutTransform", () => applySlotCutTransform(graph, slot));
  if (cacheable) {
    _slotGraphCache.set(slot, graph);
  }
  return graph;
}

// Graph snapshot up to and including bow overrides but BEFORE wave splits
// cuts into many chain_*__seg* segments. Used by the slot editor to anchor
// bow handles on the user-meaningful cut topology, not the wave fragments.
export function buildBowGraph(slot, opts = {}) {
  const t = state.template;
  const graph = buildPointGraph(
    slot,
    REFERENCE_SLOT_SIZE,
    { x: 0, y: 0 },
    {
      gridKind: t?.gridKind || "single",
      connectedSaddle: t?.connectedSaddle === true,
      saddleBridgeOffset: t?.saddleBridgeOffset,
    },
  );
  applyTileOffsets(graph, slot);
  applyOps(graph, slot, { ...opts, stopBeforeWave: true });
  applySlotCutTransform(graph, slot);
  return graph;
}

// User-set bow handles override cornerSoften's computed bow on cut arcs
// AND can turn straight line cuts into arcs. Runs at the end of the
// pipeline so the override is the final word.
function applyCutBowOverrides(graph, slot) {
  if (!slot || slot.index == null) return;
  const overrides = state.getCutBowOverrides?.(slot.index);
  if (!overrides) return;
  for (const conn of graph.connections.values()) {
    if (conn.role !== "cut") continue;
    if (!(conn.id in overrides)) continue;
    const bow = overrides[conn.id];
    if (!Number.isFinite(bow) || bow === 0) {
      conn.curve = { type: "line" };
    } else {
      conn.curve = { type: "arc", bowProportion: bow };
    }
  }
}

// Handle pass: original grid points (p_r_c) survive only through organic
// and inflate — cornerSoften splits or deletes them. Slot-editor handles
// need stable positions regardless of which downstream ops are active.
export function buildHandleGraph(slot) {
  const t = state.template;
  const graph = buildPointGraph(
    slot,
    REFERENCE_SLOT_SIZE,
    { x: 0, y: 0 },
    {
      gridKind: t?.gridKind || "single",
      connectedSaddle: t?.connectedSaddle === true,
      saddleBridgeOffset: t?.saddleBridgeOffset,
    },
  );
  applyTileOffsets(graph, slot);
  applyOrganicInflate(graph, slot);
  applySlotCutTransform(graph, slot);
  return graph;
}

function applyOrganicInflate(graph, slot) {
  const cellSize = (graph.meta.cell.w + graph.meta.cell.h) / 2;
  const cp = state.globalCurve;
  const organicAmp =
    (cp.organic ?? 0) *
    (GLOBAL_CURVE_PARAMS.organic?.effectScale ?? 1) *
    cellSize;
  const inflateAmt =
    (cp.inflate ?? 0) *
    (GLOBAL_CURVE_PARAMS.inflate?.effectScale ?? 1) *
    INFLATE_BASELINE;
  const seed = state.seed | 0;
  const slotCol = slot?.col ?? 0;
  const slotRow = slot?.row ?? 0;
  if (organicAmp !== 0)
    organic(graph, { amplitude: organicAmp, seed, slotCol, slotRow });
  if (inflateAmt !== 0) inflate(graph, inflateAmt);
}

// User drag offsets land on grid points (id "p_r_c") AND dual saddle
// bridges (id "p_r_c__ne|nw|se|sw"). Bridges are keyed by their full id
// so the two halves of one saddle can be moved independently. Applied
// BEFORE organic so the rest of the pipeline cascades onto the dragged
// geometry. Offsets are in cell-fraction units → scale-invariant.
function applyTileOffsets(graph, slot) {
  const offsets = state.getTileOffsets?.(slot.index);
  if (!offsets) return;
  const cellSize = (graph.meta.cell.w + graph.meta.cell.h) / 2;
  for (const point of graph.points.values()) {
    let key = null;
    const m = /^p_(\d+)_(\d+)$/.exec(point.id);
    if (m) {
      key = `${m[1]},${m[2]}`;
    } else if (/^p_\d+_\d+__(?:ne|nw|se|sw)$/.test(point.id)) {
      key = point.id;
    }
    if (!key) continue;
    const off = offsets[key];
    if (!off) continue;
    if (!point.lock?.x) {
      point.pos.x += off.dx * cellSize;
      point.basePos.x += off.dx * cellSize;
    }
    if (!point.lock?.y) {
      point.pos.y += off.dy * cellSize;
      point.basePos.y += off.dy * cellSize;
    }
  }
}

// organic runs FIRST so the rest of the pipeline cascades onto a
// perturbed graph (= structural variability, not just surface noise).
// cornerSoften runs on raw post-organic chain (= produces soften-vertex
// pairs + arc/chord). inflate runs as polyline OFFSET on the already-
// shaped chain → topology-aware, no self-intersection from per-point
// summed deltas. wave runs on the final cut path. noise runs LAST so
// its island contours can be pre-masked against the post-wave cut region.
function applyOps(graph, slot, opts = {}) {
  const cellSize = (graph.meta.cell.w + graph.meta.cell.h) / 2;
  const cp = opts.curveOverride
    ? { ...state.globalCurve, ...opts.curveOverride }
    : state.globalCurve;
  // Deep-merge per layer so an override that only flips enabled keeps the
  // unchanged params.
  const baseNp = state.noiseParams;
  const np = opts.noiseOverride
    ? {
        A: { ...baseNp.A, ...(opts.noiseOverride.A || {}) },
        B: { ...baseNp.B, ...(opts.noiseOverride.B || {}) },
      }
    : baseNp;
  const scaled = (k) =>
    (cp[k] ?? 0) * (GLOBAL_CURVE_PARAMS[k]?.effectScale ?? 1) * cellSize;
  const scaledFixed = (k) =>
    (cp[k] ?? 0) * (GLOBAL_CURVE_PARAMS[k]?.effectScale ?? 1) * INFLATE_BASELINE;

  const organicAmp = scaled("organic");
  const inflateAmt = scaledFixed("inflate");
  // cornerSoften params are raw 0..1 (not multiplied by cellSize — softness
  // is a fraction of leg length, computed per-corner inside the op).
  const cornerSoftness = cp.cornerSoftness ?? 0;
  const cornerArcness = cp.cornerArcness ?? 0;
  const waveAmp = scaled("waveAmplitude");
  // Pass raw 0..1 values — wave op converts frequency to noise scale and
  // uses jitter / symmetric as fractions internally.
  const waveFreq = cp.waveFrequency ?? 0;
  const waveJitter = cp.waveJitter ?? 0;
  const waveSym = cp.waveSymmetric ?? 1;

  // Pass slot col/row + seed to view-dependent ops so SAME slot produces
  // SAME geometry across Map debug, preview overlay, and main canvas
  // (each uses a different slotSize/origin, so hashing world coords
  // alone would diverge).
  const slotCol = slot?.col ?? 0;
  const slotRow = slot?.row ?? 0;
  const seed = state.seed | 0;

  if (organicAmp !== 0)
    timed("curve:organic", () => organic(graph, { amplitude: organicAmp, seed, slotCol, slotRow }));
  if (cornerSoftness > 0)
    timed("curve:cornerSoften", () => cornerSoften(graph, { softness: cornerSoftness, arcness: cornerArcness }));
  if (inflateAmt !== 0) timed("curve:inflate", () => inflate(graph, inflateAmt));
  // Apply user bow overrides BEFORE wave so wave's sampling follows the
  // user-curved cut path. After wave the original cuts are gone — they
  // get replaced by chain_*__seg* connections that the slot editor would
  // not show bow handles for.
  timed("curve:bowOverrides", () => applyCutBowOverrides(graph, slot));
  if (opts.stopBeforeWave) return;
  // Wave + noise share one gate decision so they never desynchronise.
  // Throttle skips them during active drag; on pointerup interactionGate
  // fires noise:changed → cache cleared → fresh build with both included.
  // PNG export sets includeWave/includeNoise=true to bypass for full quality.
  const skipHeavy = state.renderThrottle && isInteracting();
  const runWave = opts.includeWave !== undefined
    ? !!opts.includeWave
    : !skipHeavy;
  if (waveAmp !== 0 && runWave)
    timed("curve:wave", () => wave(graph, {
      amplitude: waveAmp,
      frequency: waveFreq,
      jitter: waveJitter,
      symmetric: waveSym,
      seed,
      slotCol,
      slotRow,
    }));
  const runNoise = opts.includeNoise !== undefined
    ? !!opts.includeNoise
    : !skipHeavy;
  if (np && runNoise) {
    // Layers run independently — A (holes) carves the filled side, B
    // (patches) adds onto the empty side. Different seed offsets keep
    // their noise fields visually distinct when both are active.
    if (np.A?.enabled) {
      const aParams = { ...np.A, side: "holes" };
      timed("curve:noise A", () => noise(graph, { params: aParams, seed, slotCol, slotRow }));
      timed("curve:merge A", () => merge(graph, { side: "holes" }));
    }
    if (np.B?.enabled) {
      const bParams = { ...np.B, side: "patches" };
      timed("curve:noise B", () => noise(graph, { params: bParams, seed: seed + 9973, slotCol, slotRow }));
      timed("curve:merge B", () => merge(graph, { side: "patches" }));
    }
  }
}

// Per-slot D4 transform (= "last pipeline step"). Reads from state — the
// transform is a project-level modifier, NOT a template edit. Called
// separately by buildSlotGraph / buildHandleGraph / buildBowGraph so
// handle and bow graphs also get the transform applied — drag handles
// render on the transformed cut. Identity (missing entry, or rotate=0 +
// flipH=false) is a no-op inside cutTransform itself.
function applySlotCutTransform(graph, slot) {
  if (slot?.index == null) return;
  const cutTx = state.getSlotCutTransform(slot.index);
  if (cutTx) cutTransform(graph, cutTx);
}
