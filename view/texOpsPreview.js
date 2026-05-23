// Texture · global panel — preview canvas. Extracted from texOpsPanel.js
// so the UI builder and the canvas renderer live in separate files.
//
// API: initTexOpsPreview({ canvas, stage }) → object with paint() +
// setters for the panel's preview state (active pool, view mode,
// shuffle seed). The panel owns the UI and forwards user actions in;
// this file owns the canvas rendering.

import { state } from "../controller/state.js";
import { applyRenderModeClass } from "./projectBar.js";
import { TEXTURE_OPS } from "./render2/textureOps/registry.js";

const GRID = 3;
const MIN_SIZE = 120;
// Max bound is dynamic — viewport-height fraction so the canvas can
// grow when the panel widens without pushing all controls below the fold.
const MAX_VIEWPORT_FRACTION = 0.75;

let canvasEl = null;
let ctx      = null;
let stageEl  = null;
let resizeObserver = null;

let activePool  = "A";
let shuffleSeed = 0;
// "tiles" = 3×3 raw bitmaps from active pool, "composite" = scaled
// snapshot of mainView (cut + texture + all ops fully rendered).
let viewMode = "tiles";

export function initTexOpsPreview({ canvas, stage }) {
  canvasEl = canvas;
  stageEl  = stage;
  if (!canvasEl || !stageEl) return false;
  ctx = canvasEl.getContext("2d");
  resizeObserver = new ResizeObserver(paint);
  resizeObserver.observe(stageEl);
  return true;
}

export function setActivePool(key) { activePool = key; paint(); }
export function setViewMode(mode)  { viewMode  = mode;  paint(); }
export function reshuffle()        { shuffleSeed = (shuffleSeed + 1) | 0; paint(); }
export function getActivePool()    { return activePool; }
export function getViewMode()      { return viewMode; }

// rAF-coalesce paint() so burst event listeners (e.g. curve "Random all"
// dispatching N global-curve:changed in a tick, bundle export firing
// per-project state events) collapse into a single repaint per frame.
// Critical for keeping the click handler under ~16ms instead of running
// the full texture-op pipeline once per dispatched event.
let paintPending = false;
export function paint() {
  if (paintPending) return;
  paintPending = true;
  requestAnimationFrame(() => {
    paintPending = false;
    doPaint();
  });
}

function doPaint() {
  if (!canvasEl || !ctx || !stageEl) return;
  applyRenderModeClass(canvasEl);

  // Tiles = square (3×3 grid). Composite = aspect of main canvas
  // (= template layout cols/rows). Sizes fill the panel width while
  // height stays clamped by viewport so controls remain reachable.
  const { w, h } = computeFitDims(viewMode);
  const dpr = window.devicePixelRatio || 1;
  canvasEl.width  = w * dpr;
  canvasEl.height = h * dpr;
  canvasEl.style.width  = w + "px";
  canvasEl.style.height = h + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = state.renderMode !== "pixel";

  if (viewMode === "composite") paintCompositeView(w, h);
  else                          paintTileGrid(w, h);
}

function paintTileGrid(w, h) {
  const refs = pickTiles();
  if (refs.length === 0) {
    drawPlaceholder(w, h, `Pool ${activePool} is empty`);
    return;
  }
  // Square cells centred in the (square) canvas.
  const side = Math.min(w, h);
  const cellSize = Math.floor(side / GRID);
  const offX = (w - cellSize * GRID) / 2;
  const offY = (h - cellSize * GRID) / 2;
  for (let i = 0; i < refs.length; i++) {
    const r = Math.floor(i / GRID);
    const c = i % GRID;
    const x = offX + c * cellSize;
    const y = offY + r * cellSize;
    const tile = resolveTile(refs[i]);
    if (!tile) continue;
    let bmp = tile.canvas;
    for (const op of TEXTURE_OPS) {
      const params = state.getGlobalTextureOp(activePool, op.name);
      if (params) bmp = op.apply(bmp, activePool, params);
    }
    ctx.drawImage(bmp, x, y, cellSize, cellSize);
  }
}

function paintCompositeView(w, h) {
  const src = document.querySelector(".main-template");
  if (!src || !src.width || !src.height) {
    drawPlaceholder(w, h, "Main preview not active");
    return;
  }
  // Canvas dims already match aspect — fill completely.
  ctx.drawImage(src, 0, 0, w, h);
}

function drawPlaceholder(w, h, msg) {
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = "12px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(msg, w / 2, h / 2);
}

function pickTiles() {
  const pool = state.pool(activePool) || [];
  const n = pool.length;
  if (n === 0) return [];
  const total = GRID * GRID;
  const rand = makeRng(shuffleSeed);
  const out = new Array(total);
  for (let i = 0; i < total; i++) out[i] = pool[Math.floor(rand() * n)];
  return out;
}

function makeRng(seed) {
  let s = (seed | 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 0) % 1_000_003) / 1_000_003; };
}

function resolveTile(ref) {
  if (!ref) return null;
  const input = state.inputs.find((inp) => inp.id === ref.inputId);
  if (!input) return null;
  return input.tiles.find((t) => t.row === ref.tileRow && t.col === ref.tileCol) || null;
}

// Returns { w, h } sized to fill the panel width, with an aspect that
// matches the current view (square for tiles, mainView aspect for
// composite). Height clamped by MAX_VIEWPORT_FRACTION so the canvas
// doesn't push every op control below the fold.
function computeFitDims(mode) {
  const cs = getComputedStyle(stageEl);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const availW = Math.floor(stageEl.clientWidth - padX);
  const maxH = Math.floor(window.innerHeight * MAX_VIEWPORT_FRACTION);

  let aspect = 1;
  if (mode === "composite") {
    const src = document.querySelector(".main-template");
    if (src && src.width && src.height) aspect = src.width / src.height;
  }

  let w = availW;
  let h = Math.floor(w / aspect);
  if (h > maxH) { h = maxH; w = Math.floor(h * aspect); }
  w = Math.max(MIN_SIZE, w);
  h = Math.max(MIN_SIZE, h);
  return { w, h };
}
