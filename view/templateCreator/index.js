import { state } from "../../controller/state.js";
import { DEBUG } from "../../config.js";
import { onModeChange } from "../modeTabs.js";
import { createStage } from "../stage.js";
import { listCellShapes } from "../cellShapes/index.js";
import { refs, sync } from "./refs.js";
import { isStageActive } from "./layout.js";
import {
  fullSync,
  syncToolbarInputs,
  syncCreatorDeleteButton,
  onNameChange,
  onCellShapeChange,
  onDeleteTemplate,
} from "./toolbar.js";
import { renderEditor } from "./render.js";
import {
  exportJSON,
  saveToLibrary,
  pickTemplateFile,
  looksLikeTemplateJSON,
  importTemplateFromObject,
  duplicateTemplate,
} from "./io.js";
import { fillMissingPatterns } from "./fillMissing.js";
import { packSquare } from "./pack.js";
import { flipPattern } from "./flip.js";
import { showToast } from "../toast.js";

// Public API — main.js imports from here. Internal `ensureEditable` /
// `commitInPlaceEdit` stay private (only consumed via paramCtx callbacks).
export { looksLikeTemplateJSON, importTemplateFromObject, saveToLibrary };

export function resetCreatorView() {
  refs.stage?.resetView();
}

export function initTemplateCreator() {
  refs.nameInput       = document.getElementById("creator-name-input");
  refs.cellShapeSelect = document.getElementById("creator-cellshape-select");
  refs.shapeParamsHost = document.getElementById("creator-shape-params");
  refs.stageMeta       = document.getElementById("creator-meta");
  refs.canvasEl        = document.getElementById("creator-canvas");
  if (!refs.canvasEl) return;

  if (refs.cellShapeSelect) {
    refs.cellShapeSelect.innerHTML = listCellShapes()
      .map((s) => `<option value="${s.id}"${s.disabled && !DEBUG ? " disabled" : ""}>${s.label}</option>`)
      .join("");
  }

  document.getElementById("creator-export")?.addEventListener("click", exportJSON);
  document.getElementById("creator-import")?.addEventListener("click", pickTemplateFile);
  document.getElementById("creator-duplicate")?.addEventListener("click", duplicateTemplate);
  document.getElementById("creator-pack")?.addEventListener("click", packSquare);

  const saveBtn = document.getElementById("creator-save-library");
  saveBtn?.addEventListener("click", saveToLibrary);
  const syncSaveBtn = () => {
    if (saveBtn) saveBtn.classList.toggle("is-dirty", state.isTemplateDirty());
  };
  state.addEventListener("template-dirty:changed", syncSaveBtn);
  state.addEventListener("template:changed",       syncSaveBtn);
  syncSaveBtn();

  refs.nameInput?.addEventListener("change", onNameChange);
  refs.cellShapeSelect?.addEventListener("change", onCellShapeChange);

  const btnDelete = document.getElementById("creator-delete-template");
  if (btnDelete) {
    btnDelete.addEventListener("click", onDeleteTemplate);
    state.addEventListener("template:changed",       syncCreatorDeleteButton);
    state.addEventListener("template-dirty:changed", syncCreatorDeleteButton);
    syncCreatorDeleteButton();
  }

  document.getElementById("creator-flip-pattern")?.addEventListener("click", flipPattern);

  document.getElementById("creator-fill-missing")?.addEventListener("click", async () => {
    const n = await fillMissingPatterns();
    if (n === -1) {
      showToast("Fill missing supports only 3×3 and 2×2 patterns", { kind: "error" });
    } else if (n === -2) {
      /* user cancelled builtin promotion — silent */
    } else if (n === 0) {
      showToast("Template already covers every peering combination", { kind: "info" });
    } else {
      showToast(`Added ${n} missing pattern${n === 1 ? "" : "s"}`, { kind: "info" });
    }
  });

  refs.canvasEl.addEventListener("contextmenu", (e) => e.preventDefault());

  refs.stage = createStage(refs.canvasEl, {
    fitToContent: false,
    zoomOrigin:   "center",
    isActive:     isStageActive,
  });

  new ResizeObserver(() => { if (isStageActive()) renderEditor(); })
    .observe(refs.canvasEl);

  onModeChange((mode) => { if (mode === "template") fullSync(); });

  // Only respond to external template swaps (dropdown, project load).
  // In-place mutations (paint/rename) keep the same ref OR explicitly
  // suppress this listener via sync.suppressNextRebuild.
  state.addEventListener("template:changed", () => {
    if (sync.suppressNextRebuild) {
      sync.suppressNextRebuild = false;
      return;
    }
    if (state.template === sync.lastRenderedRef) return;
    if (!isStageActive()) return;
    fullSync();
  });
}
