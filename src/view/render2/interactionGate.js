// Interaction-driven render gate. Replaces the old time-based throttle.
//
// Model: while the user is actively dragging a slider or slot-editor
// handle, skip the heavy ops (wave + noise) in buildSlotGraph. On
// pointerup, fire one "release render" so the final result includes
// everything. No timers, no per-op decisions, no race conditions —
// both ops are gated together so they never desynchronise.

import { state } from "../../controller/state.js";

let interacting = false;
let armed       = false;

export function isInteracting() {
  return interacting;
}

// Match interactive elements that produce burst state changes:
// sliders (curve / noise panels) + the slot editor canvas (point + bow
// handle drag). Other targets (buttons, labels) don't arm the gate, so
// idle clicks don't briefly disable heavy ops.
function isInteractiveTarget(t) {
  if (!t || typeof t.matches !== "function") return false;
  if (t.matches('input[type="range"]')) return true;
  if (t.closest?.("#slot-editor-canvas")) return true;
  return false;
}

window.addEventListener("pointerdown", (e) => {
  if (!isInteractiveTarget(e.target)) return;
  interacting = true;
  armed       = true;
});

// pointerup may land on a different element than pointerdown (drag past
// the slider bounds) — listen at window so we always catch it.
window.addEventListener("pointerup", releaseInteraction);
window.addEventListener("pointercancel", releaseInteraction);
// Window-blur safety: drag-and-release outside the window otherwise
// leaves the gate armed permanently.
window.addEventListener("blur", releaseInteraction);

function releaseInteraction() {
  if (!armed) return;
  armed       = false;
  interacting = false;
  // noise:changed clears the slot-graph cache + triggers every view's
  // refresh listener — both wave and noise rebuild with full quality.
  state.dispatchEvent(new CustomEvent("noise:changed", { detail: null }));
}
