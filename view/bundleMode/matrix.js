// Bundle stage = stack of entry cards (one per bundled project / reverse)
// followed by the terrain-coverage matrix. Data resolution merges live
// state for the active project with saved JSON for the rest so the
// matrix mirrors current edits without requiring a save.

import { state } from "../../controller/state.js";
import { projects as projectStorage } from "../../controller/storage.js";
import { getTemplateById } from "../../templates/index.js";
import { bundled, dom, currentActiveProjectId } from "./state.js";
import { renderCoverageMatrix } from "./coverage.js";
import { sortedEntries, buildEntryCard } from "./card.js";

export function renderMatrix() {
  const matrixEl = dom.matrixEl;
  if (!matrixEl) return;
  matrixEl.innerHTML = "";
  const entries = bundledProjects();
  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "bundle-matrix__empty";
    empty.textContent = "Pick projects from the right panel to start bundling.";
    matrixEl.append(empty);
    return;
  }
  const list = document.createElement("div");
  list.className = "bundle-list";
  for (const entry of sortedEntries(entries)) {
    list.append(buildEntryCard(entry));
  }
  matrixEl.append(list);

  const coverage = renderCoverageMatrix(entries);
  if (coverage) matrixEl.append(coverage);
}

// Walks `bundled` (in insertion order) and resolves each entry to its
// effective display data. Reads from live state if the entry is the
// currently-open project; otherwise reads the saved JSON blob. Reverse
// entries swap the effective Pool A / Pool B values (the fallback labels
// "projectName.A/B" follow the source pool too, so identity stays stable).
function bundledProjects() {
  const activeId = currentActiveProjectId();
  return bundled.map((entry) => {
    const meta = projectStorage.meta(entry.projectId);
    if (!meta) return null;
    // Always load the saved blob: bundle export reads from it (not from live
    // state), so the template-ref validity check must run against what's
    // actually persisted. Even when the project is currently active.
    const savedData      = projectStorage.load(entry.projectId);
    const savedTemplateId   = savedData?.template || null;
    const savedTemplate     = getTemplateById(savedTemplateId);
    const templateValid     = savedTemplate !== null;
    const missingTemplateId = templateValid ? null : savedTemplateId;

    let poolANameRaw = "";
    let poolBNameRaw = "";
    let poolARefs = [];
    let poolBRefs = [];
    let projectName = meta.name || "untitled";
    let template   = null;
    // templateRefId carries the raw template id used by the project so we
    // can show "(deleted)" or the raw id when getTemplateById can't resolve
    // (= user deleted that user-template since this project was saved).
    let templateRefId = null;
    let getVariantCount = () => 1;
    let includeA = false, includeB = false;
    if (entry.projectId === activeId) {
      poolANameRaw    = state.poolName("A") || "";
      poolBNameRaw    = state.poolName("B") || "";
      poolARefs       = state.pool("A");
      poolBRefs       = state.pool("B");
      projectName     = state.projectName || projectName;
      template        = state.template;
      templateRefId   = state.template?.id || null;
      getVariantCount = (idx) => state.getExportVariantCount(idx);
      includeA        = state.exportIncludeSourceA;
      includeB        = state.exportIncludeSourceB;
    } else {
      const data = savedData;
      poolANameRaw   = String(data?.poolNames?.A ?? "").trim();
      poolBNameRaw   = String(data?.poolNames?.B ?? "").trim();
      poolARefs      = Array.isArray(data?.pools?.A) ? data.pools.A : [];
      poolBRefs      = Array.isArray(data?.pools?.B) ? data.pools.B : [];
      projectName    = data?.projectName || projectName;
      template       = savedTemplate;
      templateRefId  = savedTemplateId;
      const cfg      = (data?.exportConfig && typeof data.exportConfig === "object") ? data.exportConfig : {};
      getVariantCount = (idx) => Math.max(1, Number(cfg[idx]?.variantCount) || 1);
      includeA       = !!data?.exportIncludeSourceA;
      includeB       = !!data?.exportIncludeSourceB;
    }
    const origA = {
      ...effectiveTerrain(poolANameRaw, projectName, "A"),
      thumbUrl: resolveMasterThumb(poolARefs),
    };
    const origB = {
      ...effectiveTerrain(poolBNameRaw, projectName, "B"),
      thumbUrl: resolveMasterThumb(poolBRefs),
    };
    // Reverse swaps the effective values (already with stable fallback ids)
    // between A and B columns so each terrain identity survives the flip.
    const poolA = entry.reversed ? origB : origA;
    const poolB = entry.reversed ? origA : origB;
    const layout = describeLayout(template);
    const slotCount = template?.slots?.length || 0;
    let variantTotal = 0;
    for (const slot of (template?.slots || [])) {
      variantTotal += getVariantCount(slot.index);
    }
    const templateName = template?.name || templateRefId || "—";
    return {
      projectId: entry.projectId,
      reversed:  entry.reversed,
      meta, projectName, poolA, poolB,
      layout, templateName, slotCount, variantTotal, includeA, includeB,
      templateValid, missingTemplateId,
    };
  }).filter(Boolean);
}

// Pre-flight check for bundle export. Returns the list of entries whose
// saved blob references a template id that no longer resolves (= user
// deleted that user-template). The caller (exportRunner) blocks export
// when this is non-empty so we never produce a bundle that would render
// with a silent fallback template — see [bundle template validation].
export function findInvalidEntries() {
  const out = [];
  for (const entry of bundled) {
    const data = projectStorage.load(entry.projectId);
    if (!data) continue;
    if (getTemplateById(data.template) !== null) continue;
    const meta = projectStorage.meta(entry.projectId);
    out.push({
      projectId:         entry.projectId,
      projectName:       data.projectName || meta?.name || "untitled",
      reversed:          !!entry.reversed,
      missingTemplateId: data.template || null,
    });
  }
  return out;
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
// isn't present (e.g. legacy project referencing a deleted hash).
function resolveMasterThumb(refs) {
  const master = refs?.[0];
  if (!master) return null;
  const input = state.inputs.find((i) => i.id === master.inputId);
  if (!input) return null;
  const tile = input.tiles?.find((t) => t.row === master.tileRow && t.col === master.tileCol);
  return tile?.dataUrl || null;
}

function effectiveTerrain(raw, projectName, poolKey) {
  if (raw) return { effective: raw, fallback: false };
  return { effective: `${projectName}.${poolKey}`, fallback: true };
}
