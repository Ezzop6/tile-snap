import { state } from "../../controller/state.js";
import { VERSION } from "../../config.js";
import {
  saveUserTemplate,
  getTemplateById,
  cloneSlot,
  findFreeTemplateName,
  templateIdFromName,
  newTemplateId,
} from "../../templates/index.js";
import { showToast } from "../toast.js";
import { confirmDestructive } from "../dialog.js";
import { getMode, setMode } from "../modeTabs.js";
import { normalizeCardinal } from "../cellShapes/triangle.js";
import { sync } from "./refs.js";
import { ensureEditable } from "./guards.js";
import { isStageActive, slotAt } from "./layout.js";
import { fullSync, syncToolbarInputs, syncCreatorDeleteButton } from "./toolbar.js";

function snapshotTemplate(t) {
  const layoutRows = t.rows;
  const layoutCols = t.cols;
  const slots = [];
  for (let lr = 0; lr < layoutRows; lr++) {
    for (let lc = 0; lc < layoutCols; lc++) {
      const s = slotAt(t, lr, lc);
      if (!s) continue;
      // cloneSlot preserves cutTransform + sanitises array cells. Snapshot
      // is consumed by saveUserTemplate (no index) and exportJSON.
      slots.push(cloneSlot(s));
    }
  }
  return {
    version: VERSION,
    id: t.id,
    name: t.name,
    cols: layoutCols,
    rows: layoutRows,
    cellShape: t.cellShape === "triangle" ? "triangle" : "square",
    triangleCardinals: normalizeCardinal(t.triangleCardinals),
    gridKind: t.gridKind === "dual" ? "dual" : "single",
    connectedSaddle: t.connectedSaddle === true,
    saddleBridgeOffset: typeof t.saddleBridgeOffset === "number" ? t.saddleBridgeOffset : 0.25,
    terrainMode: ["corners-and-sides", "corners", "sides"].includes(t.terrainMode)
      ? t.terrainMode : "corners-and-sides",
    slots,
  };
}

export function exportJSON() {
  const t = state.template;
  if (!t) return;
  const out  = snapshotTemplate(t);
  const json = JSON.stringify(out, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `${templateIdFromName(out.name)}.template.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function looksLikeTemplateJSON(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (!Array.isArray(obj.slots)) return false;
  if ("inputs" in obj || "pools" in obj || "globalCurve" in obj) return false;
  const sample = obj.slots[0];
  if (!sample || !Array.isArray(sample.array)) return false;
  return Number.isFinite(obj.rows) && Number.isFinite(obj.cols);
}

export async function importTemplateFromObject(obj) {
  if (!looksLikeTemplateJSON(obj)) {
    throw new Error("Not a valid template JSON (missing slots/rows/cols)");
  }
  // Dirty guard — importing replaces the active template completely.
  if (state.isTemplateDirty()) {
    const ok = await confirmDestructive({
      title:        "Discard template edits",
      message:      "Discard unsaved template edits and load the imported file?",
      confirmLabel: "Discard",
    });
    if (!ok) return;
  }
  // Build a fresh user-storage template object; same shape as cloneTemplateAsUser
  // but seeded from the imported data. Source stays "unsaved" until user saves.
  // Opaque id (name-independent) → save can never overwrite another template;
  // name passes through findFreeTemplateName to stay unique among existing ones.
  const name = findFreeTemplateName(obj.name || "imported template");
  const id   = newTemplateId();
  const imported = {
    id, name,
    cols: obj.cols, rows: obj.rows,
    cellShape: obj.cellShape === "triangle" ? "triangle" : "square",
    triangleCardinals: normalizeCardinal(obj.triangleCardinals),
    gridKind: obj.gridKind === "dual" ? "dual" : "single",
    connectedSaddle: obj.connectedSaddle === true,
    saddleBridgeOffset: typeof obj.saddleBridgeOffset === "number"
      ? Math.max(0, Math.min(1, obj.saddleBridgeOffset))
      : 0.25,
    terrainMode: ["corners-and-sides", "corners", "sides"].includes(obj.terrainMode)
      ? obj.terrainMode : "corners-and-sides",
    slots: obj.slots.map((s) => cloneSlot(s, { withIndex: true, cols: obj.cols })),
    source: "unsaved",
  };
  state.setTemplate(imported);
  state.markTemplateDirty();
  if (getMode() !== "template") setMode("template");
  if (isStageActive()) fullSync();
  showToast(`Imported template "${name}" — click Save to keep it`, { kind: "info", duration: 4000 });
}

export function pickTemplateFile() {
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = ".json,application/json";
  picker.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      await importTemplateFromObject(obj);
    } catch (err) {
      console.error("[templateCreator] import failed:", err);
      showToast(`Import failed: ${err.message || err}`, { kind: "error", duration: 4000 });
    }
  });
  picker.click();
}

// Snapshots the current template (including unsaved edits) into a fresh user-
// storage entry with a free name. Does NOT switch the active template — user
// stays on the original; toast offers a quick Switch action.
export function duplicateTemplate() {
  const t = state.template;
  if (!t) return;
  const baseName = t.name || "template";
  // alsoTaken reserves the source name so a duplicate always gets " (N)" even
  // when the source is an unsaved copy not yet in storage.
  const newName  = findFreeTemplateName(baseName, { alsoTaken: [baseName] });
  const newId    = newTemplateId();
  const snap     = snapshotTemplate(t);
  const data     = { ...snap, id: newId, name: newName };
  try {
    saveUserTemplate(data);
    showToast(`Duplicated "${baseName}" → "${newName}"`, {
      kind: "success",
      action: {
        label: "Switch",
        onClick: () => {
          const fresh = getTemplateById(newId);
          if (fresh) state.setTemplate(fresh);
        },
      },
    });
  } catch (err) {
    console.error("[templateCreator] duplicate failed:", err);
    showToast(`Duplicate failed: ${err.message || err}`, { kind: "error" });
  }
}

export async function saveToLibrary() {
  const t = state.template;
  if (!t) return;
  if (t.source === "builtin") {
    // Should only happen via direct Save click without any edits — promote first.
    if (!(await ensureEditable())) return;
  }
  const out = snapshotTemplate(state.template);
  try {
    saveUserTemplate(out);
    // After save, swap to the freshly-normalized user-source entry from storage.
    const fresh = getTemplateById(out.id);
    if (fresh) {
      sync.suppressNextRebuild = true;
      state.replaceTemplate(fresh);
    }
    state.markTemplateClean();
    syncToolbarInputs();
    syncCreatorDeleteButton();
    showToast(`Saved template "${out.name}"`, { kind: "success" });
  } catch (err) {
    console.error("[templateCreator] save failed:", err);
    showToast(`Save failed: ${err.message || err}`, { kind: "error", duration: 4000 });
  }
}
