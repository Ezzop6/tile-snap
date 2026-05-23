import { state } from "../controller/state.js";
import { splitIntoTiles } from "../core/source.js";
import { settings, images, projects as projectStorage } from "../controller/storage.js";
import { refreshProjectModal } from "./projectModal.js";
import { showDialog } from "./dialog.js";
import { getActiveProjectId } from "./projectBar.js";

const COLS_MIN = 1;
const COLS_MAX = 6;
const COLS_DEFAULT = 1;
const COLS_SETTING_KEY = "inputsCols";

let listEl = null;
let searchInput = null;
let colsInput = null;
let searchQuery = "";

export function initInputsPanel() {
  listEl = document.getElementById("inputs-list");
  if (!listEl) {
    console.warn("[inputsPanel] #inputs-list element missing");
    return;
  }

  initToolbar();

  state.addEventListener("input:added",   (e) => {
    listEl.appendChild(buildCard(e.detail));
    applySearchFilter();
  });
  state.addEventListener("input:removed", (e) => findCard(e.detail)?.remove());
  state.addEventListener("input:updated", (e) => {
    const card = findCard(e.detail.id);
    if (card) {
      updateCard(card, e.detail);
      applySearchFilter();
    }
  });

  const redrawAll = () => {
    for (const card of listEl.querySelectorAll(".input-card")) {
      const input = state.inputs.find(i => i.id === card.dataset.id);
      if (input) drawPreview(card.querySelector("canvas"), input);
    }
  };
  state.addEventListener("selection:changed", redrawAll);
  state.addEventListener("pools:changed",     redrawAll);
}

function initToolbar() {
  searchInput = document.getElementById("inputs-search");
  colsInput   = document.getElementById("inputs-cols");

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.trim().toLowerCase();
      applySearchFilter();
    });
  }

  if (colsInput) {
    const stored = clampCols(settings.get(COLS_SETTING_KEY, COLS_DEFAULT));
    colsInput.value = String(stored);
    applyCols(stored);
    colsInput.addEventListener("change", () => {
      const n = clampCols(parseInt(colsInput.value, 10));
      colsInput.value = String(n);
      applyCols(n);
      settings.set(COLS_SETTING_KEY, n);
    });
  }
}

function clampCols(v) {
  const n = Number.isFinite(v) ? Math.floor(v) : COLS_DEFAULT;
  return Math.max(COLS_MIN, Math.min(COLS_MAX, n));
}

function applyCols(n) {
  if (!listEl) return;
  listEl.style.setProperty("--inputs-cols", String(n));
}

async function deleteInput(input) {
  const usage = collectProjectsUsingInput(input.id);
  if (usage.length > 0) {
    const choice = await showDialog({
      title: `Delete "${input.name}"`,
      message: `This input is used in ${usage.length} project${usage.length === 1 ? "" : "s"}: ${usage.join(", ")}. They will lose this input. Continue?`,
      buttons: [
        { label: "Delete", value: "delete", variant: "danger" },
        { label: "Cancel", value: "cancel" },
      ],
    });
    if (choice !== "delete") return;
  }
  const hash = input.hash;
  state.removeInput(input.id);
  if (hash) images.delete(hash);
  // Footer in project modal shows total storage usage; refresh so the user
  // sees the freed bytes immediately.
  refreshProjectModal();
}

// Returns display names of projects (saved + live active) whose pool refs
// reference this inputId. Active project name gets a " (current)" suffix.
function collectProjectsUsingInput(inputId) {
  const out = [];
  const activeId = getActiveProjectId();
  const inActiveLive = ["A", "B"].some(
    (k) => state.pool(k).some((r) => r.inputId === inputId),
  );
  if (inActiveLive) {
    out.push(`${state.projectName} (current)`);
  }
  for (const meta of projectStorage.list()) {
    if (meta.id === activeId) continue; // already covered via live state above
    const data = projectStorage.load(meta.id);
    const referenced = ["A", "B"].some((k) =>
      (data?.pools?.[k] || []).some((r) => r.inputId === inputId),
    );
    if (referenced) out.push(meta.name);
  }
  return out;
}

function applySearchFilter() {
  if (!listEl) return;
  const q = searchQuery;
  for (const card of listEl.querySelectorAll(".input-card")) {
    const name = (card.dataset.name || "").toLowerCase();
    card.classList.toggle("is-hidden", q !== "" && !name.includes(q));
  }
}

function findCard(id) {
  return listEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
}

function buildCard(input) {
  const card = el("li", "input-card", { "data-id": input.id, "data-name": input.name });

  const header = el("header", "input-card__header");
  const name = el("span", "input-card__name");
  name.textContent = input.name;
  name.title = input.name;
  const del = el("button", "input-card__delete", { type: "button", "aria-label": "Delete input", title: "Delete this input (and remove the image from storage if no saved project still uses it)" });
  del.textContent = "🗑";
  del.addEventListener("click", () => deleteInput(input));
  header.append(name, del);

  const controls = el("div", "input-card__controls");
  const tsLabel = el("label", "input-card__tile-size-label");
  tsLabel.append(document.createTextNode("Tile "));
  const tsInput = el("input", "input-card__tile-size", {
    type: "number", min: "1", max: "512", step: "1",
  });
  tsInput.value = String(input.tileSize);
  tsInput.addEventListener("change", () => onTileSizeChanged(input, tsInput));
  tsLabel.append(tsInput, document.createTextNode(" px"));
  const info = el("span", "input-card__info");
  controls.append(tsLabel, info);

  const previewWrap = el("div", "input-card__preview");
  const previewCanvas = document.createElement("canvas");
  previewCanvas.addEventListener("click", (e) => onTileClick(e, input, previewCanvas));
  previewWrap.append(previewCanvas);

  card.append(header, controls, previewWrap);

  updateCard(card, input);
  return card;
}

function updateCard(card, input) {
  const tsInput = card.querySelector(".input-card__tile-size");
  if (parseInt(tsInput.value, 10) !== input.tileSize) {
    tsInput.value = String(input.tileSize);
  }

  card.dataset.name = input.name;
  card.querySelector(".input-card__info").textContent =
    `${input.cols}×${input.rows} · ${input.source.width}×${input.source.height}px`;

  drawPreview(card.querySelector("canvas"), input);
}

function onTileSizeChanged(input, tsInput) {
  const v = parseInt(tsInput.value, 10);
  if (!Number.isFinite(v) || v <= 0) {
    tsInput.value = String(input.tileSize);
    return;
  }
  if (v === input.tileSize) return;
  const { tiles, cols, rows } = splitIntoTiles(input.source, v);
  state.updateInput(input.id, { tileSize: v, cols, rows, tiles });
}

function onTileClick(e, input, canvas) {
  const rect = canvas.getBoundingClientRect();
  // Canvas is native-pixel sized, CSS-scaled; map click back via ratio.
  const xRatio = (e.clientX - rect.left) / rect.width;
  const yRatio = (e.clientY - rect.top) / rect.height;
  const px = xRatio * input.source.width;
  const py = yRatio * input.source.height;
  const col = Math.floor(px / input.tileSize);
  const row = Math.floor(py / input.tileSize);
  if (col < 0 || col >= input.cols) return;
  if (row < 0 || row >= input.rows) return;

  const cur = state.selectedTile;
  if (cur && cur.inputId === input.id && cur.tileCol === col && cur.tileRow === row) {
    state.clearTileSelection();
  } else {
    state.selectTile(input.id, col, row);
  }
}

function drawPreview(canvas, input) {
  const dpr = window.devicePixelRatio || 1;
  const w = input.source.width;
  const h = input.source.height;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.aspectRatio = `${w} / ${h}`;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  ctx.drawImage(input.source.canvas, 0, 0, w, h);

  ctx.strokeStyle = "rgba(0, 220, 255, 0.55)";
  ctx.lineWidth = 1;
  const ts = input.tileSize;
  for (let x = 0; x <= w; x += ts) {
    const xPx = Math.min(x, w) + 0.5;
    ctx.beginPath();
    ctx.moveTo(xPx, 0);
    ctx.lineTo(xPx, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += ts) {
    const yPx = Math.min(y, h) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, yPx);
    ctx.lineTo(w, yPx);
    ctx.stroke();
  }

  // Drawn before selection highlight so the click ring stays on top.
  drawPoolBadges(ctx, input, ts);

  const sel = state.selectedTile;
  if (sel && sel.inputId === input.id) {
    const sx = sel.tileCol * ts;
    const sy = sel.tileRow * ts;
    ctx.fillStyle = "rgba(255, 180, 0, 0.30)";
    ctx.fillRect(sx, sy, ts, ts);
    ctx.strokeStyle = "rgba(255, 180, 0, 1)";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 1, sy + 1, ts - 2, ts - 2);
  }
}

// Read from CSS tokens so a re-skin (tokens.css) flows through to canvas triangles + UI together.
function poolColor(key) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--color-pool-${key.toLowerCase()}`).trim() || "#888";
}

// Corner triangle indicator: A top-left, B top-right so both show when a tile
// is in both pools. Master = filled, variant = outline only.
function drawPoolBadges(ctx, input, ts) {
  const triSize = Math.min(14, Math.floor(ts * 0.4));
  for (const key of ["A", "B"]) {
    const pool = state.pool(key);
    const color = poolColor(key);
    for (let i = 0; i < pool.length; i++) {
      const ref = pool[i];
      if (ref.inputId !== input.id) continue;
      const isMaster = i === 0;
      const cx = ref.tileCol * ts;
      const cy = ref.tileRow * ts;
      ctx.beginPath();
      if (key === "A") {
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + triSize, cy);
        ctx.lineTo(cx, cy + triSize);
      } else {
        ctx.moveTo(cx + ts, cy);
        ctx.lineTo(cx + ts - triSize, cy);
        ctx.lineTo(cx + ts, cy + triSize);
      }
      ctx.closePath();
      if (isMaster) {
        ctx.fillStyle = color;
        ctx.fill();
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth   = 1.5;
        ctx.stroke();
      }
    }
  }
}

function el(tag, className, attrs) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  }
  return node;
}
