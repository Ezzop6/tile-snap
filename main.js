import { state } from "./controller/state.js";
// Side-effect import: installs window pointerdown/pointerup listeners that
// drive the throttle (skip heavy ops during drag, full render on release).
import "./view/render2/interactionGate.js";
import {
  applySettingsToState,
  bindSettingsListeners,
} from "./controller/settings.js";
import {
  loadImageFile,
  splitIntoTiles,
  computeImageHash,
  sourceToDataURL,
} from "./core/source.js";
import { images } from "./controller/storage.js";
import { showToast } from "./view/toast.js";
import { setupDropZone } from "./view/dropZone.js";
import { initInputsPanel } from "./view/inputsPanel.js";
import { initSourcePanel } from "./view/sourcePanel.js";
import { initMainView, resetMainView } from "./view/mainView.js";
import { initMapView } from "./view/mapView.js";
import { initCanvasToolbar } from "./view/canvasToolbar.js";
import { initSlotEditor } from "./view/slotEditor/index.js";
import { initCurvePanel } from "./view/curvePanel.js";
import { initTexOpsPanel } from "./view/texOpsPanel.js";
import { initNoisePanel } from "./view/noisePanel.js";
import { initSeedPanel } from "./view/seedPanel.js";
import { initTracePanel } from "./view/tracePanel.js";
import {
  initProjectBar,
  autoLoad,
  loadProjectFromObject,
  importProjectAsNewEntry,
  saveActiveProject,
  requestNew,
} from "./view/projectBar.js";
import { openProjectModal } from "./view/projectModal.js";
import { registerShortcut } from "./view/keyboard.js";
import { confirmReplaceOrNew } from "./view/dialog.js";
import {
  initTemplateCreator,
  resetCreatorView,
  looksLikeTemplateJSON,
  importTemplateFromObject,
} from "./view/templateCreator/index.js";
import { initExportPanel, resetExportView } from "./view/exportPanel.js";
import { initModeTabs, onModeChange } from "./view/modeTabs.js";
import { initDebugMode, resetDebugView } from "./view/debug/index.js";
import { initDebugPanel } from "./view/debugPanel.js";
import { initBundleMode } from "./view/bundleMode.js";
import { defaultTemplate } from "./templates/index.js";

const DEFAULT_TILE_SIZE = 64;

// Debug flags (all default off; set on window in DevTools):
//   __DEBUG_BG_MAGENTA__   canvas bg magenta so source-alpha gaps show
//   __DEBUG_SLOTS__        log slot 0 dims + sourceA/B edge alpha
//   __DEBUG_SLOT_BOUNDS__  draw 1-px magenta frame per slot
//   __DEBUG_REFRESH__      log mainView.refresh inputs
//   __DEBUG_PATH_CUTS__    per-slot dump of pattern + gridOutline + segments
//                          (pair with __DEBUG_PATH_CUTS_FILTER__ = [3, 7])
//   __DEBUG_ROUGHEN_ALL__  log roughen stats per slot

import { DEBUG } from "./config.js";

if (!DEBUG) {
  document.getElementById("mode-debug")?.style.setProperty("display", "none");
}

const Split = window.Split;

// minSize 0 on left + middle = user can drag the right panel all the way
// over once the left panel is hidden, giving the right panel the full
// workspace width for global texture tweaking.
const split = Split(["#panel-left", "#main-area", "#panel-right"], {
  direction: "horizontal",
  sizes: [15, 70, 15],
  minSize: [0, 0, 240],
  gutterSize: 4,
  snapOffset: 0,
});

let savedSizes = null;
function toggleLeftPanel() {
  const panel = document.getElementById("panel-left");
  const btn = document.getElementById("toggle-left-panel");
  if (!panel) return;
  // Split.js inserts the gutter as panel-left's next sibling; hide it
  // too so the user gets a clean fully-collapsed look (no 4px stub left).
  const gutter = panel.nextElementSibling?.classList?.contains?.("gutter")
    ? panel.nextElementSibling
    : null;
  if (savedSizes) {
    panel.style.display = "";
    if (gutter) gutter.style.display = "";
    split.setSizes(savedSizes);
    savedSizes = null;
    btn?.setAttribute("aria-pressed", "false");
  } else {
    const cur = split.getSizes();
    savedSizes = cur.slice();
    panel.style.display = "none";
    if (gutter) gutter.style.display = "none";
    split.setSizes([0, cur[0] + cur[1], cur[2]]);
    btn?.setAttribute("aria-pressed", "true");
  }
}
document
  .getElementById("toggle-left-panel")
  ?.addEventListener("click", toggleLeftPanel);

// Right-fullscreen toggle: collapse the middle workspace so the right
// panel takes its + the middle's portion. Left stays at whatever size
// it currently has (including hidden via ☰). Independent state from
// the left-panel hide above — both can be on at once.
let middleSavedSizes = null;
function toggleMiddleCollapse() {
  const btn = document.getElementById("tex-ops-expand");
  const gutters = document.querySelectorAll(".gutter");
  // Gutter between middle (1) and right (2); keep gutter 0 visible so
  // the user can also drag the middle back without un-pressing the btn.
  const middleRightGutter = gutters[1];
  if (middleSavedSizes) {
    if (middleRightGutter) middleRightGutter.style.display = "";
    split.setSizes(middleSavedSizes);
    middleSavedSizes = null;
    btn?.setAttribute("aria-pressed", "false");
  } else {
    const cur = split.getSizes();
    middleSavedSizes = cur.slice();
    if (middleRightGutter) middleRightGutter.style.display = "none";
    split.setSizes([cur[0], 0, cur[1] + cur[2]]);
    btn?.setAttribute("aria-pressed", "true");
  }
}
document
  .getElementById("tex-ops-expand")
  ?.addEventListener("click", toggleMiddleCollapse);

// Texture mode = collapse the middle workspace so the right Texture ·
// global panel fills the rest. Left panel stays visible (Sources / Inputs
// editing still needed there). Saved snapshot restores prior visibility +
// sizes on exit, so the user's manual ⛶ / drag state survives the trip.
let textureModeSnap = null;
function enterTextureMode() {
  const gutters = document.querySelectorAll(".gutter");
  textureModeSnap = {
    sizes: split.getSizes(),
    gutter1Display: gutters[1]?.style.display ?? "",
  };
  if (gutters[1]) gutters[1].style.display = "none";
  const left = textureModeSnap.sizes[0];
  split.setSizes([left, 0, 100 - left]);
}
function leaveTextureMode() {
  if (!textureModeSnap) return;
  const gutters = document.querySelectorAll(".gutter");
  if (gutters[1]) gutters[1].style.display = textureModeSnap.gutter1Display;
  split.setSizes(textureModeSnap.sizes);
  textureModeSnap = null;
}
onModeChange((mode) => {
  const inTexture = !!textureModeSnap;
  if (mode === "texture" && !inTexture) enterTextureMode();
  else if (mode !== "texture" && inTexture) leaveTextureMode();
});

// Restore settings BEFORE view init so widgets paint with the right initial values.
applySettingsToState();
bindSettingsListeners();

// projectBar first: it owns render-mode plumbing (body class + radio sync) that other views call into.
initProjectBar();
initSeedPanel();
initTracePanel();
initSourcePanel();
initCurvePanel();
initTexOpsPanel();
initNoisePanel();
initInputsPanel();

initMainView();
initMapView();
initSlotEditor();

initCanvasToolbar();
initTemplateCreator();
initExportPanel();
initDebugPanel();
initDebugMode();
initBundleMode();
initModeTabs();

document.getElementById("view-reset")?.addEventListener("click", () => {
  const body = document.body.classList;
  if (body.contains("export-active")) resetExportView();
  else if (body.contains("creator-active")) resetCreatorView();
  else if (body.contains("debug-active")) resetDebugView();
  else resetMainView();
});

document.addEventListener("click", (e) => {
  const header = e.target.closest(".panel-section__header--collapsible");
  if (!header) return;
  if (e.target.closest(".panel-section__actions")) return;
  header.parentElement?.classList.toggle("is-collapsed");
});

// Throttle toggle changes whether heavy ops are skipped during drag;
// cached graphs from the previous setting are stale, so force a rebuild.
state.addEventListener("render-throttle:changed", () => {
  state.dispatchEvent(new CustomEvent("noise:changed", { detail: null }));
});

state.setTemplate(defaultTemplate);

// Inputs are global (inputsLibrary) — hydrate once at app start so every
// project sees the full upload history. Awaited so any project loaded
// next finds its pool refs already resolvable.
await state.loadInputsLibrary();

// No await: startup is sync, dataURL -> Image decode runs in background.
autoLoad();

// Keyboard shortcuts — centralised in view/keyboard.js so future shortcuts
// don't sprinkle document-level listeners across feature modules.
// Ctrl+S → saveActiveProject which internally saves the project AND any
// dirty user-template in one go (matches the topbar Save button).
registerShortcut("Ctrl+S", () => saveActiveProject(),
  { description: "Save active project + dirty user-template" });
registerShortcut("Ctrl+N", () => requestNew(),
  { description: "New project (prompts to save if dirty)" });
registerShortcut("Ctrl+O", () => openProjectModal(),
  { description: "Open projects" });

// Browsers don't reliably set application/json on drop, so extension is the primary signal.
// Sequential await per file: hash dedup must see freshly added inputs from the same batch.
setupDropZone(async (files) => {
  for (const file of files) {
    try {
      await importDroppedFile(file);
    } catch (err) {
      console.error(`Import failed for "${file.name}":`, err);
    }
  }
});

async function importDroppedFile(file) {
  if (isJsonFile(file)) {
    const text = await file.text();
    const obj = JSON.parse(text);
    // Template exports and project exports both end in .json: tell them apart by shape.
    if (looksLikeTemplateJSON(obj)) {
      await importTemplateFromObject(obj);
      return;
    }
    // Dropped project JSON: always ask Replace vs Open-as-new so a stray
    // drop can't silently overwrite the current project. Dirty status only
    // changes the message wording.
    const dirtyNote = state.isProjectDirty() ? " (has unsaved changes)" : "";
    const choice = await confirmReplaceOrNew({
      message: `Drop "${file.name}" — replace the current project "${state.projectName}"${dirtyNote}, or open the drop as a new entry?`,
    });
    if (choice === "replace") await loadProjectFromObject(obj);
    else if (choice === "new") await importProjectAsNewEntry(obj);
    return;
  }
  const source = await loadImageFile(file);
  const dataURL = sourceToDataURL(source);
  const hash = await computeImageHash(dataURL);
  // Reject duplicate by content hash — same bytes can otherwise land as
  // multiple inputs all pointing at the same storage entry.
  const existing = state.inputs.find((inp) => inp.hash === hash);
  if (existing) {
    showToast(`Image already imported as "${existing.name}"`, { kind: "info" });
    return;
  }
  const tileSize = DEFAULT_TILE_SIZE;
  const { tiles, cols, rows } = splitIntoTiles(source, tileSize);
  try {
    images.put(hash, dataURL);
  } catch (err) {
    console.error("[main] image storage failed:", err);
  }
  state.addInput({
    id: state.nextInputId(),
    name: file.name,
    source,
    tileSize,
    cols,
    rows,
    tiles,
    hash,
  });
}

function isJsonFile(file) {
  if (!file) return false;
  if (file.type === "application/json") return true;
  const name = String(file.name || "").toLowerCase();
  return name.endsWith(".json");
}
