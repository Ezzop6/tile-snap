// Bundle-mode entry point. Wires DOM refs, hydrates the bundle list
// from settings, registers the render dispatcher, and subscribes to the
// state events that should trigger a matrix repaint.

import { state } from "../../controller/state.js";
import { onModeChange } from "../modeTabs.js";
import {
  bundled, dom, persistBundle, hydrateBundleFromSettings,
  isActive, isExporting, setRenderAll, renderAll,
} from "./state.js";
import { renderProjectList } from "./projectList.js";
import { renderMatrix }      from "./matrix.js";
import { renderOverrides, syncOverrideRows } from "./overrides.js";
import { onExportClick }     from "./exportRunner.js";

export function initBundleMode() {
  dom.matrixEl    = document.getElementById("bundle-matrix");
  dom.listEl      = document.getElementById("bundle-projects-list");
  dom.nameInput   = document.getElementById("bundle-name");
  dom.pathInput   = document.getElementById("bundle-atlas-path");
  dom.overridesEl = document.getElementById("bundle-overrides-list");
  if (!dom.matrixEl || !dom.listEl) return;

  // Atlas path prefix — hydrate input from state, push edits back to state.
  // Persistence happens via settings.js#bundle-path:changed listener.
  if (dom.pathInput) {
    dom.pathInput.value = state.bundleAtlasPath || "";
    dom.pathInput.addEventListener("input", () => {
      state.setBundleAtlasPath(dom.pathInput.value);
    });
    state.addEventListener("bundle-path:changed", () => {
      if (document.activeElement !== dom.pathInput) {
        dom.pathInput.value = state.bundleAtlasPath || "";
      }
    });
  }

  // Wire the render dispatcher so submodules can call renderAll without
  // importing the concrete render functions (= avoids the projectList ↔
  // matrix ↔ card cyclic chain).
  setRenderAll(() => { renderProjectList(); renderMatrix(); });

  hydrateBundleFromSettings();
  renderOverrides();

  state.addEventListener("bundle-overrides:changed", () => syncOverrideRows());
  state.addEventListener("project:deleted", (e) => pruneDeletedProject(e.detail));

  // Live-update when relevant state shifts. The matrix reads each project's
  // pool names — for the active project from live state, for others from
  // saved JSON — so changes anywhere need to re-render. active-project:
  // changed fires after setLastProjectId so the "(active)" tag tracks the
  // currently-open project. Suppressed during bundle export so the matrix
  // doesn't repaint on every internal state swap.
  const rerenderIfActive = () => { if (isActive() && !isExporting()) renderAll(); };
  state.addEventListener("pool-names:changed",     rerenderIfActive);
  state.addEventListener("pools:changed",          rerenderIfActive);
  state.addEventListener("project:loaded",         rerenderIfActive);
  state.addEventListener("project:saved",          rerenderIfActive);
  state.addEventListener("project-name:changed",   rerenderIfActive);
  state.addEventListener("template:changed",       rerenderIfActive);
  state.addEventListener("input:updated",          rerenderIfActive);
  state.addEventListener("active-project:changed", rerenderIfActive);

  onModeChange((mode) => { if (mode === "bundle") renderAll(); });

  document.getElementById("bundle-export")?.addEventListener("click", onExportClick);
}

function pruneDeletedProject(projectId) {
  let removed = 0;
  for (let i = bundled.length - 1; i >= 0; i--) {
    if (bundled[i].projectId === projectId) { bundled.splice(i, 1); removed++; }
  }
  if (removed > 0) { persistBundle(); renderAll(); }
}
