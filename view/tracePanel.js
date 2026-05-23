import { state } from "../controller/state.js";
import {
  setTracingEnabled,
  getLastTimings,
  onTimingsChange,
} from "../core/trace.js";

// Centred-on-screen overlay showing last-burst pipeline timings (per
// PointGraph op + per texture op). Two independent topbar toggles:
//   ⏱  visibility — show / hide overlay
//   ⏺  recording  — start / stop data collection
// Independent so the user can hide the panel without losing a running
// recording, or keep recording while the panel is out of the way.

let overlay = null;
let visibleBtn = null;
let recordBtn = null;

export function initTracePanel() {
  overlay    = document.getElementById("trace-overlay");
  visibleBtn = document.getElementById("trace-toggle");
  recordBtn  = document.getElementById("trace-record");
  if (!overlay && !visibleBtn && !recordBtn) return;

  setTracingEnabled(state.traceRecording);
  syncButtons();
  syncOverlay();
  render();

  visibleBtn?.addEventListener("click", () => {
    state.setTraceVisible(!state.traceVisible);
  });
  recordBtn?.addEventListener("click", () => {
    state.setTraceRecording(!state.traceRecording);
  });

  state.addEventListener("trace-visible:changed", () => {
    syncButtons();
    syncOverlay();
    render();
  });
  state.addEventListener("trace-recording:changed", () => {
    setTracingEnabled(state.traceRecording);
    syncButtons();
    render();
  });

  onTimingsChange(render);
}

function syncButtons() {
  if (visibleBtn) visibleBtn.setAttribute("aria-pressed", state.traceVisible ? "true" : "false");
  if (recordBtn)  recordBtn.setAttribute("aria-pressed",  state.traceRecording ? "true" : "false");
}

function syncOverlay() {
  if (!overlay) return;
  overlay.hidden = !state.traceVisible;
}

function render() {
  if (!overlay || overlay.hidden) return;
  const recording = state.traceRecording;
  const t = getLastTimings();
  const keys = Object.keys(t);
  if (!recording && keys.length === 0) {
    overlay.innerHTML = `<div class="trace-overlay__title">Pipeline trace</div>
      <div class="trace-overlay__empty">recording is off — press ⏺ to start</div>`;
    return;
  }
  if (keys.length === 0) {
    overlay.innerHTML = `<div class="trace-overlay__title">Pipeline trace</div>
      <div class="trace-overlay__empty">idle — interact to see timings</div>`;
    return;
  }
  const curve = keys.filter((k) => k.startsWith("curve:")).sort();
  const tex   = keys.filter((k) => k.startsWith("tex:")).sort();
  const other = keys.filter((k) => !k.startsWith("curve:") && !k.startsWith("tex:")).sort();

  const fmt = (k) => `<div class="trace-overlay__row"><span>${shortLabel(k)}</span><span>${t[k].toFixed(2)}ms</span></div>`;
  const total = (arr) => arr.reduce((a, k) => a + t[k], 0);

  const parts = [];
  parts.push(`<div class="trace-overlay__title">Pipeline trace${recording ? "" : " · paused"}</div>`);
  if (curve.length) {
    parts.push(`<div class="trace-overlay__group">Curve / PointGraph</div>`);
    for (const k of curve) parts.push(fmt(k));
    parts.push(`<div class="trace-overlay__total"><span>total</span><span>${total(curve).toFixed(2)}ms</span></div>`);
  }
  if (tex.length) {
    parts.push(`<div class="trace-overlay__group">Texture ops</div>`);
    for (const k of tex) parts.push(fmt(k));
    parts.push(`<div class="trace-overlay__total"><span>total</span><span>${total(tex).toFixed(2)}ms</span></div>`);
  }
  if (other.length) {
    for (const k of other) parts.push(fmt(k));
  }
  overlay.innerHTML = parts.join("");
}

function shortLabel(key) {
  const i = key.indexOf(":");
  return i >= 0 ? key.slice(i + 1) : key;
}
