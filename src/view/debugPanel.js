import { settings } from "../controller/storage.js";
import { CORNER_COLOR, CORNER_LABEL, ROLE_COLOR } from "../core/pointGraph/render.js";
import { NOISE_OVERLAY_COLORS } from "./render2/noiseOverlay.js";

// Single source of truth for the Debug panel. ONE list of "aspects": each is a
// debug facet that BOTH draws on the canvas (if it has a visual) AND contributes
// data to the clipboard payload. Toggling an aspect on = you see it AND you copy
// it, so the user's visual matches the data handed off for debugging.
//
// Persisted under one settings key. Drawing reads isAspectActive(key) (drawGraph
// + overlays); the clipboard builder (debug/click.js) reads the same keys.

const ASPECTS_KEY = "debugAspects";

// Orange = merged-cut overlay (matches drawGraph mergedCutColor).
const MERGED_CUT_COLOR = "#ff9933";
// Purple = noise cut chains (matches drawGraph noiseCutColor).
const NOISE_CUT_COLOR = "#cc88ff";

export { NOISE_OVERLAY_COLORS };

// cornerTypes the build/ops pipeline actually produces. interior/exterior are
// structural (count 0 / 4), default off — they exist in the data but aren't
// usually interesting to look at.
const CORNER_TYPES = [
  "outer-convex", "edge-midpoint", "outer-concave", "saddle",
  "bridge-corner", "soften-vertex", "wave-vertex", "noise-vertex", "merged-vertex",
];
const CORNER_TYPES_STRUCTURAL = ["interior", "exterior"];

// `defaultOff: true` flips the bootstrap default for noisy / heavy aspects.
export const ASPECTS = [
  // Connections — stroke on canvas + copies those connections (id/from/to/curve/
  // role/kind/chordLen, plus interiorSide/chainId when their decoration is on).
  { group: "Connections", key: "role.cut",      swatch: { kind: "line", color: ROLE_COLOR.cut },      label: "cut (visible terrain edge)" },
  { group: "Connections", key: "role.closure",  swatch: { kind: "line", color: ROLE_COLOR.closure },  label: "closure (slot edge, filled side)" },
  { group: "Connections", key: "role.internal", swatch: { kind: "line", color: ROLE_COLOR.internal }, label: "internal (invisible edge)", defaultOff: true },
  { group: "Connections", key: "role.noise",    swatch: { kind: "line", color: NOISE_CUT_COLOR },     label: "noise cut chain (marching squares)" },
  { group: "Connections", key: "role.merged",   swatch: { kind: "line", color: MERGED_CUT_COLOR },    label: "merged-cut (boolean cut ∪/∖ noise)", defaultOff: true },

  // Connection decorations — draw-only hints; toggling also adds the matching
  // field (interiorSide / chainId) to copied connections.
  { group: "Connection decorations", key: "decoration.chainOffset", swatch: { kind: "offsetPair" }, label: "chainId hue (parallel offset) → chainId" },
  { group: "Connection decorations", key: "decoration.sideTick",    swatch: { kind: "sideTick" },   label: "interiorSide tick (→ filled cell) → interiorSide" },

  // Points · cornerType — ring on canvas + copies points of that type.
  ...CORNER_TYPES.map((t) => ({
    group: "Points · cornerType", key: `corner.${t}`,
    swatch: { kind: "ring", color: CORNER_COLOR[t] }, label: CORNER_LABEL[t],
  })),
  ...CORNER_TYPES_STRUCTURAL.map((t) => ({
    group: "Points · cornerType", key: `corner.${t}`,
    swatch: { kind: "ring", color: CORNER_COLOR[t] }, label: CORNER_LABEL[t], defaultOff: true,
  })),

  // Point markers — marker on canvas + copies the matching field on points.
  { group: "Point markers", key: "marker.lockRing",        swatch: { kind: "lockRing" },     label: "locked point (inner ring) → lock" },
  { group: "Point markers", key: "marker.endpointDot",     swatch: { kind: "endpointDot" },  label: "chain endpoint (cutDegree = 1) → chainEndpoint" },
  { group: "Point markers", key: "marker.branchSquare",    swatch: { kind: "branchSquare" }, label: "chain branch (cutDegree ≥ 3)" },
  { group: "Point markers", key: "decoration.outwardNormal", swatch: { kind: "arrow" },      label: "outwardNormal arrow → outwardNormal" },

  // Overlays — region fills + copy the relevant params.
  { group: "Overlays", key: "overlay.cellTint",     swatch: { kind: "fill", color: "rgba(59, 158, 255, 0.22)" },   label: "cell tint (source pattern · filled)" },
  { group: "Overlays", key: "overlay.noiseHoles",   swatch: { kind: "fill", color: NOISE_OVERLAY_COLORS.holes },   label: "noise holes (A · carves filled) → noiseParams.A" },
  { group: "Overlays", key: "overlay.noisePatches", swatch: { kind: "fill", color: NOISE_OVERLAY_COLORS.patches }, label: "noise patches (B · adds to empty) → noiseParams.B" },

  // Data only — no visual; pure payload dumps. Default off (heavy / verbose).
  { group: "Data (no visual)", key: "data.params",       swatch: { kind: "data" }, label: "global params (seed · globalCurve · noiseParams)", defaultOff: true },
  { group: "Data (no visual)", key: "data.graph",        swatch: { kind: "data" }, label: "full graph dump", defaultOff: true },
  { group: "Data (no visual)", key: "data.inflateDebug", swatch: { kind: "data" }, label: "inflate debug", defaultOff: true },
];

let activeAspects = loadOrDefault();
const listeners   = new Set();
let onCopy = null;
// Per-group header checkbox + the aspect keys it governs (populated by
// initDebugPanel) so a category toggle drives all its rows, and the header
// reflects all / partial / none as checked / indeterminate / unchecked.
const groupRecords     = new Map(); // group name -> { headerCb, keys: [] }
const aspectCheckboxes = new Map(); // aspect key -> row checkbox

function loadOrDefault() {
  const saved = settings.get(ASPECTS_KEY);
  const out = {};
  for (const a of ASPECTS) {
    const s = saved?.[a.key];
    if (s == null) out[a.key] = !a.defaultOff;
    else           out[a.key] = s !== false;
  }
  return out;
}

function persist() { settings.set(ASPECTS_KEY, activeAspects); }
function notify()  { for (const fn of listeners) fn(); }

export function initDebugPanel() {
  const root = document.getElementById("debug-body");
  if (!root) return;
  root.className = "debug-layers";

  let currentGroup = null;
  let itemsEl = null;
  let rec = null;
  for (const a of ASPECTS) {
    if (a.group !== currentGroup) {
      currentGroup = a.group;
      const groupName = a.group;
      const header = document.createElement("label");
      header.className = "debug-layers__group";
      const gcb = document.createElement("input");
      gcb.type      = "checkbox";
      gcb.className  = "debug-layers__group-toggle";
      gcb.addEventListener("change", () => setGroup(groupName, gcb.checked));
      const gtext = document.createElement("span");
      gtext.textContent = groupName;
      header.appendChild(gcb);
      header.appendChild(gtext);
      root.appendChild(header);
      itemsEl = document.createElement("div");
      itemsEl.className = "debug-layers__items";
      root.appendChild(itemsEl);
      rec = { headerCb: gcb, keys: [] };
      groupRecords.set(groupName, rec);
    }
    rec.keys.push(a.key);

    const groupName = a.group;
    const row = document.createElement("label");
    row.className = "debug-layer";
    const cb = document.createElement("input");
    cb.type    = "checkbox";
    cb.checked = activeAspects[a.key];
    cb.dataset.aspect = a.key;
    cb.addEventListener("change", () => {
      activeAspects[a.key] = cb.checked;
      persist();
      syncGroup(groupName);
      notify();
    });
    aspectCheckboxes.set(a.key, cb);
    const swatch = buildSwatch(a.swatch);
    const label  = document.createElement("span");
    label.className   = "debug-layer__label";
    label.textContent = a.label;
    row.appendChild(cb);
    row.appendChild(swatch);
    row.appendChild(label);
    itemsEl.appendChild(row);
  }

  for (const g of groupRecords.keys()) syncGroup(g);

  document.getElementById("debug-all-on")?.addEventListener("click",  () => setAll(true));
  document.getElementById("debug-all-off")?.addEventListener("click", () => setAll(false));
  document.getElementById("debug-copy")?.addEventListener("click",    () => onCopy?.());
}

// Category on/off: set every aspect in the group + sync its rows and header.
function setGroup(group, value) {
  const rec = groupRecords.get(group);
  if (!rec) return;
  for (const key of rec.keys) {
    activeAspects[key] = value;
    const cb = aspectCheckboxes.get(key);
    if (cb) cb.checked = value;
  }
  rec.headerCb.checked       = value;
  rec.headerCb.indeterminate = false;
  persist();
  notify();
}

// Reflect all / partial / none of a group on its header checkbox.
function syncGroup(group) {
  const rec = groupRecords.get(group);
  if (!rec) return;
  let on = 0;
  for (const key of rec.keys) if (activeAspects[key]) on++;
  rec.headerCb.checked       = on === rec.keys.length;
  rec.headerCb.indeterminate = on > 0 && on < rec.keys.length;
}

function setAll(value) {
  for (const a of ASPECTS) activeAspects[a.key] = value;
  persist();
  for (const cb of aspectCheckboxes.values()) cb.checked = value;
  for (const g of groupRecords.keys()) syncGroup(g);
  notify();
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
    case "data":
      el.style.border       = "1px dashed rgba(255,255,255,0.32)";
      el.style.boxSizing    = "border-box";
      break;
  }
  return el;
}

export function isAspectActive(key)  { return activeAspects[key] !== false; }
export function getActiveAspects()   { return activeAspects; }
export function onAspectsChange(fn)  { listeners.add(fn); return () => listeners.delete(fn); }
export function setCopyHandler(fn)   { onCopy = fn; }
