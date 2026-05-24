import { state } from "../controller/state.js";
import {
  setTracingEnabled,
  getTimingStats,
  onTimingsChange,
} from "../core/trace.js";
import { showToast } from "./toast.js";

// Centred-on-screen overlay showing last-burst pipeline timings (per
// PointGraph op + per texture op). Two independent topbar toggles:
//   ⏱  visibility — show / hide overlay
//   ⏺  recording  — start / stop data collection
// Independent so the user can hide the panel without losing a running
// recording, or keep recording while the panel is out of the way.

let overlay = null;
let visibleBtn = null;
let recordBtn = null;
let copyBtn = null;

export function initTracePanel() {
  overlay    = document.getElementById("trace-overlay");
  visibleBtn = document.getElementById("trace-toggle");
  recordBtn  = document.getElementById("trace-record");
  copyBtn    = document.getElementById("trace-copy");
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
  copyBtn?.addEventListener("click", copyTrace);

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
  const t = getTimingStats();
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

  // avg over many calls = the stable comparison number; call count secondary.
  const fmt = (k) => {
    const s = t[k];
    return `<div class="trace-overlay__row"><span>${shortLabel(k)}</span>` +
      `<span>${s.avg.toFixed(3)}ms<span class="trace-overlay__sub"> avg · n${s.count}</span></span></div>`;
  };
  const totalAvg = (arr) => arr.reduce((a, k) => a + t[k].avg, 0);
  const totalRow = (arr) => `<div class="trace-overlay__total"><span>Σ per call</span>` +
    `<span>${totalAvg(arr).toFixed(3)}ms<span class="trace-overlay__sub"> avg</span></span></div>`;

  const parts = [];
  parts.push(`<div class="trace-overlay__title">Pipeline trace${recording ? "" : " · paused"}` +
    ` <span class="trace-overlay__sub">per-call avg ms (n=calls)</span></div>`);
  if (curve.length) {
    parts.push(`<div class="trace-overlay__group">Curve / PointGraph</div>`);
    for (const k of curve) parts.push(fmt(k));
    parts.push(totalRow(curve));
  }
  if (tex.length) {
    parts.push(`<div class="trace-overlay__group">Texture ops</div>`);
    for (const k of tex) parts.push(fmt(k));
    parts.push(totalRow(tex));
  }
  if (other.length) {
    for (const k of other) parts.push(fmt(k));
  }
  overlay.innerHTML = parts.join("");
}

function shortLabel(key) {
  // Strip only the group prefix (curve: / tex:) — the group header already
  // names the category. Other namespaces (merge:, noiseFade:) stay intact so
  // "noiseFade:holes" isn't shown as a bare "holes" next to "merge:holes/...".
  if (key.startsWith("curve:") || key.startsWith("tex:")) return key.slice(key.indexOf(":") + 1);
  return key;
}

// Copy the last-burst timings to clipboard as readable text (same grouping as
// the overlay) so they can be pasted straight into a bug report.
function copyTrace() {
  const t = getTimingStats();
  if (!Object.keys(t).length) {
    showToast("No trace data yet — record (⏺) + interact first", { kind: "info" });
    return;
  }
  navigator.clipboard?.writeText(formatTimings(t))
    .then(() => showToast("Trace copied to clipboard", { kind: "success" }))
    .catch((err) => showToast(`Clipboard write failed: ${err.message ?? err}`, { kind: "error" }));
}

function formatTimings(t) {
  const keys  = Object.keys(t);
  const curve = keys.filter((k) => k.startsWith("curve:")).sort();
  const tex   = keys.filter((k) => k.startsWith("tex:")).sort();
  const other = keys.filter((k) => !k.startsWith("curve:") && !k.startsWith("tex:")).sort();
  const row = (k) => {
    const s = t[k];
    return `  ${shortLabel(k).padEnd(24)} ${s.avg.toFixed(3).padStart(9)}ms avg  (n=${s.count})`;
  };
  const sumAvg = (arr) => arr.reduce((a, k) => a + t[k].avg, 0);
  const totalLine = (label, arr) =>
    `  ${label.padEnd(24)} ${sumAvg(arr).toFixed(3).padStart(9)}ms avg`;
  const lines = ["Pipeline trace (per-call avg ms)"];
  if (curve.length) {
    lines.push("Curve / PointGraph");
    for (const k of curve) lines.push(row(k));
    lines.push(totalLine("Σ per call", curve));
  }
  if (tex.length) {
    lines.push("Texture ops");
    for (const k of tex) lines.push(row(k));
    lines.push(totalLine("Σ per call", tex));
  }
  if (other.length) {
    lines.push("Other");
    for (const k of other) lines.push(row(k));
  }
  return lines.join("\n");
}
