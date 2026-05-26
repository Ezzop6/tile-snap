import { state } from "../controller/state.js";
import { collectPoolNames } from "../controller/storage.js";
import { resolutionOptions } from "./resolutionOptions.js";

let rowEls = null;

export function initSourcePanel() {
  const a = document.getElementById("pool-items-a");
  const b = document.getElementById("pool-items-b");
  const addA = document.getElementById("pool-add-a");
  const addB = document.getElementById("pool-add-b");
  if (!a || !b || !addA || !addB) {
    console.warn("[sourcePanel] pool row elements missing");
    return;
  }

  rowEls = { A: a, B: b };

  addA.addEventListener("click", () => addSelectedToPool("A"));
  addB.addEventListener("click", () => addSelectedToPool("B"));
  document.getElementById("pool-add-rest-a")?.addEventListener("click", () => addRestAsVariants("A"));
  document.getElementById("pool-add-rest-b")?.addEventListener("click", () => addRestAsVariants("B"));
  document.getElementById("pool-randomize-a")?.addEventListener("click", () => state.randomizeSlotPoolOverrides("A"));
  document.getElementById("pool-randomize-b")?.addEventListener("click", () => state.randomizeSlotPoolOverrides("B"));
  document.getElementById("pool-swap")?.addEventListener("click", () => state.swapPools());
  for (const btn of document.querySelectorAll("[data-pool-clear]")) {
    btn.addEventListener("click", () => state.clearPool(btn.dataset.poolClear));
  }
  a.addEventListener("click", (e) => onPoolClick(e, "A"));
  b.addEventListener("click", (e) => onPoolClick(e, "B"));

  // Autocomplete pool names from the terms the user has already used in
  // other projects (+ the current session's names), rebuilt on focus so it
  // stays current after saving / loading other projects.
  const suggestList = ensureNameSuggestList();
  refreshNameSuggestions(suggestList);

  for (const key of ["A", "B"]) {
    const inp = document.getElementById(`pool-name-${key.toLowerCase()}`);
    if (!inp) continue;
    inp.setAttribute("list", suggestList.id);
    inp.value = state.poolName(key) || "";
    inp.addEventListener("focus", () => refreshNameSuggestions(suggestList));
    inp.addEventListener("change", () => state.setPoolName(key, inp.value));
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter")  inp.blur();
      if (e.key === "Escape") { inp.value = state.poolName(key) || ""; inp.blur(); }
    });
  }
  // Resolution select (render + export tile size, applies to preview AND
  // export). Options rebuilt whenever the auto value (= largest source) or the
  // stored value changes.
  const resSel = document.getElementById("source-resolution");
  if (resSel) {
    syncResolutionSelect();
    resSel.addEventListener("change", () => {
      const v = resSel.value;
      state.setExportResolution(v === "" ? null : parseInt(v, 10));
    });
    state.addEventListener("export-resolution:changed", syncResolutionSelect);
    state.addEventListener("pools:changed",  syncResolutionSelect);
    state.addEventListener("input:updated",  syncResolutionSelect);
    state.addEventListener("input:removed",  syncResolutionSelect);
    state.addEventListener("project:loaded", syncResolutionSelect);
  }

  // Project load / swap can change pool names — keep inputs in sync.
  state.addEventListener("pool-names:changed", () => {
    for (const key of ["A", "B"]) {
      const inp = document.getElementById(`pool-name-${key.toLowerCase()}`);
      if (!inp) continue;
      if (document.activeElement === inp) continue;
      const v = state.poolName(key) || "";
      if (inp.value !== v) inp.value = v;
    }
  });
  state.addEventListener("project:loaded", () => {
    for (const key of ["A", "B"]) {
      const inp = document.getElementById(`pool-name-${key.toLowerCase()}`);
      if (!inp) continue;
      inp.value = state.poolName(key) || "";
    }
  });

  state.addEventListener("pools:changed",     refresh);
  state.addEventListener("selection:changed", refresh);
  state.addEventListener("input:updated",     refresh);
  state.addEventListener("input:removed",     refresh);
  state.addEventListener("template:changed",  refresh);
  refresh();
}

// Shared <datalist> backing both pool-name inputs' autocomplete.
function ensureNameSuggestList() {
  let dl = document.getElementById("pool-name-suggestions");
  if (!dl) {
    dl = document.createElement("datalist");
    dl.id = "pool-name-suggestions";
    document.body.appendChild(dl);
  }
  return dl;
}

// Rebuild the resolution <select>: Auto (= live largest-source size) + presets,
// plus the current value if it isn't a preset (e.g. an odd source size).
function syncResolutionSelect() {
  const sel = document.getElementById("source-resolution");
  if (!sel) return;
  sel.innerHTML = resolutionOptions(state.exportResolution, state.nativeSlotSize);
}

function refreshNameSuggestions(dl) {
  if (!dl) return;
  const names = new Set(collectPoolNames());
  for (const key of ["A", "B"]) {
    const v = (state.poolName(key) || "").trim();
    if (v) names.add(v); // include the current (possibly unsaved) session names
  }
  // value set as a property (not innerHTML) → no escaping concerns.
  dl.replaceChildren(...[...names].sort((a, b) => a.localeCompare(b)).map((n) => {
    const opt = document.createElement("option");
    opt.value = n;
    return opt;
  }));
}

function addSelectedToPool(key) {
  const sel = state.selectedTile;
  if (!sel) return;
  state.addToPool(key, sel.inputId, sel.tileCol, sel.tileRow);
}

function addRestAsVariants(key) {
  const master = state.master(key);
  if (!master) return;
  const input = state.inputs.find((i) => i.id === master.inputId);
  if (!input?.tiles) return;
  const existing = new Set(state.pool(key).map((r) => `${r.inputId}|${r.tileCol},${r.tileRow}`));
  for (const tile of input.tiles) {
    const k = `${input.id}|${tile.col},${tile.row}`;
    if (existing.has(k)) continue;
    state.addToPool(key, input.id, tile.col, tile.row);
  }
}

function onPoolClick(e, key) {
  const removeBtn = e.target.closest("[data-action='remove']");
  if (removeBtn) {
    const idx = parseInt(removeBtn.dataset.index, 10);
    if (!Number.isNaN(idx)) state.removeFromPool(key, idx);
  }
}

function refresh() {
  if (!rowEls) return;
  renderRow("A");
  renderRow("B");
  const sel = state.selectedTile;
  const inPool = (key) =>
    sel && state.pool(key).some((r) =>
      r.inputId === sel.inputId && r.tileCol === sel.tileCol && r.tileRow === sel.tileRow);
  document.getElementById("pool-add-a").disabled = !sel || inPool("A");
  document.getElementById("pool-add-b").disabled = !sel || inPool("B");
  const hasSlots = (state.template?.slots?.length ?? 0) > 0;
  for (const key of ["A", "B"]) {
    const btn = document.getElementById(`pool-add-rest-${key.toLowerCase()}`);
    if (btn) {
      const master = state.master(key);
      const input = master ? state.inputs.find((i) => i.id === master.inputId) : null;
      btn.disabled = !master || !input || (input.tiles?.length ?? 0) <= state.pool(key).length;
    }
    const randBtn = document.getElementById(`pool-randomize-${key.toLowerCase()}`);
    if (randBtn) randBtn.disabled = state.pool(key).length < 2 || !hasSlots;
    const clearBtn = document.querySelector(`[data-pool-clear="${key}"]`);
    if (clearBtn) clearBtn.disabled = state.pool(key).length === 0;
  }
  const swapBtn = document.getElementById("pool-swap");
  if (swapBtn) {
    swapBtn.disabled = state.pool("A").length === 0 && state.pool("B").length === 0;
  }
}

function renderRow(key) {
  const el = rowEls[key];
  el.innerHTML = "";
  const pool = state.pool(key);
  if (pool.length === 0) {
    const empty = document.createElement("span");
    empty.className = "pool-row__empty";
    empty.textContent = "empty — pick a tile and click +";
    el.append(empty);
    return;
  }
  for (let i = 0; i < pool.length; i++) {
    el.append(buildThumb(key, i, pool[i]));
  }
}

function buildThumb(key, index, ref) {
  const wrap = document.createElement("div");
  wrap.className = "pool-thumb" + (index === 0 ? " pool-thumb--master" : "");
  wrap.title = labelFor(ref) + (index === 0 ? " (master)" : ` (variant ${index})`);

  const input = state.inputs.find((i) => i.id === ref.inputId);
  const tile  = input?.tiles.find((t) => t.row === ref.tileRow && t.col === ref.tileCol);
  if (tile) {
    const img = document.createElement("img");
    img.className = "pool-thumb__img";
    img.src = tile.dataUrl;
    img.alt = "";
    img.draggable = false;
    wrap.append(img);
  } else {
    const missing = document.createElement("span");
    missing.className = "pool-thumb__missing";
    missing.textContent = "?";
    wrap.append(missing);
  }

  if (index === 0) {
    const star = document.createElement("span");
    star.className = "pool-thumb__badge";
    star.textContent = "★";
    wrap.append(star);
  }

  const remove = document.createElement("button");
  remove.className = "pool-thumb__remove";
  remove.type = "button";
  remove.dataset.action = "remove";
  remove.dataset.index  = String(index);
  remove.title = index === 0
    ? "Remove master (next variant becomes master)"
    : `Remove variant ${index}`;
  remove.textContent = "×";
  wrap.append(remove);

  return wrap;
}

function labelFor(ref) {
  const input = state.inputs.find((i) => i.id === ref.inputId);
  return input ? `${input.name} [${ref.tileCol},${ref.tileRow}]` : "unknown tile";
}
