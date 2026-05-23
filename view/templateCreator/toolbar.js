import { state } from "../../controller/state.js";
import { defaultTemplate, deleteUserTemplate, findFreeTemplateName } from "../../templates/index.js";
import { projects as projectStorage } from "../../controller/storage.js";
import { showToast } from "../toast.js";
import { confirmDestructive } from "../dialog.js";
import { getActiveProjectId } from "../projectBar.js";
import { getCellShape } from "../cellShapes/index.js";
import { defaultConnectedSaddle, defaultGridKind } from "../cellShapes/square.js";
import { refs, sync } from "./refs.js";
import { ensureEditable } from "./guards.js";
import { hasAnyPainted, makeEmptyArray, patternDims, updateMeta } from "./layout.js";
import { renderEditor } from "./render.js";

export function syncToolbarInputs() {
  const t = state.template;
  if (!t) return;
  if (refs.nameInput) refs.nameInput.value = t.name;
  if (refs.cellShapeSelect) refs.cellShapeSelect.value = t.cellShape || "square";
}

export function syncCreatorDeleteButton() {
  const btn = document.getElementById("creator-delete-template");
  if (!btn) return;
  const t = state.template;
  // Delete only meaningful for user templates persisted in storage.
  btn.disabled = !t || t.source !== "user";
  btn.title = btn.disabled
    ? "No user template loaded — switch to one to enable delete"
    : `Delete user template "${t.name}"`;
}

// Full rebuild: toolbar + shape params + editor + meta. Called on mode
// switch, template ref change, import.
export function fullSync() {
  sync.lastRenderedRef = state.template;
  syncToolbarInputs();
  renderShapeParams();
  renderEditor();
  updateMeta();
}

export function renderShapeParams() {
  if (!refs.shapeParamsHost || !state.template) return;
  refs.shapeParamsHost.innerHTML = "";
  const shape = getCellShape(state.template.cellShape);
  shape.renderParams?.(refs.shapeParamsHost, state.template, paramCtx());
}

function paramCtx() {
  return {
    onChange: () => {
      // cellShape's renderParams may mutate state.template; treat as an edit.
      renderEditor();
      updateMeta();
      state.markTemplateDirty();
      syncToolbarInputs();
      sync.suppressNextRebuild = true;
      state.notifyTemplateChanged();
    },
    hasContent: () => hasAnyPainted(),
    // Builtin promotion guard for cellShape event handlers. BOTH async —
    // ensureEditable opens the builtin-promotion dialog, ctx.confirm chains
    // ensureEditable then a destructive confirm. Callers must await both
    // and read state.template via getTemplate() AFTER, because the active
    // template may have been replaced by an in-memory copy.
    ensureEditable: () => ensureEditable(),
    getTemplate:    () => state.template,
    confirm:        async (msg) => {
      if (!(await ensureEditable())) return false;
      return await confirmDestructive({
        title:        "Destructive change",
        message:      msg,
        confirmLabel: "Continue",
      });
    },
    makeEmptyArray,
  };
}

export async function onNameChange() {
  if (!(await ensureEditable())) {
    if (refs.nameInput) refs.nameInput.value = state.template?.name || "";
    return;
  }
  const cleaned = (refs.nameInput.value || "").trim() || "untitled";
  if (cleaned === state.template.name) return;
  // Ids are opaque now, so the display name is the only human-facing key —
  // keep it unique. A collision with another template gets a " (N)" increment
  // (excludeId so renaming to the template's own name is a no-op above).
  const unique = findFreeTemplateName(cleaned, { excludeId: state.template.id });
  state.template.name = unique;
  state.markTemplateDirty();
  syncToolbarInputs();
  sync.suppressNextRebuild = true;
  state.notifyTemplateChanged();
}

export async function onCellShapeChange() {
  if (!refs.cellShapeSelect) return;
  const newShape = getCellShape(refs.cellShapeSelect.value);
  if (state.template?.cellShape === newShape.id) return;
  if (!(await ensureEditable())) {
    refs.cellShapeSelect.value = state.template?.cellShape || "square";
    return;
  }
  // Different value spaces; switching wipes per-slot content rather than
  // mapping across. cellShape change affects PATTERN dims (slot.array),
  // NOT layout (template.rows/cols).
  const t = state.template;
  const curPattern = patternDims(t);
  const patternN = t.cellShape === "square" ? Math.max(curPattern.rows, curPattern.cols) : 3;
  const dims = newShape.slotDims(patternN, t);
  t.cellShape = newShape.id;
  t.gridKind        = defaultGridKind(dims.rows, dims.cols);
  t.connectedSaddle = defaultConnectedSaddle(dims.rows, dims.cols);
  for (const slot of t.slots) {
    slot.array = makeEmptyArray(dims.rows, dims.cols, () => newShape.defaultValue(t));
  }
  syncToolbarInputs();
  renderShapeParams();
  renderEditor();
  updateMeta();
  state.markTemplateDirty();
  sync.suppressNextRebuild = true;
  state.notifyTemplateChanged();
}

export async function onDeleteTemplate() {
  const t = state.template;
  if (!t || t.source !== "user") return;
  const usage = collectProjectsUsingTemplate(t.id);
  const usageMsg = usage.length > 0
    ? ` Used by ${usage.length} project${usage.length === 1 ? "" : "s"}: ${usage.join(", ")} — they will load with no template assigned.`
    : "";
  const ok = await confirmDestructive({
    title:   "Delete template",
    message: `Delete user template "${t.name}"?${usageMsg} This can't be undone.`,
  });
  if (!ok) return;
  const name = t.name;
  deleteUserTemplate(t.id);
  // Full switch — wipes slot-keyed data, clears dirty.
  state.setTemplate(defaultTemplate);
  showToast(`Deleted "${name}"`, { kind: "success" });
}

// Walks saved projects + live state for `data.template === templateId`.
// The active project gets a " (current)" suffix so user knows about their
// own in-progress reference, even if it isn't persisted yet.
function collectProjectsUsingTemplate(templateId) {
  const out = [];
  const activeId = getActiveProjectId();
  if (state.template?.id === templateId) {
    out.push(`${state.projectName} (current)`);
  }
  for (const meta of projectStorage.list()) {
    if (meta.id === activeId) continue; // already covered via live state above
    const data = projectStorage.load(meta.id);
    if (data?.template === templateId) out.push(meta.name);
  }
  return out;
}
