import { state } from "../controller/state.js";
import {
  listTemplates,
  getTemplateById,
  templateRegistry,
} from "../templates/index.js";
import { projects as projectStorage } from "../controller/storage.js";
import { getLastProjectId } from "../controller/settings.js";
import { showToast } from "./toast.js";
import { confirmDestructive } from "./dialog.js";

let toolbar = null;
let templateSelectEl = null;

export function initCanvasToolbar() {
  toolbar = document.getElementById("canvas-toolbar");
  if (!toolbar) return;

  templateSelectEl = toolbar.querySelector("#template-select");
  if (!templateSelectEl) return;

  populateTemplateSelect();

  templateSelectEl.addEventListener("change", async () => {
    const newId = templateSelectEl.value;
    // Selecting the same id is a no-op even when dirty.
    if (state.template && newId === state.template.id) return;
    if (state.isTemplateDirty()) {
      const ok = await confirmDestructive({
        title: "Discard template edits",
        message: "Discard unsaved template edits and switch to the new template?",
        confirmLabel: "Discard",
      });
      if (!ok) {
        // Roll back the select to the current template.
        refresh();
        return;
      }
    }
    const t = getTemplateById(newId);
    if (t) state.setTemplate(t);
  });

  templateRegistry.addEventListener("changed", () => {
    populateTemplateSelect();
    refresh();
  });

  state.addEventListener("template:changed", () => {
    populateTemplateSelect();
    refresh();
  });
  state.addEventListener("template-dirty:changed", refresh);
  refresh();

  // CSS `body.map-hidden .map-overlay { display: none }` does the hiding; we
  // sync the body class with state so save/load and button stay consistent.
  const mapToggle = document.getElementById("map-toggle");
  if (mapToggle) {
    mapToggle.addEventListener("click", () => state.setMapVisible(!state.mapVisible));
    state.addEventListener("map-visible:changed", syncMapClass);
    syncMapClass();
  }

  initImportFromProject();
}

// Two dropdowns next to the utility buttons let the user copy parameter
// sets (Curve + Noise, or Texture ops) from another saved project into
// the current one. Per-slot deformations + pool refs are deliberately
// left out — only project-level params are safe to transplant.
function initImportFromProject() {
  const curveSel = document.getElementById("import-curve-noise");
  const texSel   = document.getElementById("import-texture-ops");
  if (!curveSel || !texSel) return;

  const repopulate = () => {
    populateImportSelect(curveSel, "Import curve + noise ▾");
    populateImportSelect(texSel,   "Import texture ops ▾");
  };
  repopulate();

  curveSel.addEventListener("change", () => {
    const id = curveSel.value;
    curveSel.value = ""; // snap back to placeholder
    if (!id) return;
    const data = projectStorage.load(id);
    const meta = projectStorage.meta(id);
    if (!data) { showToast("Project no longer exists", { kind: "error" }); return; }
    if (state.importCurveAndNoiseFrom(data)) {
      showToast(`Imported curve + noise from "${meta?.name || "project"}"`, { kind: "info" });
    }
  });
  texSel.addEventListener("change", () => {
    const id = texSel.value;
    texSel.value = "";
    if (!id) return;
    const data = projectStorage.load(id);
    const meta = projectStorage.meta(id);
    if (!data) { showToast("Project no longer exists", { kind: "error" }); return; }
    if (state.importTextureOpsFrom(data)) {
      showToast(`Imported texture ops from "${meta?.name || "project"}"`, { kind: "info" });
    }
  });

  // Keep dropdowns fresh when projects come and go (save / delete / rename).
  state.addEventListener("project:deleted",         repopulate);
  state.addEventListener("project:saved",           repopulate);
  state.addEventListener("active-project:changed",  repopulate);
  state.addEventListener("project-name:changed",    repopulate);
}

function populateImportSelect(sel, placeholder) {
  const activeId = getLastProjectId();
  sel.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.disabled = true;
  opt0.selected = true;
  opt0.textContent = placeholder;
  sel.append(opt0);
  const list = projectStorage.list().filter((p) => p.id !== activeId);
  if (list.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.disabled = true;
    opt.textContent = "— no other projects —";
    sel.append(opt);
    return;
  }
  for (const proj of list) {
    const opt = document.createElement("option");
    opt.value = proj.id;
    opt.textContent = proj.name || "untitled";
    sel.append(opt);
  }
}

function syncMapClass() {
  document.body.classList.toggle("map-hidden", !state.mapVisible);
  const btn = document.getElementById("map-toggle");
  if (btn) {
    btn.textContent  = state.mapVisible ? "Map ⊟" : "Map ⊞";
    btn.setAttribute("aria-pressed", String(state.mapVisible));
  }
}

function populateTemplateSelect() {
  templateSelectEl.innerHTML = "";
  const all = listTemplates();
  const grouped = { builtin: [], user: [], unsaved: [] };
  for (const t of all) grouped[t.source]?.push(t);

  // In-memory unsaved template (builtin copy or fresh import) lives only in
  // state.template — append it explicitly so the dropdown can show it.
  if (state.template?.source === "unsaved") {
    grouped.unsaved.push(state.template);
  }

  if (grouped.unsaved.length > 0) appendGroup(templateSelectEl, "Unsaved", grouped.unsaved);
  appendGroup(templateSelectEl, "Built-in", grouped.builtin);
  if (grouped.user.length > 0)    appendGroup(templateSelectEl, "User", grouped.user);
}

function appendGroup(selectEl, label, templates) {
  if (!templates.length) return;
  const group = document.createElement("optgroup");
  group.label = label;
  for (const t of templates) {
    const option = document.createElement("option");
    option.value = t.id;
    option.textContent = t.name;
    group.appendChild(option);
  }
  selectEl.appendChild(group);
}

function refresh() {
  if (!templateSelectEl) return;
  if (state.template) templateSelectEl.value = state.template.id;
  // Visual dirty cue on the active option label — repaint on every dirty toggle.
  const dirty = state.isTemplateDirty();
  for (const opt of templateSelectEl.querySelectorAll("option")) {
    const t = state.template;
    if (!t) continue;
    if (opt.value !== t.id) continue;
    opt.textContent = dirty ? `* ${t.name}` : t.name;
  }
  templateSelectEl.classList.toggle("is-dirty", dirty);
}
