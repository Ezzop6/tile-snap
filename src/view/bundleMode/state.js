// Shared module state for the Bundle mode submodules. The bundle list
// + DOM refs + render dispatcher live here so render functions can call
// each other without import cycles — index.js wires the dispatcher to
// the concrete renders on init.

import { settings, projects as projectStorage } from "../../controller/storage.js";
import { getMode } from "../modeTabs.js";
import { getLastProjectId } from "../../controller/settings.js";

// `reversed: true` clones a project at export time with pools A ↔ B
// swapped (same atlas geometry, inverted body/terrain semantics) so the
// user gets a bidirectional tileset without authoring a second project.
//
// Persisted as `bundleSelection` in the settings namespace. Entries for
// deleted projects are pruned on project:deleted or on hydration when
// projectStorage can't resolve the id anymore.
const BUNDLE_SELECTION_KEY = "bundleSelection";

export const bundled = [];

// Bundle mode DOM refs. index.js populates these on init; submodules read
// them at render time. Single object kept by reference so submodules
// import once and see updates live.
export const dom = {
  matrixEl:    null,
  listEl:      null,
  nameInput:   null,
  pathInput:   null,
  overridesEl: null,
};

// Set while buildBundleZip is running. Suppresses our own rerender
// listeners so the matrix doesn't flicker as state.deserialize fires
// template:changed / pools:changed / etc. per bundled project.
let exporting = false;
export const isExporting = () => exporting;
export function setExporting(b) { exporting = !!b; }

export function isActive() { return getMode() === "bundle"; }

// state.template doesn't carry the source project's id directly; the
// lastProjectId setting tracks "what's open now" (projectBar maintains it
// on save / load / new project). Read through the settings helper so any
// future storage change is one swap point.
export function currentActiveProjectId() { return getLastProjectId(); }

export function bundledIndex(projectId, reversed) {
  return bundled.findIndex((e) => e.projectId === projectId && e.reversed === reversed);
}
export function isInBundle(projectId, reversed) {
  return bundledIndex(projectId, reversed) >= 0;
}
export function projectInBundle(projectId) {
  return bundled.some((e) => e.projectId === projectId);
}

export function persistBundle() {
  settings.set(BUNDLE_SELECTION_KEY, bundled.map((e) => ({
    projectId: e.projectId, reversed: !!e.reversed,
  })));
}

export function hydrateBundleFromSettings() {
  const saved = settings.get(BUNDLE_SELECTION_KEY);
  if (!Array.isArray(saved)) return;
  const valid = new Set(projectStorage.list().map((p) => p.id));
  for (const entry of saved) {
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.projectId !== "string") continue;
    if (!valid.has(entry.projectId)) continue; // skip stale refs
    bundled.push({ projectId: entry.projectId, reversed: !!entry.reversed });
  }
}

// Dispatcher: action handlers (project list checkbox, card × button,
// export catch-up) call renderAll() without knowing whether project list
// or matrix lives where. index.js sets the concrete impl on boot.
let renderAllImpl = () => {};
export function setRenderAll(fn) { renderAllImpl = fn; }
export function renderAll() { renderAllImpl(); }
