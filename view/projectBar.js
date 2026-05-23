import { state } from "../controller/state.js";
import {
  projects as projectStorage,
  storageUsageBytes,
  findFreeProjectName,
} from "../controller/storage.js";
import {
  buildProjectExportPayload,
  buildProjectExportPayloadForSaved,
  hydrateBundle,
} from "../controller/exportBundle.js";
import {
  getLastProjectId,
  setLastProjectId,
} from "../controller/settings.js";
import {
  initProjectModal,
  openProjectModal,
  closeProjectModal,
  refreshProjectModal,
} from "./projectModal.js";
import { saveToLibrary } from "./templateCreator/index.js";
import { confirmDiscardOrSave, confirmReplaceOrNew, confirmDestructive } from "./dialog.js";
import { showToast } from "./toast.js";

let activeProjectId = null;

export function initProjectBar() {
  const nameDisplay = document.getElementById("project-name-display");
  const btnOpen     = document.getElementById("project-modal-toggle");
  const btnSave     = document.getElementById("btn-save");

  if (nameDisplay) {
    nameDisplay.textContent = state.projectName || "untitled";
    nameDisplay.addEventListener("click", () => openProjectModal());
    state.addEventListener("project-name:changed", () => {
      nameDisplay.textContent = state.projectName || "untitled";
    });
  }

  if (btnOpen) btnOpen.addEventListener("click", () => openProjectModal());
  if (btnSave) btnSave.addEventListener("click", saveActiveProject);

  syncSaveDirtyClass();
  state.addEventListener("project-dirty:changed", syncSaveDirtyClass);

  initProjectModal({
    getActiveId:  () => activeProjectId,
    onLoad:       requestLoad,
    onNew:        requestNew,
    onDelete:     requestDelete,
    onDuplicate:  requestDuplicate,
    onExportRow:  exportProjectToFile,
    onImport:     requestImport,
    onRename:     handleRename,
  });

  // Single source of truth for the render-mode body class; canvases opt in via applyRenderModeClass.
  const modeRadios = document.querySelectorAll('input[name="render-mode"]');
  for (const radio of modeRadios) {
    radio.checked = radio.value === state.renderMode;
    radio.addEventListener("change", () => {
      if (radio.checked) state.setRenderMode(radio.value);
    });
  }
  state.addEventListener("render-mode:changed", () => {
    for (const radio of modeRadios) {
      radio.checked = radio.value === state.renderMode;
    }
    syncBodyClass();
  });
  syncBodyClass();

  const throttleBtn = document.getElementById("render-throttle-toggle");
  if (throttleBtn) {
    const sync = () => throttleBtn.setAttribute("aria-pressed", String(state.renderThrottle));
    sync();
    throttleBtn.addEventListener("click", () => state.setRenderThrottle(!state.renderThrottle));
    state.addEventListener("render-throttle:changed", sync);
  }
}

function syncSaveDirtyClass() {
  const btn = document.getElementById("btn-save");
  if (!btn) return;
  btn.classList.toggle("is-dirty", state.isProjectDirty());
}

function syncBodyClass() {
  document.body.classList.toggle("render-pixel",  state.renderMode === "pixel");
  document.body.classList.toggle("render-smooth", state.renderMode === "smooth");
}

export function applyRenderModeClass(el) {
  if (!el) return;
  el.classList.toggle("render-pixel",  state.renderMode === "pixel");
  el.classList.toggle("render-smooth", state.renderMode === "smooth");
}

export async function autoLoad() {
  const id = getLastProjectId();
  if (id && projectStorage.meta(id)) {
    return loadProjectById(id);
  }
  // Covers users who cleared the lastProjectId setting but still have projects in storage.
  const list = projectStorage.list();
  if (list.length > 0) return loadProjectById(list[0].id);
  return false;
}

export function getActiveProjectId() {
  return activeProjectId;
}

// Public — used by Ctrl+S shortcut + Save button + guardDirty pre-switch.
// Saves BOTH project and any dirty user-template in one call so users don't
// have to click Save twice when they've touched both. Builtin templates
// with the dirty flag (= in-memory clone awaiting promotion) are skipped:
// saveToLibrary on a builtin would pop a promotion confirm, which is a
// deliberate-action UX that doesn't belong on Ctrl+S / topbar Save.
//
// Order matters: template save FIRST, project save LAST. saveToLibrary's
// internal replaceTemplate(fresh) fires `template:changed`, which the
// projectDirty bridge picks up and re-marks the project dirty. If we
// saved the project first, markProjectClean would run, then the template
// save would dirty it again → topbar Save button stays orange and the
// user thinks the save didn't take. Doing template first means project
// save (with its markProjectClean) is the final act.
export async function saveActiveProject() {
  if (state.isTemplateDirty() && state.template?.source !== "builtin") {
    try { await saveToLibrary(); }
    catch (err) { console.error("[projectBar] template save failed:", err); }
  }
  try {
    const data = state.serialize();
    const wasNew = !activeProjectId;
    if (activeProjectId) {
      projectStorage.save(activeProjectId, data, state.projectName);
    } else {
      activeProjectId = projectStorage.create(state.projectName, data);
      setLastProjectId(activeProjectId);
    }
    state.markProjectClean();
    state.dispatchEvent(new CustomEvent("project:saved", { detail: activeProjectId }));
    refreshProjectModal();
    showToast(
      wasNew ? `Saved as new project "${state.projectName}"`
             : `Updated "${state.projectName}"`,
      { kind: "success" }
    );
    return true;
  } catch (err) {
    console.error("[projectBar] save failed:", err);
    if (err && err.name === "QuotaExceededError") {
      const used = (storageUsageBytes() / 1024 / 1024).toFixed(2);
      showToast(`Save failed: localStorage quota exceeded (${used} MB used). Delete old projects or export to JSON.`, { kind: "error", duration: 6000 });
    } else {
      showToast(`Save failed: ${err.message || err}`, { kind: "error", duration: 4000 });
    }
    return false;
  }
}

function handleRename(newName) {
  if (activeProjectId) {
    projectStorage.rename(activeProjectId, newName);
    refreshProjectModal();
  }
}

export async function loadProjectById(id) {
  const data = projectStorage.load(id);
  if (!data) {
    showToast("Project not found in storage", { kind: "error" });
    return false;
  }
  try {
    await state.deserialize(data);
    activeProjectId = id;
    setLastProjectId(id);
    refreshProjectModal();
    return true;
  } catch (err) {
    console.error("[projectBar] load failed:", err);
    showToast(`Load failed: ${err.message || err}`, { kind: "error", duration: 4000 });
    return false;
  }
}

// Shared dirty-guard. Returns true if it's OK to proceed, false if cancelled.
async function guardDirty() {
  if (!state.isProjectDirty()) return true;
  const choice = await confirmDiscardOrSave({
    message: `"${state.projectName}" has unsaved changes. Save them first?`,
  });
  if (choice === "save")    return saveActiveProject();
  if (choice === "discard") return true;
  return false; // cancel or dismiss
}

async function requestLoad(id) {
  if (id === activeProjectId) { closeProjectModal(); return; }
  if (!(await guardDirty())) return;
  closeProjectModal();
  await loadProjectById(id);
}

export async function requestNew() {
  if (!(await guardDirty())) return;
  createNewProject();
}

function createNewProject() {
  const name = findFreeProjectName("untitled");
  // deserialize({ projectName }) keeps the current template (default from main.js
  // stays) but resets pools / overrides / curve / noise. Inputs library is global
  // and intentionally NOT reset — uploaded textures remain available.
  state.deserialize({ projectName: name });
  activeProjectId = null;
  setLastProjectId(null);
  refreshProjectModal();
}

async function requestDelete(id) {
  const targetId = id || activeProjectId;
  if (!targetId) return;
  const meta = projectStorage.meta(targetId);
  if (!meta) return;
  const ok = await confirmDestructive({
    title:   `Delete project`,
    message: `Delete project "${meta.name}"? This can't be undone.`,
  });
  if (!ok) return;
  projectStorage.delete(targetId);
  state.dispatchEvent(new CustomEvent("project:deleted", { detail: targetId }));

  if (targetId === activeProjectId) {
    activeProjectId = null;
    setLastProjectId(null);
    const list = projectStorage.list();
    if (list.length > 0) await loadProjectById(list[0].id);
    else                 createNewProject();
  }
  refreshProjectModal();
}

function requestDuplicate(id) {
  const sourceMeta = projectStorage.meta(id);
  const sourceData = projectStorage.load(id);
  if (!sourceMeta || !sourceData) return;
  const newName = findFreeProjectName(sourceMeta.name);
  const cloned  = { ...sourceData, projectName: newName };
  projectStorage.create(newName, cloned);
  state.dispatchEvent(new CustomEvent("project:saved", { detail: null }));
  refreshProjectModal();
  showToast(`Duplicated "${sourceMeta.name}" → "${newName}"`, { kind: "success" });
}

function exportProjectToFile(id) {
  try {
    // Active project = read live state (catches unsaved edits). Other rows =
    // read the saved blob (last-saved snapshot). Both branches go through the
    // same buildProjectExportPayload(ForSaved) helpers as the Export-mode JSON
    // exporter so the file format is identical.
    let payload, name;
    if (id && id !== activeProjectId) {
      const data = projectStorage.load(id);
      payload    = buildProjectExportPayloadForSaved(data);
      name       = projectStorage.meta(id)?.name || "untitled";
    } else {
      payload = buildProjectExportPayload();
      name    = state.projectName || "untitled";
    }
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.tilesetproj.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  } catch (err) {
    console.error("[projectBar] export failed:", err);
    showToast(`Export failed: ${err.message || err}`, { kind: "error" });
  }
}

function requestImport() {
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = ".json,application/json";
  picker.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      // Always ask — stray import shouldn't silently overwrite the active
      // project, even when clean.
      const dirtyNote = state.isProjectDirty() ? " (has unsaved changes)" : "";
      const choice = await confirmReplaceOrNew({
        message: `Replace the current project "${state.projectName}"${dirtyNote}, or open the imported file as a new entry?`,
      });
      if (choice === "replace") await loadProjectFromObject(obj);
      else if (choice === "new") await importProjectAsNewEntry(obj);
    } catch (err) {
      console.error("[projectBar] import failed:", err);
      showToast(`Import failed: ${err.message || err}`, { kind: "error" });
    }
  });
  picker.click();
}

// Public — used by drag&drop in main.js. activeProjectId is cleared so a
// follow-up Save creates a fresh entry instead of overwriting whatever the
// last loaded project was. Hydrates the bundle (embedded images + template)
// before deserialize so pool refs resolve against the just-imported inputs.
export async function loadProjectFromObject(obj) {
  const cleaned = await hydrateBundle(obj);
  await state.deserialize(cleaned);
  activeProjectId = null;
  setLastProjectId(null);
  refreshProjectModal();
  showToast(`Imported "${state.projectName}" — click Save to keep it`, { kind: "info", duration: 4000 });
}

// Public — used by drag&drop "Open as new entry" path. Imports into a fresh
// storage row, switches to it, and deserialises so the imported project is
// the active one immediately. Bundle is hydrated globally before persistence
// — localStorage stays slim since images already live in content-addressed
// `images` storage after hydrate.
export async function importProjectAsNewEntry(obj) {
  const cleaned = await hydrateBundle(obj);
  const baseName = (cleaned?.projectName && String(cleaned.projectName).trim()) || "untitled";
  const name = findFreeProjectName(baseName);
  const data = { ...cleaned, projectName: name };
  const id = projectStorage.create(name, data);
  await state.deserialize(data);
  activeProjectId = id;
  setLastProjectId(id);
  state.dispatchEvent(new CustomEvent("project:saved", { detail: id }));
  refreshProjectModal();
  showToast(`Imported as new project "${name}"`, { kind: "success" });
  return id;
}
