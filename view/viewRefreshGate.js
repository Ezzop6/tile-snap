// Wraps a view's refresh function so it skips runs while the user is
// inside the template editor — those views aren't visible during template
// mode and rebuilding their graphs on every paint click is wasted work.
// When the user leaves template mode, any deferred refresh fires once.
//
// Apply to non-template views (mainView, mapView, slotEditor). Don't use
// in templateCreator itself or in already-active-gated views (debug,
// exportPanel) — their listeners already check the active mode.

import { getMode, onModeChange } from "./modeTabs.js";

const TEMPLATE_MODE = "template";

export function gateRefreshDuringTemplateMode(refresh) {
  let dirty = false;
  onModeChange((mode) => {
    if (mode === TEMPLATE_MODE) return;
    if (!dirty) return;
    dirty = false;
    refresh();
  });
  return function gated() {
    if (getMode() === TEMPLATE_MODE) {
      dirty = true;
      return;
    }
    refresh();
  };
}
