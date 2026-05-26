// Projects modal — full-screen overlay listing saved projects with per-row
// actions (Load / Duplicate / Export JSON / Delete) and a rename input bound
// to the active project. Replaces the dropdown picker that lived in the
// topbar combo.
//
// Lifecycle:
//   initProjectModal({ getActiveId, onLoad, onNew, onDelete, onRename,
//                      onImport, onDuplicate, onExportRow })
//   openProjectModal() / closeProjectModal() / refreshProjectModal()
//
// Close interactions (Esc / backdrop / ✕) don't commit any action — they
// just hide the modal. Switching, deleting, importing all require an
// explicit click on the matching button.

import { state } from "../controller/state.js";
import {
  projects as projectStorage,
  storageUsageBytes,
  findUnusedInputs,
  cleanOrphanImageBinaries,
} from "../controller/storage.js";
import { getTemplateById } from "../templates/index.js";
import { showToast } from "./toast.js";
import { showDialog } from "./dialog.js";

let root         = null;
let nameInput    = null;
let listEl       = null;
let footerEl     = null;
let isOpen       = false;
let opts         = null;

export function initProjectModal(options) {
  opts = options;
  ensureMounted();
  state.addEventListener("project-name:changed", () => {
    if (document.activeElement !== nameInput) {
      nameInput.value = state.projectName || "";
    }
  });
  state.addEventListener("project:saved",        refreshProjectModal);
  state.addEventListener("project:deleted",      refreshProjectModal);
  state.addEventListener("project:loaded",       refreshProjectModal);
  state.addEventListener("project-dirty:changed", refreshProjectModal);
}

export function openProjectModal() {
  if (!root) return;
  refreshProjectModal();
  nameInput.value = state.projectName || "";
  root.classList.add("is-open");
  isOpen = true;
}

export function closeProjectModal() {
  if (!root) return;
  root.classList.remove("is-open");
  isOpen = false;
}

export function refreshProjectModal() {
  if (!root) return;
  const items = projectStorage.list();
  const activeId = opts?.getActiveId?.() ?? null;

  listEl.innerHTML = "";
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "project-modal__empty";
    empty.innerHTML = `
      <p>No saved projects yet.</p>
      <div class="project-modal__empty-actions"></div>
    `;
    const actions = empty.querySelector(".project-modal__empty-actions");
    actions.append(
      buildBtn("+ New project",  "primary", () => triggerNew()),
      buildBtn("⬆ Import JSON",  "default", () => triggerImport()),
    );
    listEl.appendChild(empty);
  } else {
    for (const meta of items) {
      listEl.appendChild(buildRow(meta, meta.id === activeId));
    }
  }

  const bytes = storageUsageBytes();
  const mb = (bytes / 1024 / 1024).toFixed(2);
  footerEl.querySelector(".project-modal__usage").textContent =
    `${items.length} project${items.length === 1 ? "" : "s"} · ${mb} MB used`;

  // Always enabled: setProjectName() works without an active id (unsaved
  // new projects can be renamed; the name lands in storage on first Save).
  nameInput.title = activeId == null
    ? "Rename — name persists when you save the project"
    : "Rename the active project";
}

function buildRow(meta, isActive) {
  const row = document.createElement("div");
  row.className = "project-modal__row" + (isActive ? " is-active" : "");
  row.dataset.id = meta.id;
  row.title = isActive ? "" : "Click to load";

  // Read project data (cheap: localStorage). Pool A/B and template info are
  // resolved from the saved blob — the active row reflects saved state, not
  // unsaved live edits (Save button's dirty indicator covers that case).
  const data     = projectStorage.load(meta.id);
  const poolA    = data?.pools?.A ?? [];
  const poolB    = data?.pools?.B ?? [];
  const nameA    = effectiveTerrain(data?.poolNames?.A, meta.name, "A");
  const nameB    = effectiveTerrain(data?.poolNames?.B, meta.name, "B");
  const template = getTemplateById(data?.template);
  const tmplName = template?.name || data?.template || "—";
  const layout   = describeLayout(template);
  const thumbA   = resolveMasterThumb(poolA);
  const thumbB   = resolveMasterThumb(poolB);

  row.append(buildIdentityCol(meta, tmplName, layout, isActive));
  row.append(buildPoolsCol(thumbA, thumbB, nameA, nameB));
  row.append(buildActionsCol(meta.id));

  // Row click = load. Buttons inside .project-modal__row-actions stopPropagation
  // so duplicate/export/delete don't double-fire load.
  row.addEventListener("click", () => triggerLoad(meta.id));
  return row;
}

function buildIdentityCol(meta, tmplName, layout, isActive) {
  const col = document.createElement("div");
  col.className = "project-modal__row-identity";

  const isDirty = isActive && state.isProjectDirty();
  const name = document.createElement("div");
  name.className = "project-modal__row-name"
    + (isDirty ? " project-modal__row-name--dirty" : "");
  name.textContent = (isActive ? "● " : "") + meta.name + (isDirty ? " *" : "");
  col.append(name);

  const tmpl = document.createElement("div");
  tmpl.className = "project-modal__row-meta";
  tmpl.textContent = `${tmplName} · ${layout.patternDims} · ${layout.gridKind} · ${layout.terrainMode}`;
  col.append(tmpl);

  const time = document.createElement("div");
  time.className = "project-modal__row-time";
  time.textContent = formatRelative(meta.lastModified);
  col.append(time);

  return col;
}

function buildPoolsCol(thumbA, thumbB, nameA, nameB) {
  const col = document.createElement("div");
  col.className = "project-modal__row-pools";
  col.append(buildPoolBlock(thumbA, nameA, "a"));
  const arrow = document.createElement("span");
  arrow.className = "project-modal__row-arrow";
  arrow.textContent = "↔";
  col.append(arrow);
  col.append(buildPoolBlock(thumbB, nameB, "b"));
  return col;
}

function buildPoolBlock(thumbUrl, eff, sideClass) {
  const block = document.createElement("div");
  block.className = "project-modal__pool project-modal__pool--" + sideClass;

  const thumbWrap = document.createElement("div");
  thumbWrap.className = "project-modal__pool-thumb-wrap";
  const badge = document.createElement("span");
  badge.className = "project-modal__pool-badge";
  badge.textContent = sideClass.toUpperCase();
  thumbWrap.append(badge);
  if (thumbUrl) {
    const img = document.createElement("img");
    img.className = "project-modal__pool-thumb";
    img.src = thumbUrl;
    img.alt = "";
    img.title = eff.effective;
    thumbWrap.append(img);
  } else {
    const placeholder = document.createElement("span");
    placeholder.className = "project-modal__pool-thumb project-modal__pool-thumb--empty";
    placeholder.title = "Pool has no master tile";
    thumbWrap.append(placeholder);
  }
  block.append(thumbWrap);

  const name = document.createElement("span");
  name.className = "project-modal__pool-name"
    + (eff.fallback ? " project-modal__pool-name--fallback" : "");
  name.textContent = eff.effective;
  block.append(name);
  return block;
}

function buildActionsCol(id) {
  const col = document.createElement("div");
  col.className = "project-modal__row-actions";
  // Stop propagation so the parent row's "click = load" handler doesn't
  // also fire when the user clicks an action button.
  col.addEventListener("click", (e) => e.stopPropagation());
  col.append(buildIconBtn("⎘", "Duplicate",  "default", () => triggerDuplicate(id)));
  col.append(buildIconBtn("⬇", "Export JSON","default", () => triggerExport(id)));
  col.append(buildIconBtn("🗑", "Delete",     "danger",  () => triggerDelete(id)));
  return col;
}

function buildIconBtn(icon, title, variant, onClick, disabled = false) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "project-modal__icon-btn"
    + (variant === "primary" ? " project-modal__icon-btn--primary" : "")
    + (variant === "danger"  ? " project-modal__icon-btn--danger"  : "");
  btn.textContent = icon;
  btn.title = title;
  btn.disabled = disabled;
  btn.addEventListener("click", onClick);
  return btn;
}

function buildBtn(label, variant, onClick, disabled = false) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "project-modal__btn"
    + (variant === "primary" ? " project-modal__btn--primary" : "")
    + (variant === "danger"  ? " project-modal__btn--danger"  : "");
  btn.textContent = label;
  btn.disabled = disabled;
  btn.addEventListener("click", onClick);
  return btn;
}

// Compact summary of the template structure: pattern dims (3×3 / 2×2 / …),
// grid kind (single / dual), and the Godot terrain mode it targets.
function describeLayout(template) {
  if (!template) return { patternDims: "—", gridKind: "—", terrainMode: "—" };
  const arr  = template.slots?.[0]?.array;
  const rows = arr?.length || 0;
  const cols = arr?.[0]?.length || 0;
  return {
    patternDims: rows && cols ? `${rows}×${cols}` : "—",
    gridKind:    template.gridKind   || "single",
    terrainMode: template.terrainMode || "corners-and-sides",
  };
}

// Looks up the master ref (= pool[0]) and finds its tile.dataUrl in the
// global inputs library. Returns null when the pool is empty or the input
// isn't present (e.g. project referencing a deleted hash).
function resolveMasterThumb(refs) {
  const master = refs?.[0];
  if (!master) return null;
  const input = state.inputs.find((i) => i.id === master.inputId);
  if (!input) return null;
  const tile = input.tiles?.find((t) => t.row === master.tileRow && t.col === master.tileCol);
  return tile?.dataUrl || null;
}

function effectiveTerrain(raw, projectName, poolKey) {
  const trimmed = String(raw ?? "").trim();
  if (trimmed) return { effective: trimmed, fallback: false };
  return { effective: `${projectName}.${poolKey}`, fallback: true };
}

function triggerLoad(id)      { opts?.onLoad?.(id); }
function triggerNew()         { opts?.onNew?.(); }
function triggerDelete(id)    { opts?.onDelete?.(id); }
function triggerDuplicate(id) { opts?.onDuplicate?.(id); }
function triggerExport(id)    { opts?.onExportRow?.(id); }
function triggerImport()      { opts?.onImport?.(); }

function ensureMounted() {
  if (root) return;
  root = document.createElement("div");
  root.className = "project-modal";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.innerHTML = `
    <div class="project-modal__backdrop"></div>
    <div class="project-modal__box">
      <button class="project-modal__close" type="button" aria-label="Close">✕</button>
      <h2 class="project-modal__title">Projects</h2>
      <div class="project-modal__rename-row">
        <label class="project-modal__rename-label" for="project-modal-name">Name</label>
        <input class="project-modal__rename-input" id="project-modal-name" type="text" autocomplete="off" spellcheck="false">
      </div>
      <div class="project-modal__list" id="project-modal-list"></div>
      <div class="project-modal__footer" id="project-modal-footer">
        <div class="project-modal__footer-actions">
          <button class="project-modal__btn project-modal__btn--primary" id="project-modal-new"    type="button">+ New project</button>
          <button class="project-modal__btn"                              id="project-modal-import" type="button">⬆ Import JSON</button>
          <button class="project-modal__btn"                              id="project-modal-clean"  type="button" title="Remove library entries (and their image binaries) not referenced by any saved project">🧹 Clean unused inputs</button>
        </div>
        <span class="project-modal__usage"></span>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  nameInput = root.querySelector("#project-modal-name");
  listEl    = root.querySelector("#project-modal-list");
  footerEl  = root.querySelector("#project-modal-footer");

  root.querySelector(".project-modal__backdrop").addEventListener("click", closeProjectModal);
  root.querySelector(".project-modal__close").addEventListener("click", closeProjectModal);
  document.addEventListener("keydown", (e) => {
    if (!isOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeProjectModal();
    }
  });

  nameInput.addEventListener("input", () => {
    state.setProjectName(nameInput.value);
  });
  nameInput.addEventListener("change", () => {
    nameInput.value = state.projectName;
    opts?.onRename?.(state.projectName);
  });

  root.querySelector("#project-modal-new").addEventListener("click",    triggerNew);
  root.querySelector("#project-modal-import").addEventListener("click", triggerImport);
  root.querySelector("#project-modal-clean").addEventListener("click", async () => {
    const unused = findUnusedInputs();
    if (unused.length === 0) {
      showToast("No unused images to clean", { kind: "info" });
      return;
    }
    const names = unused.slice(0, 5).map((i) => i.name || i.id).join(", ");
    const more  = unused.length > 5 ? ` … and ${unused.length - 5} more` : "";
    const choice = await showDialog({
      title: "Clean unused images",
      message: `${unused.length} uploaded image${unused.length === 1 ? "" : "s"} are not referenced by any saved project: ${names}${more}. Delete them from the library + storage?`,
      buttons: [
        { label: "Delete", value: "delete", variant: "danger"  },
        { label: "Cancel", value: "cancel" },
      ],
    });
    if (choice !== "delete") return;
    for (const inp of unused) state.removeInput(inp.id);
    const { count, freedBytes } = cleanOrphanImageBinaries();
    const mb = (freedBytes / 1024 / 1024).toFixed(2);
    showToast(
      `Cleaned ${unused.length} input${unused.length === 1 ? "" : "s"} · ${count} binar${count === 1 ? "y" : "ies"} · freed ${mb} MB`,
      { kind: "success" },
    );
    refreshProjectModal();
  });
}

function formatRelative(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000)         return "just now";
  if (diff < 3_600_000)      return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000)     return `${Math.floor(diff / 3_600_000)} h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} d ago`;
  return new Date(ts).toLocaleDateString();
}

