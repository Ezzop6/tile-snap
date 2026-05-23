import { state } from "../controller/state.js";
import { TEXTURE_OPS, TEXTURE_OP_CATEGORIES } from "./render2/textureOps/registry.js";
import {
  initTexOpsPreview, paint as paintPreview, reshuffle,
  setActivePool, setViewMode, getActivePool, getViewMode,
} from "./texOpsPreview.js";

// Texture · global panel. Per-pool params (A and B independent); the UI
// is generated from TEXTURE_OPS registry — adding a new op = one entry
// in registry.js, no HTML/JS changes here. Canvas rendering lives in
// texOpsPreview.js so this file stays focused on the controls UI.

let bodyEl        = null;
let widthObserver = null;

// id → { type, opName, key, default, max, min, el(s) }
const _controls = new Map();

export function initTexOpsPanel() {
  const canvas = document.getElementById("tex-ops-canvas");
  const stage  = document.getElementById("tex-ops-stage");
  bodyEl = document.getElementById("tex-ops-body");
  if (!canvas || !stage) return;
  if (!initTexOpsPreview({ canvas, stage })) return;

  buildOpsUI();
  wirePoolSwitch();
  wireViewSwitch();
  wireShuffle();
  wireResetAll();
  wireWideMode();

  // Repaint catches anything affecting either Tiles (raw pool bitmaps) or
  // Preview (mainView snapshot). Mirror mainView's listener set so the
  // composite snapshot stays in sync with whatever it draws.
  state.addEventListener("pools:changed",               paintPreview);
  state.addEventListener("slot-pool-override:changed",  paintPreview);
  state.addEventListener("input:added",                 paintPreview);
  state.addEventListener("input:updated",               paintPreview);
  state.addEventListener("input:removed",               paintPreview);
  state.addEventListener("template:changed",            paintPreview);
  state.addEventListener("slot-selection:changed",      paintPreview);
  state.addEventListener("global-curve:changed",        paintPreview);
  state.addEventListener("noise:changed",               paintPreview);
  state.addEventListener("seed:changed",                paintPreview);
  state.addEventListener("tile-offsets:changed",        paintPreview);
  state.addEventListener("slot-cut-transform:changed",  paintPreview);
  state.addEventListener("slot-texture-transform:changed", paintPreview);
  state.addEventListener("texture-ops:changed",         paintPreview);
  state.addEventListener("render-mode:changed",         paintPreview);

  paintPreview();
}

// Auto-expand mode: when the panel grows wider than half the viewport,
// flip the body into multi-column grid + force-expand every category
// and op (CSS overrides is-collapsed). User's collapse clicks are
// preserved in classes and re-take effect when the panel shrinks back.
function wireWideMode() {
  if (!bodyEl) return;
  const update = () => {
    const wide = bodyEl.getBoundingClientRect().width > window.innerWidth * 0.5;
    bodyEl.classList.toggle("is-wide", wide);
  };
  widthObserver = new ResizeObserver(update);
  widthObserver.observe(bodyEl);
  window.addEventListener("resize", update);
  update();
}

// Render category sections from registry; each category holds collapsible
// op sub-sections. Both levels default to collapsed → user sees just the
// category names and drills in.
function buildOpsUI() {
  const host = document.getElementById("tex-ops-ops");
  if (!host) return;
  host.innerHTML = "";
  for (const cat of TEXTURE_OP_CATEGORIES) {
    const opsInCat = TEXTURE_OPS.filter((o) => o.category === cat.id);
    if (opsInCat.length === 0) continue;
    host.appendChild(buildCategorySection(cat, opsInCat));
  }
  syncControlsToActivePool();
}

function buildCategorySection(cat, ops) {
  const section = document.createElement("div");
  section.className = "tex-ops__category is-collapsed";

  const header = document.createElement("div");
  header.className = "tex-ops__cat-header";
  header.addEventListener("click", () => section.classList.toggle("is-collapsed"));

  const title = document.createElement("h3");
  title.className = "tex-ops__cat-title";
  title.textContent = cat.label;
  header.appendChild(title);

  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "curve-panel__btn";
  reset.textContent = "↺";
  reset.title = `Reset ${cat.label} (active pool)`;
  reset.addEventListener("click", (e) => {
    e.stopPropagation();
    resetCategory(ops);
  });
  header.appendChild(reset);

  section.appendChild(header);
  for (const op of ops) section.appendChild(buildOpSection(op));
  return section;
}

function resetCategory(ops) {
  const pool = getActivePool();
  for (const op of ops) {
    for (const ctrl of op.controls) {
      state.setGlobalTextureOpParam(pool, op.name, ctrl.key, ctrl.default);
    }
  }
  syncControlsToActivePool();
}

function buildOpSection(op) {
  const section = document.createElement("div");
  section.className = "tex-ops__op";
  const title = document.createElement("h4");
  title.className = "tex-ops__op-title";
  title.textContent = op.label;
  section.appendChild(title);
  for (const ctrl of op.controls) {
    section.appendChild(buildControl(op.name, ctrl));
  }
  return section;
}

function buildControl(opName, ctrl) {
  if (ctrl.type === "select") return buildSelect(opName, ctrl);
  return buildSlider(opName, ctrl);
}

function buildSlider(opName, ctrl) {
  const field = document.createElement("label");
  field.className = "curve-panel__field";

  const label = document.createElement("span");
  label.className = "curve-panel__label";
  label.textContent = ctrl.label;
  if (ctrl.tooltip) label.title = ctrl.tooltip;

  const slider = document.createElement("input");
  slider.className = "curve-panel__slider";
  slider.type = "range";
  slider.min = String(ctrl.min);
  slider.max = String(ctrl.max);
  slider.step = String(ctrl.step ?? 1);

  const value = document.createElement("input");
  value.className = "curve-panel__value curve-panel__value--editable";
  value.type = "number";
  value.min = String(ctrl.min);
  value.max = String(ctrl.max);
  value.step = String(ctrl.step ?? 1);

  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "curve-panel__btn";
  reset.textContent = "↺";
  reset.title = `Reset ${ctrl.label} to ${ctrl.default}`;

  const push = (raw) => {
    const v = Math.max(ctrl.min, Math.min(ctrl.max, parseFloat(raw) || 0));
    state.setGlobalTextureOpParam(getActivePool(), opName, ctrl.key, v);
    slider.value = String(v);
    value.value  = String(v);
  };
  slider.addEventListener("input", () => push(slider.value));
  value.addEventListener("change", () => push(value.value));
  reset.addEventListener("click", () => push(ctrl.default));

  field.appendChild(label);
  field.appendChild(slider);
  field.appendChild(value);
  field.appendChild(reset);

  _controls.set(`${opName}.${ctrl.key}`, { kind: "slider", slider, value, ctrl, opName });
  return field;
}

function buildSelect(opName, ctrl) {
  const field = document.createElement("label");
  field.className = "curve-panel__field";

  const label = document.createElement("span");
  label.className = "curve-panel__label";
  label.textContent = ctrl.label;
  if (ctrl.tooltip) label.title = ctrl.tooltip;

  const sel = document.createElement("select");
  sel.className = "slot-override__select";
  for (const opt of ctrl.options) {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    sel.appendChild(o);
  }
  sel.addEventListener("change", () => {
    state.setGlobalTextureOpParam(getActivePool(), opName, ctrl.key, sel.value);
  });

  field.appendChild(label);
  field.appendChild(sel);

  _controls.set(`${opName}.${ctrl.key}`, { kind: "select", sel, ctrl, opName });
  return field;
}

function wirePoolSwitch() {
  const root = document.getElementById("tex-ops-pool-switch");
  if (!root) return;
  for (const btn of root.querySelectorAll("[data-pool]")) {
    btn.addEventListener("click", () => {
      const next = btn.dataset.pool;
      if (!next || next === getActivePool()) return;
      setActivePool(next);
      for (const b of root.querySelectorAll("[data-pool]")) {
        b.classList.toggle("is-active", b.dataset.pool === next);
      }
      syncControlsToActivePool();
    });
  }
}

function wireViewSwitch() {
  const root = document.getElementById("tex-ops-view-switch");
  if (!root) return;
  for (const btn of root.querySelectorAll("[data-view]")) {
    btn.addEventListener("click", () => {
      const next = btn.dataset.view;
      if (!next || next === getViewMode()) return;
      setViewMode(next);
      for (const b of root.querySelectorAll("[data-view]")) {
        b.classList.toggle("is-active", b.dataset.view === next);
      }
    });
  }
}

function wireShuffle() {
  document.getElementById("tex-ops-shuffle")?.addEventListener("click", () => reshuffle());
}

function wireResetAll() {
  document.getElementById("tex-ops-reset")?.addEventListener("click", () => {
    const pool = getActivePool();
    for (const op of TEXTURE_OPS) {
      for (const ctrl of op.controls) {
        state.setGlobalTextureOpParam(pool, op.name, ctrl.key, ctrl.default);
      }
    }
    syncControlsToActivePool();
  });
}

function syncControlsToActivePool() {
  const pool = getActivePool();
  for (const op of TEXTURE_OPS) {
    const params = state.getGlobalTextureOp(pool, op.name) || {};
    for (const ctrl of op.controls) {
      const c = _controls.get(`${op.name}.${ctrl.key}`);
      if (!c) continue;
      const v = params[ctrl.key] ?? ctrl.default;
      if (c.kind === "slider") {
        c.slider.value = String(v);
        c.value.value  = String(v);
      } else {
        c.sel.value = String(v);
      }
    }
  }
}

