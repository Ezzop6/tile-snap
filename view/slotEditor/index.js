import { state } from "../../controller/state.js";
import { applyRenderModeClass } from "../projectBar.js";
import { gateRefreshDuringTemplateMode } from "../viewRefreshGate.js";
import { REFERENCE_SLOT_SIZE } from "../render2/index.js";
import { buildPoolOverrideRow } from "./poolOverride.js";
import { buildCutTransformRow } from "./cutTransform.js";
import { buildTextureTransformRow } from "./textureTransform.js";
import { syncMeta, computeFitSize, drawPreviewBase } from "./preview.js";
import {
  collectHandles, drawHandles, hitTest,
  beginDrag, applyDrag, clearHit,
} from "./handles.js";

let host           = null;
let stage          = null;
let canvas         = null;
let ctx            = null;
let resizeObserver = null;
let drag           = null;
let currentSize    = 0;
let lastHandles    = null;

function coalesceRaf(fn) {
  let pending = false;
  return function coalesced() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; fn(); });
  };
}

export function initSlotEditor() {
  host = document.getElementById("parameters");
  if (!host) return;

  // Paint = canvas blit; rAF-coalesce so burst events (curve "Random all",
  // bundle export deserialize loop) collapse into one paint per frame.
  // Rebuild = DOM structure change, lighter listener set → left sync.
  const gatedRebuild = gateRefreshDuringTemplateMode(rebuild);
  const gatedPaint   = coalesceRaf(gateRefreshDuringTemplateMode(paint));
  state.addEventListener("slot-selection:changed",     gatedRebuild);
  state.addEventListener("template:changed",           gatedRebuild);
  state.addEventListener("pools:changed",              gatedRebuild);
  state.addEventListener("slot-pool-override:changed", gatedRebuild);
  state.addEventListener("global-curve:changed",       gatedPaint);
  state.addEventListener("noise:changed",              gatedPaint);
  state.addEventListener("seed:changed",               gatedPaint);
  state.addEventListener("tile-offsets:changed",       gatedPaint);
  // Transform changes update the row's cycle-button label + reset visibility,
  // so we rebuild rather than just repaint the canvas.
  state.addEventListener("slot-cut-transform:changed",     gatedRebuild);
  state.addEventListener("slot-texture-transform:changed", gatedRebuild);
  state.addEventListener("texture-ops:changed",             gatedPaint);

  const resetBtn = document.getElementById("slot-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      const idx = state.selectedSlotIndex;
      if (idx == null) return;
      // Full slot reset: clear every project-level modifier keyed by this
      // slot. Template itself stays untouched.
      state.clearTileOffsetsForSlot(idx);
      state.clearCutBowOverridesForSlot(idx);
      state.clearSlotCutTransform(idx);
      state.clearSlotTextureTransform(idx);
      state.clearSlotPoolOverride(idx);
    });
  }

  rebuild();
}

function rebuild() {
  if (!host) return;
  teardown();
  host.innerHTML = "";
  canvas = null; ctx = null; stage = null;

  const slot = currentSlot();
  syncMeta(slot);
  // Hide the whole panel-section when no slot is selected — the editor
  // only makes sense once the user clicks one. Browser's [hidden]
  // attribute removes the section from layout entirely.
  const section = document.getElementById("slot-editor-section");
  if (section) section.hidden = !slot;
  if (!slot) return;

  host.appendChild(buildPoolOverrideRow(slot));
  host.appendChild(buildTextureTransformRow(slot));
  host.appendChild(buildCutTransformRow(slot));

  stage = document.createElement("div");
  stage.className = "slot-editor__stage";
  canvas = document.createElement("canvas");
  canvas.className = "slot-editor__canvas";
  stage.appendChild(canvas);
  host.appendChild(stage);
  ctx = canvas.getContext("2d");

  canvas.addEventListener("mousedown",   onMouseDown);
  canvas.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("mousemove",   onMouseMove);
  window.addEventListener("mouseup",     onMouseUp);

  resizeObserver = new ResizeObserver(paint);
  resizeObserver.observe(stage);
  paint();
}

function teardown() {
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
  if (canvas) {
    canvas.removeEventListener("mousedown",   onMouseDown);
    canvas.removeEventListener("contextmenu", onContextMenu);
  }
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mouseup",   onMouseUp);
  drag = null;
}

function paint() {
  if (!canvas || !ctx || !stage) return;
  const slot = currentSlot();
  if (!slot) return;

  applyRenderModeClass(canvas);

  const size = computeFitSize(stage);
  const dpr  = window.devicePixelRatio || 1;
  canvas.width  = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width  = size + "px";
  canvas.style.height = size + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  currentSize = size;

  const origin = { x: 0, y: 0 };
  drawPreviewBase(ctx, slot, origin, size);
  lastHandles = collectHandles(slot);
  drawHandles(ctx, lastHandles, origin, size, drag);
}

function onMouseDown(e) {
  if (e.button !== 0) return;
  const slotIdx = state.selectedSlotIndex;
  if (slotIdx == null || !lastHandles) return;
  const { x, y } = canvasCoords(e);
  const scale = currentSize / REFERENCE_SLOT_SIZE;
  const hit = hitTest(lastHandles, x / scale, y / scale, scale);
  if (!hit) return;
  const cutTx = state.getSlotCutTransform(slotIdx);
  drag = beginDrag(hit, slotIdx, scale, state.template, { x, y }, cutTx);
  paint();
  e.preventDefault();
}

function onMouseMove(e) {
  if (!drag || !canvas) return;
  const { x, y } = canvasCoords(e);
  applyDrag(drag, x, y);
}

function onMouseUp() {
  if (!drag) return;
  drag = null;
  paint();
}

function onContextMenu(e) {
  const slotIdx = state.selectedSlotIndex;
  if (slotIdx == null || !lastHandles) return;
  const { x, y } = canvasCoords(e);
  const scale = currentSize / REFERENCE_SLOT_SIZE;
  if (scale <= 0) return;
  const hit = hitTest(lastHandles, x / scale, y / scale, scale);
  if (!hit) return;
  e.preventDefault();
  clearHit(hit, slotIdx);
}

function canvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function currentSlot() {
  const idx = state.selectedSlotIndex;
  if (idx == null) return null;
  return state.template?.slots.find((s) => s.index === idx) || null;
}
