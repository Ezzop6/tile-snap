// Wraps a view's refresh so it only runs while the view's own mode is the
// active one. In every OTHER mode it marks dirty and skips — the view isn't
// visible, so rebuilding its graphs / compositing on every state burst is
// wasted work. This is what kept the hidden preview canvases (mainView +
// mapView, full 47-slot composites) churning on every noise:changed during a
// debug/export drag — invisible to the trace but very much felt. On entering
// the active mode, one deferred refresh fires to catch up.
//
// Apply to single-mode views (mainView / mapView / slotEditor → "preview").
// Don't use in already-active-gated views (debug, exportPanel) — their
// listeners already check the active mode.

import { getMode, onModeChange } from "./modeTabs.js";

export function gateRefreshToMode(refresh, activeMode) {
  let dirty = false;
  onModeChange((mode) => {
    if (mode !== activeMode || !dirty) return;
    dirty = false;
    refresh();
  });
  return function gated() {
    if (getMode() !== activeMode) { dirty = true; return; }
    refresh();
  };
}
