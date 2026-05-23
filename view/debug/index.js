import { state } from "../../controller/state.js";
import { onModeChange, getMode } from "../modeTabs.js";
import { drawGraph } from "../render2/drawGraph.js";
import { buildSlotGraph } from "../render2/buildSlotGraph.js";
import { createStage } from "../stage.js";
import { createSelectionOverlay, slotClientRect } from "../selectionFrame.js";
import {
  isLayerActive, getActiveLayers, onLayersChange, setCopyHandler,
} from "../debugPanel.js";
import { dbgState } from "./state.js";
import {
  SLOT_SIZE, SLOT_SCALE, SLOT_GAP, STAGE_PADDING, SUPERSAMPLE,
  slotOrigin,
} from "./constants.js";
import { drawSlotCellTints, drawNoiseOverlay } from "./overlays.js";
import { drawSelectionOverlay } from "./selection.js";
import { onClick as handleClick, copyLastReport } from "./click.js";

let selectionOverlay = null;

function debugContentSize(t) {
  return {
    w: t.cols * SLOT_SIZE + (t.cols - 1) * SLOT_GAP + STAGE_PADDING * 2,
    h: t.rows * SLOT_SIZE + (t.rows - 1) * SLOT_GAP + STAGE_PADDING * 2,
  };
}

export function initDebugMode() {
  dbgState.stageEl  = document.getElementById("debug-stage");
  dbgState.canvasEl = document.getElementById("debug-canvas");
  if (!dbgState.stageEl || !dbgState.canvasEl) return;

  dbgState.canvasEl.addEventListener("click", onCanvasClick);

  dbgState.stage = createStage(dbgState.stageEl, {
    fitToContent: true,
    zoomOrigin:   "center",
    isActive,
  });
  dbgState.stage.setContent(dbgState.canvasEl);

  // Slot-selection frame uses the shared screen-space overlay (same as preview
  // + export); point / connection highlights stay on the canvas (inspection
  // markers). Tracker only returns a rect for a "slot" selection.
  selectionOverlay = createSelectionOverlay(dbgState.stageEl, dbgState.stage);
  selectionOverlay.setTracker(() => {
    const sel = dbgState.selected;
    if (!sel || sel.kind !== "slot") return null;
    const t = state.template;
    const slot = t?.slots.find((s) => s.index === sel.slotIndex);
    if (!slot) return null;
    const { w, h } = debugContentSize(t);
    const o = slotOrigin(slot);
    return slotClientRect(dbgState.canvasEl, w, h, o.x, o.y, SLOT_SIZE, SLOT_SIZE);
  });

  onModeChange((mode) => { if (mode === "debug") render(); });
  const repaint        = () => { if (isActive()) render(); };
  const clearAndRepaint = () => { dbgState.selected = null; repaint(); };
  state.addEventListener("template:changed",               clearAndRepaint);
  state.addEventListener("tile-offsets:changed",           repaint);
  state.addEventListener("slot-cut-transform:changed",     repaint);
  state.addEventListener("slot-texture-transform:changed", repaint);
  state.addEventListener("texture-ops:changed",            repaint);
  state.addEventListener("global-curve:changed",           repaint);
  state.addEventListener("noise:changed",                  repaint);
  state.addEventListener("seed:changed",                   repaint);
  state.addEventListener("project:loaded",                 clearAndRepaint);
  onLayersChange(repaint);

  setCopyHandler(copyLastReport);
}

export function resetDebugView() {
  dbgState.stage?.resetView();
}

function isActive() { return getMode() === "debug"; }

function onCanvasClick(e) {
  if (handleClick(e)) render();
}

function render() {
  const t = state.template;
  if (!dbgState.canvasEl || !t) return;

  const cols = t.cols, rows = t.rows;
  const widthPx  = cols * SLOT_SIZE + (cols - 1) * SLOT_GAP + STAGE_PADDING * 2;
  const heightPx = rows * SLOT_SIZE + (rows - 1) * SLOT_GAP + STAGE_PADDING * 2;
  dbgState.canvasEl.width        = widthPx  * SUPERSAMPLE;
  dbgState.canvasEl.height       = heightPx * SUPERSAMPLE;
  dbgState.canvasEl.style.width  = widthPx  + "px";
  dbgState.canvasEl.style.height = heightPx + "px";

  const ctx = dbgState.canvasEl.getContext("2d");
  ctx.setTransform(SUPERSAMPLE, 0, 0, SUPERSAMPLE, 0, 0);
  ctx.clearRect(0, 0, widthPx, heightPx);
  dbgState.stage?.setContentSize(widthPx, heightPx);

  const layers = getActiveLayers();
  const slotGraphs = new Map();
  for (const slot of t.slots) {
    const o = slotOrigin(slot);
    if (isLayerActive("overlay.cellTint")) drawSlotCellTints(ctx, slot, o);
    const graph = buildSlotGraph(slot);
    drawNoiseOverlay(ctx, slot, graph, o, SLOT_SIZE);
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(SLOT_SCALE, SLOT_SCALE);
    drawGraph(ctx, graph, { layers });
    ctx.restore();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.lineWidth   = 1;
    ctx.strokeRect(o.x + 0.5, o.y + 0.5, SLOT_SIZE - 1, SLOT_SIZE - 1);
    slotGraphs.set(slot.index, graph);
  }

  drawSelectionOverlay(ctx, t, slotGraphs, dbgState.selected);
  selectionOverlay?.refresh();
}
