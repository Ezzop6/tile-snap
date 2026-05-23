import { settings } from "../controller/storage.js";
import { CORNER_COLOR, CORNER_LABEL, ROLE_COLOR } from "../core/pointGraph/render.js";
import { NOISE_OVERLAY_COLORS } from "./render2/noiseOverlay.js";

const FIELDS_KEY = "debugFields";
const LAYERS_KEY = "debugLayers";

// Orange used for the merged-cut overlay; matches drawGraph DEFAULTS.mergedCutColor.
const MERGED_CUT_COLOR = "#ff9933";
// Purple matches drawGraph DEFAULTS.noiseCutColor — same value, here for the swatch.
const NOISE_CUT_COLOR = "#cc88ff";

export { NOISE_OVERLAY_COLORS };

export const FIELDS = {
  slot: ["index", "col", "row", "array", "origin",
         "terrainMode", "gridKind", "connectedSaddle",
         "seed", "globalCurve", "noiseParams",
         "graph", "inflateDebug", "pointPositions", "arcs"],
  point: ["id", "basePos", "pos", "lock", "cornerType", "outwardNormal",
          "miterScale", "cutDegree", "chainEndpoint", "slot"],
  connection: ["id", "from", "to", "kind", "role", "curve",
               "interiorSide", "chainId", "chordLen", "slot"],
};

const CORNER_TYPES = [
  "outer-convex", "edge-midpoint", "outer-concave", "saddle",
  "bridge-corner", "soften-vertex", "wave-vertex",
  "noise-vertex", "merged-vertex",
];

// `defaultOff: true` flips the bootstrap default — used for role.merged so
// the boolean-union overlay doesn't hide the underlying red cuts on first
// open. User toggle still persists normally once changed.
export const LAYERS = [
  ...CORNER_TYPES.map((t) => ({
    group: "Points · cornerType (outer ring)",
    key:   `corner.${t}`,
    swatch:{ kind: "ring", color: CORNER_COLOR[t] },
    label: CORNER_LABEL[t],
  })),
  { group: "Points · markers (inner)", key: "marker.lockRing",     swatch: { kind: "lockRing" },     label: "locked point (inner ring)" },
  { group: "Points · markers (inner)", key: "marker.endpointDot",  swatch: { kind: "endpointDot" },  label: "chain endpoint (cutDegree = 1)" },
  { group: "Points · markers (inner)", key: "marker.branchSquare", swatch: { kind: "branchSquare" }, label: "chain branch (cutDegree ≥ 3)" },
  { group: "Connections · role (stroke)", key: "role.cut",      swatch: { kind: "line",       color: ROLE_COLOR.cut },      label: "cut (visible terrain edge)" },
  { group: "Connections · role (stroke)", key: "role.noise",    swatch: { kind: "line",       color: NOISE_CUT_COLOR },     label: "noise cut chain (marching-squares contour)" },
  { group: "Connections · role (stroke)", key: "role.merged",   swatch: { kind: "line",       color: MERGED_CUT_COLOR },    label: "merged-cut (boolean cut ∪/∖ noise)", defaultOff: true },
  { group: "Connections · role (stroke)", key: "role.closure",  swatch: { kind: "line",       color: ROLE_COLOR.closure },  label: "closure (slot edge, filled)" },
  { group: "Connections · role (stroke)", key: "role.internal", swatch: { kind: "line",       color: ROLE_COLOR.internal }, label: "internal (invisible)" },
  { group: "Connections · role (stroke)", key: "kindOuterDash", swatch: { kind: "dashedLine", color: ROLE_COLOR.internal }, label: "dashed = kind: outer" },
  { group: "Connections · markers", key: "decoration.chainOffset",   swatch: { kind: "offsetPair" }, label: "parallel offset = chainId hue" },
  { group: "Connections · markers", key: "decoration.sideTick",      swatch: { kind: "sideTick" },   label: "tick → interiorSide (filled cell)" },
  { group: "Connections · markers", key: "decoration.outwardNormal", swatch: { kind: "arrow" },      label: "outwardNormal (point → away)" },
  { group: "Overlays", key: "overlay.cellTint",     swatch: { kind: "fill", color: "rgba(59, 158, 255, 0.22)" },        label: "cell tint (source pattern · filled)" },
  { group: "Overlays", key: "overlay.noiseHoles",   swatch: { kind: "fill", color: NOISE_OVERLAY_COLORS.holes },        label: "noise hole — inside cut region (A · carves filled)" },
  { group: "Overlays", key: "overlay.noisePatches", swatch: { kind: "fill", color: NOISE_OVERLAY_COLORS.patches },      label: "noise patch — outside cut region (B · adds to empty)" },
];

let active        = loadOrDefault();
let activeLayers  = loadLayersOrDefault();
const listeners       = new Set();
const layerListeners  = new Set();
let onCopy = null;

function loadOrDefault() {
  const saved = settings.get(FIELDS_KEY);
  const out = {};
  for (const kind of Object.keys(FIELDS)) {
    out[kind] = {};
    for (const f of FIELDS[kind]) {
      out[kind][f] = saved?.[kind]?.[f] !== false;
    }
  }
  return out;
}

function loadLayersOrDefault() {
  const saved = settings.get(LAYERS_KEY);
  const out = {};
  for (const l of LAYERS) {
    const s = saved?.[l.key];
    if (s == null) out[l.key] = !l.defaultOff;
    else           out[l.key] = s !== false;
  }
  return out;
}

function persist()       { settings.set(FIELDS_KEY, active); }
function persistLayers() { settings.set(LAYERS_KEY, activeLayers); }

function notify()       { for (const fn of listeners)      fn(); }
function notifyLayers() { for (const fn of layerListeners) fn(); }

export function initDebugPanel() {
  const root = document.getElementById("debug-body");
  if (!root) return;

  for (const kind of Object.keys(FIELDS)) {
    const grp = document.createElement("div");
    grp.className = "debug-group";
    const title = document.createElement("div");
    title.className = "debug-group__title";
    title.textContent = kind;
    grp.appendChild(title);
    for (const f of FIELDS[kind]) {
      const lbl = document.createElement("label");
      lbl.className = "debug-field";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = active[kind][f];
      input.dataset.kind  = kind;
      input.dataset.field = f;
      input.addEventListener("change", () => {
        active[kind][f] = input.checked;
        persist();
        notify();
      });
      const span = document.createElement("span");
      span.textContent = f;
      lbl.appendChild(input);
      lbl.appendChild(span);
      grp.appendChild(lbl);
    }
    root.appendChild(grp);
  }

  document.getElementById("debug-all-on")?.addEventListener("click",  () => setAll(true));
  document.getElementById("debug-all-off")?.addEventListener("click", () => setAll(false));
  document.getElementById("debug-copy")?.addEventListener("click",    () => onCopy?.());

  buildLayersDom();
}

function buildLayersDom() {
  const root = document.getElementById("debug-layers-body");
  if (!root) return;
  let currentGroup = null;
  let groupEl = null;
  for (const layer of LAYERS) {
    if (layer.group !== currentGroup) {
      currentGroup = layer.group;
      const header = document.createElement("div");
      header.className = "debug-layers__group";
      header.textContent = layer.group;
      root.appendChild(header);
      groupEl = document.createElement("div");
      groupEl.className = "debug-layers__items";
      root.appendChild(groupEl);
    }
    const row = document.createElement("label");
    row.className = "debug-layer";
    const cb = document.createElement("input");
    cb.type    = "checkbox";
    cb.checked = activeLayers[layer.key];
    cb.dataset.layer = layer.key;
    cb.addEventListener("change", () => {
      activeLayers[layer.key] = cb.checked;
      persistLayers();
      notifyLayers();
    });
    const swatch = buildSwatch(layer.swatch);
    const label = document.createElement("span");
    label.className = "debug-layer__label";
    label.textContent = layer.label;
    row.appendChild(cb);
    row.appendChild(swatch);
    row.appendChild(label);
    groupEl.appendChild(row);
  }

  document.getElementById("debug-layers-all-on")?.addEventListener("click",  () => setAllLayers(true));
  document.getElementById("debug-layers-all-off")?.addEventListener("click", () => setAllLayers(false));
}

function setAllLayers(value) {
  for (const l of LAYERS) activeLayers[l.key] = value;
  persistLayers();
  document.querySelectorAll("#debug-layers-body input[type=checkbox]")
    .forEach((cb) => { cb.checked = value; });
  notifyLayers();
}

function buildSwatch(spec) {
  const el = document.createElement("span");
  el.className = "debug-layer__swatch";
  switch (spec.kind) {
    case "ring":
      el.style.border       = `1.4px solid ${spec.color}`;
      el.style.borderRadius = "50%";
      el.style.boxSizing    = "border-box";
      break;
    case "lockRing":
      el.style.border       = "1px solid #888";
      el.style.borderRadius = "50%";
      el.style.boxSizing    = "border-box";
      el.innerHTML          = `<span class="debug-layer__swatch-inner-ring"></span>`;
      break;
    case "endpointDot":
      el.style.border       = "1px solid #888";
      el.style.borderRadius = "50%";
      el.style.boxSizing    = "border-box";
      el.innerHTML          = `<span class="debug-layer__swatch-dot"></span>`;
      break;
    case "branchSquare":
      el.style.border       = "1px solid #888";
      el.style.borderRadius = "50%";
      el.style.boxSizing    = "border-box";
      el.innerHTML          = `<span class="debug-layer__swatch-square"></span>`;
      break;
    case "line":
      el.style.background   = spec.color;
      el.style.height       = "2px";
      el.style.alignSelf    = "center";
      break;
    case "dashedLine":
      el.style.height       = "2px";
      el.style.alignSelf    = "center";
      el.style.backgroundImage =
        `repeating-linear-gradient(to right, ${spec.color} 0 3px, transparent 3px 5px)`;
      break;
    case "offsetPair":
      el.style.height       = "10px";
      el.style.alignSelf    = "center";
      el.innerHTML          = `
        <span class="debug-layer__swatch-pair-a"></span>
        <span class="debug-layer__swatch-pair-b" style="background:${ROLE_COLOR.cut}"></span>`;
      break;
    case "sideTick":
      el.style.height       = "10px";
      el.style.alignSelf    = "center";
      el.innerHTML          = `
        <span class="debug-layer__swatch-pair-b" style="top:5px;background:${ROLE_COLOR.cut}"></span>
        <span class="debug-layer__swatch-tick"></span>`;
      break;
    case "arrow":
      el.style.background   = "rgba(255,255,255,0.5)";
      el.style.height       = "1px";
      el.style.alignSelf    = "center";
      break;
    case "fill":
      el.style.background   = spec.color;
      el.style.border       = "1px solid rgba(255,255,255,0.18)";
      el.style.boxSizing    = "border-box";
      break;
  }
  return el;
}

function setAll(value) {
  for (const kind of Object.keys(FIELDS)) {
    for (const f of FIELDS[kind]) active[kind][f] = value;
  }
  persist();
  document.querySelectorAll("#debug-body input[type=checkbox]")
    .forEach((cb) => { cb.checked = value; });
  notify();
}

export function filterPayload(kind, full) {
  const fields = active[kind] || {};
  const out = {};
  for (const f of Object.keys(full)) {
    if (fields[f] !== false) out[f] = full[f];
  }
  return out;
}

export function onFieldsChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function setCopyHandler(fn) { onCopy = fn; }

export function isLayerActive(key) { return activeLayers[key] !== false; }

export function getActiveLayers() { return activeLayers; }

export function onLayersChange(fn) { layerListeners.add(fn); return () => layerListeners.delete(fn); }
