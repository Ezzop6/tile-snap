import { state } from "../../controller/state.js";
import { VARIANT_PARAMS } from "../../core/variant_params.js";
import { xs } from "./_state.js";
import { formatNum, clamp } from "./utils.js";
import { currentGlobalValue } from "./tile.js";

export function renderParams() {
  const variantsBody = document.getElementById("export-variants-body");
  const mainBody     = document.getElementById("export-main-body");
  const poolsBody    = document.getElementById("export-pools-body");
  const variabBody   = document.getElementById("export-variability-body");
  if (!variantsBody || !mainBody || !poolsBody || !variabBody) return;

  const idx = state.selectedSlotIndex;
  const slot = (idx !== null && idx !== undefined)
    ? state.template?.slots.find((s) => s.index === idx)
    : null;
  if (xs.slotMetaEl) {
    xs.slotMetaEl.textContent = slot ? `slot ${idx} · ${slot.col},${slot.row}` : "";
  }
  // Whole Preview section is meaningful only with a slot selected;
  // hide it completely otherwise (= no empty canvas, no idle controls).
  const previewSection = document.getElementById("export-preview-section");
  if (previewSection) previewSection.hidden = !slot;

  const dir    = state.exportVariantDirection;
  const variab = state.exportVariability;
  const vUi    = variab * 100;

  if (!slot) {
    variantsBody.innerHTML = "";
  } else {
    const extra = state.getExportVariantCount(slot.index) - 1;
    variantsBody.innerHTML = `
      <label class="curve-panel__field">
        <span class="curve-panel__label">Variants</span>
        <input class="curve-panel__slider" id="export-variant-count"
               type="range" min="0" max="10" step="1" value="${extra}">
        <input class="curve-panel__value curve-panel__value--editable" id="export-variant-count-value"
               type="number" min="0" max="10" step="1" value="${extra}">
      </label>
    `;
  }

  mainBody.innerHTML = `
    <label class="curve-panel__field" title="Where variant tiles get packed in the output PNG">
      <select class="curve-panel__input" id="export-direction">
        <option value="smart" ${dir === "smart" ? "selected" : ""}>Pack: square (auto)</option>
        <option value="down"  ${dir === "down"  ? "selected" : ""}>Pack: stack down (extra rows)</option>
        <option value="right" ${dir === "right" ? "selected" : ""}>Pack: stack right (extra cols)</option>
      </select>
    </label>
    <label class="curve-panel__field">
      <span class="curve-panel__label" title="Max ± from current for variant range sliders">Variability</span>
      <input class="curve-panel__slider" id="export-variability"
             type="range" min="0" max="100" step="0.1" value="${vUi}">
      <input class="curve-panel__value curve-panel__value--editable" id="export-variability-value"
             type="number" min="0" max="100" step="0.1" value="${formatNum(vUi)}">
    </label>
    <div class="curve-panel__field export-view-row">
      <span class="curve-panel__label" title="Layout tile look + islands toggle">View</span>
      <div class="export-view-row__opts">
        <label class="export-view-row__opt" title="Structural debug overlay — works without sources">
          <input type="radio" name="export-layout-view" value="cuts" ${state.exportLayoutView === "cuts" ? "checked" : ""}>
          <span>Cuts</span>
        </label>
        <label class="export-view-row__opt" title="Full composite — sources + outline">
          <input type="radio" name="export-layout-view" value="textures" ${state.exportLayoutView === "textures" ? "checked" : ""}>
          <span>Textures</span>
        </label>
        <label class="export-view-row__opt" title="Render noise islands on the layout tiles (slower)">
          <input type="checkbox" id="export-show-islands" ${state.exportShowIslands ? "checked" : ""}>
          <span>Islands</span>
        </label>
        <label class="export-view-row__opt" title="Coloured group markers on slots that have variants (and their variant tiles)">
          <input type="checkbox" id="export-show-groups" ${state.exportShowGroups ? "checked" : ""}>
          <span>Groups</span>
        </label>
      </div>
    </div>
    <div class="curve-panel__field export-view-row" title="Append the pool's source tiles (master + every variant) as extra rows below the atlas. Pool A bundle goes in as plain atlas tiles (no terrain). Pool B bundle gets terrain assignment so Godot's autotile picker can use it as Terrain 1 interior tiles.">
      <span class="curve-panel__label">Bundle sources</span>
      <div class="export-view-row__opts">
        <label class="export-view-row__opt">
          <input type="checkbox" id="export-include-source-a" ${state.exportIncludeSourceA ? "checked" : ""}>
          <span>Pool A</span>
        </label>
        <label class="export-view-row__opt">
          <input type="checkbox" id="export-include-source-b" ${state.exportIncludeSourceB ? "checked" : ""}>
          <span>Pool B</span>
        </label>
      </div>
    </div>
  `;

  poolsBody.innerHTML = `${renderPoolWeightsBlock("A")}${renderPoolWeightsBlock("B")}`;
  if (!poolsBody.innerHTML.trim()) {
    poolsBody.innerHTML = `<p class="placeholder">Add 2+ entries to a pool to weight them.</p>`;
  }

  if (!slot) {
    variabBody.innerHTML = `<p class="placeholder">Click a slot to configure ranges.</p>`;
  } else {
    variabBody.innerHTML = `
      <div class="export-ranges">
        <div class="export-ranges__title">
          <span>Min / max per param</span>
          <button class="curve-panel__btn" type="button" id="export-ranges-random"
                  title="Randomize all min/max sliders for this slot">🎲</button>
        </div>
        ${VARIANT_PARAMS.map((p) => renderRangeRow(slot.index, p)).join("")}
      </div>
    `;
  }

  mainBody.querySelector("#export-direction").addEventListener("change", (e) => {
    state.setExportVariantDirection(e.target.value);
  });
  const varSlider = mainBody.querySelector("#export-variability");
  const varValue  = mainBody.querySelector("#export-variability-value");
  varSlider.addEventListener("input", () => {
    const v = parseFloat(varSlider.value) || 0;
    varValue.value = String(formatNum(v));
    state.setExportVariability(v / 100);
  });
  varValue.addEventListener("change", () => {
    let v = parseFloat(varValue.value);
    if (!Number.isFinite(v)) v = 0;
    v = Math.max(0, Math.min(100, v));
    varSlider.value = String(v);
    varValue.value  = String(formatNum(v));
    state.setExportVariability(v / 100);
  });
  mainBody.querySelector("#export-show-islands")?.addEventListener("change", (e) => {
    state.setExportShowIslands(e.target.checked);
  });
  mainBody.querySelector("#export-show-groups")?.addEventListener("change", (e) => {
    state.setExportShowGroups(e.target.checked);
  });
  mainBody.querySelector("#export-include-source-a")?.addEventListener("change", (e) => {
    state.setExportIncludeSourceA(e.target.checked);
  });
  mainBody.querySelector("#export-include-source-b")?.addEventListener("change", (e) => {
    state.setExportIncludeSourceB(e.target.checked);
  });
  for (const r of mainBody.querySelectorAll('input[name="export-layout-view"]')) {
    r.addEventListener("change", () => {
      if (r.checked) state.setExportLayoutView(r.value);
    });
  }
  wirePoolWeightInputs("A");
  wirePoolWeightInputs("B");
  if (slot) {
    const countSlider = variantsBody.querySelector("#export-variant-count");
    const countValue  = variantsBody.querySelector("#export-variant-count-value");
    const commitCount = (extra) => {
      const e = Math.max(0, Math.min(10, Math.floor(extra) || 0));
      countSlider.value = String(e);
      countValue.value  = String(e);
      state.setExportVariantCount(slot.index, e + 1);
    };
    countSlider.addEventListener("input", () => commitCount(parseInt(countSlider.value, 10)));
    countValue.addEventListener("change", () => commitCount(parseInt(countValue.value, 10)));
    wireRangeRows(slot.index);
  }
}

// Populate EVERY slot in the active template with `extraCount` random
// variants. For each slot: bump variantCount to `extraCount + 1` (master +
// extras), pick a random pool A and pool B entry for each variant, then
// randomize the per-param variability ranges. Pool sides with <=1 entry
// get cleared (no override) — pinning the sole tile is meaningless.
// Per variant pool slot: master picked with probability = exportMasterShare,
// otherwise uniform pick among the non-master entries. Single-entry pools
// resolve to null (no override; the sole tile is implicit).
function pickMasterBiased(len, share) {
  if (len <= 1) return null;
  if (Math.random() < share) return 0;
  return 1 + Math.floor(Math.random() * (len - 1));
}

export function randomizeAllVariants(extraCount) {
  const t = state.template;
  if (!t) return;
  // Apply master-biased weights to BOTH pools so Pool weights UI + Godot
  // probability + future weighted picks all reflect the same share setting.
  state.randomizePoolWeights("A");
  state.randomizePoolWeights("B");
  const lenA = state.pool("A").length;
  const lenB = state.pool("B").length;
  const share = Math.max(0, Math.min(1, state.exportMasterShare ?? 0.75));
  const total = Math.max(1, extraCount + 1);
  for (const slot of t.slots) {
    state.setExportVariantCount(slot.index, total);
    for (let v = 1; v < total; v++) {
      state.setVariantPoolOverride(slot.index, v, "A", pickMasterBiased(lenA, share));
      state.setVariantPoolOverride(slot.index, v, "B", pickMasterBiased(lenB, share));
    }
    randomizeRanges(slot.index);
  }
  // Pool weight inputs are rendered once and don't re-bind on pool-weights:
  // changed (= they're populated from state at renderParams time). Force a
  // re-render so the user sees the freshly applied weights.
  renderParams();
}

// One-shot Math.random(): variant seed is for VARIANT random, not for initial ranges.
export function randomizeRanges(slotIndex) {
  const variab = state.exportVariability;
  for (const param of VARIANT_PARAMS) {
    const dMin = -(Math.random() * variab);
    const dMax = +(Math.random() * variab);
    state.setExportRange(slotIndex, param.key, dMin, dMax);
  }
  rerenderRanges();
}

function renderRangeRow(slotIndex, param) {
  const range = state.getExportRange(slotIndex, param.key);
  // State stores signed deltas (dMin <= 0, dMax >= 0). UI uses two POSITIVE
  // 0..100 sliders (% of global variability scope); sign is implicit.
  const dMin = range ? range.dMin : 0;
  const dMax = range ? range.dMax : 0;
  const cur  = currentGlobalValue(param);
  const variab = state.exportVariability;
  const sMinVal = variab > 0 ? clamp(-dMin / variab * 100, 0, 100) : 0;
  const sMaxVal = variab > 0 ? clamp( dMax / variab * 100, 0, 100) : 0;
  const sCur = cur * 100;
  const reset = range ? "" : "disabled";
  return `
    <div class="export-range" data-param="${param.key}">
      <div class="export-range__header">
        <span class="export-range__label">${param.label}</span>
        <span class="export-range__current" title="Current global value">${formatNum(sCur)}</span>
        <button type="button" class="curve-panel__btn" data-action="reset" ${reset} title="Reset deltas to 0">↺</button>
      </div>
      <div class="export-range__row">
        <span class="export-range__tag">min</span>
        <input type="range" class="export-range__slider" data-bound="min"
               min="0" max="100" step="0.1" value="${sMinVal}">
        <span class="export-range__tag">max</span>
        <input type="range" class="export-range__slider" data-bound="max"
               min="0" max="100" step="0.1" value="${sMaxVal}">
      </div>
    </div>
  `;
}

function renderPoolWeightsBlock(key) {
  const pool = state.pool(key);
  if (pool.length < 2) {
    // Reset collapsed state so a future repopulate (clear -> add) opens the new block.
    xs.poolWeightsCollapsed.delete(key);
    return "";
  }
  const rows = pool.map((ref, i) => {
    const input = state.inputs.find((inp) => inp.id === ref.inputId);
    const tile  = input?.tiles.find((t) => t.row === ref.tileRow && t.col === ref.tileCol);
    const w = state.poolWeight(key, i);
    const tag = i === 0 ? "master" : `var ${i}`;
    const isMaster = i === 0;
    const thumb = tile
      ? `<img class="pool-weight__thumb" src="${tile.dataUrl}" alt="" title="${tag}">`
      : `<span class="pool-weight__thumb pool-weight__thumb--missing" title="${tag}">?</span>`;
    return `
      <div class="pool-weight${isMaster ? " is-master" : ""}" data-pool="${key}" data-index="${i}">
        ${thumb}
        <input class="pool-weight__value" type="number" min="0" max="1" step="0.01" value="${formatWeight(w)}">
      </div>
    `;
  }).join("");
  const collapsed = xs.poolWeightsCollapsed.has(key);
  return `
    <div class="pool-weights ${collapsed ? "is-collapsed" : ""}" data-pool="${key}">
      <div class="pool-weights__title" data-pool-weights-toggle="${key}">
        <span class="pool-weights__chevron">▾</span>
        <span class="pool-weights__name">Pool ${key} weights · 0..1</span>
        <button class="curve-panel__btn" type="button" data-action="randomize-pool-weights" title="Master-biased random: master keeps the configured Master share (Main section), variants split the remainder">🎲</button>
      </div>
      <div class="pool-weights__body">
        ${rows}
      </div>
    </div>
  `;
}

function wirePoolWeightInputs(key) {
  const poolsBody = document.getElementById("export-pools-body");
  if (!poolsBody) return;
  const rows = poolsBody.querySelectorAll(`.pool-weight[data-pool="${key}"]`);
  const randomBtn = poolsBody.querySelector(`.pool-weights[data-pool="${key}"] [data-action="randomize-pool-weights"]`);
  for (const row of rows) {
    const idx = parseInt(row.dataset.index, 10);
    const input = row.querySelector(".pool-weight__value");
    if (!input || Number.isNaN(idx)) continue;
    input.addEventListener("change", () => {
      const n = parseFloat(input.value);
      state.setPoolWeight(key, idx, Number.isFinite(n) ? n : 0);
      input.value = formatWeight(state.poolWeight(key, idx));
    });
  }
  randomBtn?.addEventListener("click", () => {
    state.randomizePoolWeights(key);
    // pool-weights:changed only redraws canvases, so push new numbers into inputs directly.
    for (const row of poolsBody.querySelectorAll(`.pool-weight[data-pool="${key}"]`)) {
      const idx = parseInt(row.dataset.index, 10);
      const input = row.querySelector(".pool-weight__value");
      if (input && !Number.isNaN(idx)) input.value = formatWeight(state.poolWeight(key, idx));
    }
  });
}

// formatNum rounds to 0.1; pool weights live in 0..1 and need 0.01 precision.
function formatWeight(w) {
  return (Math.round(w * 100) / 100).toString();
}

function wireRangeRows(slotIndex) {
  const variabBody = document.getElementById("export-variability-body");
  if (!variabBody) return;
  for (const row of variabBody.querySelectorAll(".export-range")) {
    const key = row.dataset.param;
    const minEl = row.querySelector('[data-bound="min"]');
    const maxEl = row.querySelector('[data-bound="max"]');
    const commit = () => {
      const variab = state.exportVariability;
      const sMin = parseFloat(minEl.value) || 0;
      const sMax = parseFloat(maxEl.value) || 0;
      const dLo = -(sMin / 100) * variab;
      const dHi = +(sMax / 100) * variab;
      state.setExportRange(slotIndex, key, dLo, dHi);
    };
    minEl.addEventListener("input", commit);
    maxEl.addEventListener("input", commit);
    row.querySelector('[data-action="reset"]')?.addEventListener("click", () => {
      state.clearExportRange(slotIndex, key);
      rerenderRanges();
    });
  }
}

// Rebuild row bodies only; touching the title would orphan its dice button listener.
export function rerenderRanges() {
  const idx = state.selectedSlotIndex;
  if (idx === null || idx === undefined) return;
  const slot = state.template?.slots.find((s) => s.index === idx);
  if (!slot) return;
  const variabBody = document.getElementById("export-variability-body");
  const wrap = variabBody?.querySelector(".export-ranges");
  if (!wrap) return;
  for (const el of wrap.querySelectorAll(".export-range")) el.remove();
  for (const p of VARIANT_PARAMS) {
    wrap.insertAdjacentHTML("beforeend", renderRangeRow(slot.index, p));
  }
  wireRangeRows(slot.index);
}
