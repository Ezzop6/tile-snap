import { state } from "../../controller/state.js";
import { onModeChange } from "../modeTabs.js";
import { xs, isActive } from "./_state.js";
import { renderLayout } from "./layout.js";
import { renderParams, randomizeRanges, rerenderRanges, randomizeAllVariants } from "./paramsPanel.js";
import { renderPreview, bumpSelectedVariantSeed, bumpPoolIndex } from "./preview.js";
import { runExport } from "./png.js";
import { runGodotExport } from "./godot.js";
import { runJsonExport } from "./jsonExport.js";
import { runZipExport } from "./zipExport.js";
import { settings } from "../../controller/storage.js";
import { createStage } from "../stage.js";
import { createSelectionOverlay } from "../selectionFrame.js";

const EXPORT_MODE_KEY = "exportMode";
const EXPORT_MODES = {
  png:   { label: "Export PNG",     run: runExport },
  godot: { label: "Export Godot 4", run: runGodotExport },
  json:  { label: "Export JSON",    run: runJsonExport },
  zip:   { label: "Export ZIP",     run: runZipExport },
};
let currentExportMode = "png";

// rAF-coalesced render scheduler. State mutations dispatch events one-by-one;
// during batch operations (e.g. randomizeAllVariants — N slots × M variants
// of state.setX calls) the listeners would otherwise re-render hundreds of
// times in a single tick. With this, all event fires within one frame
// collapse into a single renderLayout + renderPreview pass.
let pendingLayout = false;
let pendingPreview = false;
function scheduleLayoutAndPreview() {
  pendingLayout = true;
  pendingPreview = true;
  flushSoon();
}
function scheduleLayoutOnly() {
  pendingLayout = true;
  flushSoon();
}
let flushScheduled = false;
function flushSoon() {
  if (flushScheduled) return;
  flushScheduled = true;
  requestAnimationFrame(() => {
    flushScheduled = false;
    const wantLayout = pendingLayout;
    const wantPreview = pendingPreview;
    pendingLayout = pendingPreview = false;
    if (!isActive()) return;
    if (wantLayout)  renderLayout();
    if (wantPreview) renderPreview();
  });
}

export function resetExportView() { xs.stage?.resetView(); }

export function initExportPanel() {
  xs.layoutEl       = document.getElementById("export-layout-grid");
  xs.slotMetaEl     = document.getElementById("export-slot-meta");
  xs.previewEl      = document.getElementById("export-preview");
  xs.previewPrevBtn = document.getElementById("export-preview-prev");
  xs.previewNextBtn = document.getElementById("export-preview-next");

  xs.previewPrevBtn?.addEventListener("click", () => bumpSelectedVariantSeed(-1));
  xs.previewNextBtn?.addEventListener("click", () => bumpSelectedVariantSeed(+1));
  document.getElementById("export-preview-a-prev")?.addEventListener("click", () => bumpPoolIndex("A", -1));
  document.getElementById("export-preview-a-next")?.addEventListener("click", () => bumpPoolIndex("A", +1));
  document.getElementById("export-preview-b-prev")?.addEventListener("click", () => bumpPoolIndex("B", -1));
  document.getElementById("export-preview-b-next")?.addEventListener("click", () => bumpPoolIndex("B", +1));

  if (xs.previewEl) {
    new ResizeObserver(() => { if (isActive()) renderPreview(); }).observe(xs.previewEl);
  }
  state.addEventListener("render-mode:changed", scheduleLayoutAndPreview);

  initExportModeDropdown();
  initVariantsRandomModal();
  initMasterShareSlider();

  onModeChange((mode) => { if (mode === "export") renderAll(); });

  state.addEventListener("template:changed", () => {
    xs.selectedVariantIdx = 0;
    if (isActive()) renderAll();
  });
  state.addEventListener("slot-selection:changed", () => {
    xs.selectedVariantIdx = 0;
    if (isActive()) renderAll();
  });
  // Re-rendering params DOM here would tear out the slider the user is dragging.
  state.addEventListener("export-config:changed",      scheduleLayoutAndPreview);
  state.addEventListener("export-direction:changed",   scheduleLayoutOnly);
  state.addEventListener("export-aspect:changed",      scheduleLayoutOnly);
  state.addEventListener("export-variability:changed", () => { if (isActive()) { rerenderRanges(); renderPreview(); } });
  state.addEventListener("export-show-islands:changed", scheduleLayoutAndPreview);
  state.addEventListener("export-layout-view:changed", scheduleLayoutAndPreview);
  state.addEventListener("export-include-sources:changed", scheduleLayoutAndPreview);
  state.addEventListener("seed:changed",               scheduleLayoutAndPreview);
  for (const ev of ["pool-weights:changed", "slot-pool-override:changed", "variant-pool-override:changed", "input:added", "input:removed", "input:updated"]) {
    state.addEventListener(ev, scheduleLayoutAndPreview);
  }
  // Full rebuild: adding/removing pool entries changes which rows the weights block shows.
  state.addEventListener("pools:changed", () => { if (isActive()) renderAll(); });
  state.addEventListener("global-curve:changed", scheduleLayoutAndPreview);
  state.addEventListener("noise:changed",        scheduleLayoutAndPreview);
  state.addEventListener("project:loaded",       () => { if (isActive()) renderAll(); });

  xs.layoutEl.addEventListener("click", onLayoutClick);

  // Document-level delegation so re-renders of the bodies don't orphan the listener.
  document.addEventListener("click", (e) => {
    const randomBtn = e.target.closest("#export-ranges-random");
    if (randomBtn) {
      const idx = state.selectedSlotIndex;
      if (idx != null) randomizeRanges(idx);
      return;
    }
    // Any button inside the title (🎲 / 🎯 / future) handles itself; only the
    // bare title text should toggle collapse.
    if (e.target.closest("[data-pool-weights-toggle] button")) return;
    const poolToggle = e.target.closest("[data-pool-weights-toggle]");
    if (poolToggle) {
      const block = poolToggle.closest(".pool-weights");
      if (!block) return;
      const key = poolToggle.dataset.poolWeightsToggle;
      const isOpen = !block.classList.contains("is-collapsed");
      block.classList.toggle("is-collapsed", isOpen);
      if (isOpen) xs.poolWeightsCollapsed.add(key);
      else        xs.poolWeightsCollapsed.delete(key);
    }
  });

  const stageEl = document.getElementById("export-stage");
  if (stageEl) {
    xs.stage = createStage(stageEl, {
      fitToContent: false,
      zoomOrigin:   "center",
      isActive,
    });
    // Shared screen-space selection frame (same as preview + debug). Tracks
    // the selected tile's on-screen rect, so it's one thin crisp line of
    // identical thickness everywhere instead of a per-view CSS border.
    xs.selectionOverlay = createSelectionOverlay(stageEl, xs.stage);
    xs.selectionOverlay.setTracker(() => {
      const idx = state.selectedSlotIndex;
      if (idx == null || !xs.layoutEl) return null;
      const sel = xs.layoutEl.querySelector(
        `.layout-tile[data-slot-index="${idx}"][data-variant-idx="${xs.selectedVariantIdx}"]`,
      );
      if (!sel) return null;
      const r = sel.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
  }
}

function renderAll() {
  renderLayout();
  renderParams();
  renderPreview();
}

function initExportModeDropdown() {
  const mainBtn   = document.getElementById("export-do");
  const toggleBtn = document.getElementById("export-mode-toggle");
  const menu      = document.getElementById("export-mode-menu");
  if (!mainBtn || !toggleBtn || !menu) return;

  const stored = settings.get(EXPORT_MODE_KEY, "png");
  currentExportMode = EXPORT_MODES[stored] ? stored : "png";
  syncExportModeUI(mainBtn, menu);

  // Blur so a focused input's pending change commits before the heavy export.
  // Two RAFs so the layout flush completes first.
  mainBtn.addEventListener("click", () => {
    const fn = EXPORT_MODES[currentExportMode]?.run;
    if (!fn) return;
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
    requestAnimationFrame(() => requestAnimationFrame(fn));
  });

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = !menu.hidden;
    menu.hidden = open;
    toggleBtn.setAttribute("aria-expanded", String(!open));
  });

  document.addEventListener("click", (e) => {
    if (menu.hidden) return;
    if (menu.contains(e.target) || toggleBtn.contains(e.target)) return;
    menu.hidden = true;
    toggleBtn.setAttribute("aria-expanded", "false");
  });

  menu.addEventListener("click", (e) => {
    const item = e.target.closest("[data-export-mode]");
    if (!item || item.disabled) return;
    const mode = item.dataset.exportMode;
    if (!EXPORT_MODES[mode]) return;
    currentExportMode = mode;
    settings.set(EXPORT_MODE_KEY, mode);
    syncExportModeUI(mainBtn, menu);
    menu.hidden = true;
    toggleBtn.setAttribute("aria-expanded", "false");
  });
}

// Header "🎲" on the Variants section → modal asking how many variants per
// tile. On apply: walks every slot in the template, sets the count, and
// rolls fresh random pool A/B picks plus variability ranges. Backdrop click
// or Esc cancels without committing.
// Slider lives in the Main section's header (one-time wire-up; the header
// is static HTML, not regenerated like the body fields).
function initMasterShareSlider() {
  const slider = document.getElementById("export-master-share");
  if (!slider) return;
  slider.value = String(state.exportMasterShare);
  slider.addEventListener("input", () => {
    const v = Math.max(0, Math.min(1, parseFloat(slider.value) || 0));
    state.setExportMasterShare(v);
  });
  state.addEventListener("export-master-share:changed", () => {
    const v = state.exportMasterShare;
    if (parseFloat(slider.value) !== v) slider.value = String(v);
  });
}

function initVariantsRandomModal() {
  const openBtn = document.getElementById("export-variants-random-all");
  const modal   = document.getElementById("variants-random-modal");
  const backdrop = modal?.querySelector(".modal__backdrop");
  const input   = document.getElementById("variants-random-count");
  const apply   = document.getElementById("variants-random-apply");
  const cancel  = document.getElementById("variants-random-cancel");
  if (!openBtn || !modal || !input || !apply || !cancel) return;

  const close = () => { modal.hidden = true; };
  const open  = () => {
    modal.hidden = false;
    input.focus();
    input.select();
  };
  openBtn.addEventListener("click", open);
  cancel.addEventListener("click", close);
  backdrop?.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) close();
  });

  apply.addEventListener("click", () => {
    const n = Math.max(1, Math.min(10, parseInt(input.value, 10) || 1));
    randomizeAllVariants(n);
    close();
  });
  // Enter inside the number input commits.
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") apply.click();
  });
}

function syncExportModeUI(mainBtn, menu) {
  const spec = EXPORT_MODES[currentExportMode];
  if (mainBtn && spec) mainBtn.textContent = spec.label;
  for (const item of menu.querySelectorAll("[data-export-mode]")) {
    item.classList.toggle("is-current", item.dataset.exportMode === currentExportMode);
  }
}

function onLayoutClick(e) {
  if (xs.stage?.isPanning()) return;
  const block = e.target.closest(".layout-tile");
  if (!block) return;
  const idx = parseInt(block.dataset.slotIndex, 10);
  if (!Number.isFinite(idx)) return;
  const variantIdx = parseInt(block.dataset.variantIdx, 10) || 0;
  if (variantIdx === 0) {
    if (state.selectedSlotIndex === idx && xs.selectedVariantIdx === 0) {
      state.clearSlotSelection();
    } else {
      xs.selectedVariantIdx = 0;
      state.selectSlot(idx);
      // selectSlot fires slot-selection:changed only when index changed; explicit refresh otherwise.
      if (state.selectedSlotIndex === idx) renderAll();
    }
  } else {
    // selectSlot's listener resets selectedVariantIdx, so we restore it after.
    xs.selectedVariantIdx = variantIdx;
    if (state.selectedSlotIndex !== idx) {
      state.selectSlot(idx);
      xs.selectedVariantIdx = variantIdx;
      renderAll();
    } else {
      renderAll();
    }
  }
}
