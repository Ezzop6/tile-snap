import { VERSION } from "../config.js";
import { wangEdges16 } from "./wang-edges-16.js";
import { blob47 } from "./blob-47.js";
import { dualGrid } from "./dual-grid.js";
import { templates as templateStorage } from "../controller/storage.js";
import { firstFreeName } from "../core/freeName.js";

// Fraction of cellSize each bridge vertex is pre-shifted toward its empty
// corner before cornerSoften / inflate. 0.25 = legacy dual default.
export const DEFAULT_SADDLE_BRIDGE_OFFSET = 0.25;

function clamp01(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

export const TERRAIN_MODES = ["corners-and-sides", "corners", "sides"];
export const DEFAULT_TERRAIN_MODE = "corners-and-sides";

function normalize(template, source) {
  const card = [4, 8, 16, 32].includes(Number(template.triangleCardinals))
    ? Number(template.triangleCardinals)
    : 4;
  // Default by PATTERN parity (slot[0].array dims, NOT template.rows/cols).
  // Even = dual-grid (connect), odd = classic grid (split).
  const sampleArr  = template.slots?.[0]?.array;
  const patternR   = sampleArr?.length ?? 3;
  const patternC   = sampleArr?.[0]?.length ?? 3;
  const connectedSaddle = ("connectedSaddle" in template)
    ? template.connectedSaddle === true
    : (patternR % 2 === 0 || patternC % 2 === 0);
  // gridKind orthogonal to connectedSaddle (structural property: slot-edge semantics, lock rules).
  const gridKind = template.gridKind === "dual"
    ? "dual"
    : (("gridKind" in template) ? "single"
       : ((patternR % 2 === 0 || patternC % 2 === 0) ? "dual" : "single"));
  const saddleBridgeOffset = clamp01(template.saddleBridgeOffset, DEFAULT_SADDLE_BRIDGE_OFFSET);
  const terrainMode = TERRAIN_MODES.includes(template.terrainMode)
    ? template.terrainMode
    : DEFAULT_TERRAIN_MODE;
  return {
    ...template,
    source,
    cellShape: template.cellShape === "triangle" ? "triangle" : "square",
    triangleCardinals: card,
    gridKind,
    connectedSaddle,
    saddleBridgeOffset,
    terrainMode,
    slots: template.slots.map((slot) => ({
      ...slot,
      index: slot.row * template.cols + slot.col,
    })),
  };
}

const BUILTIN = [
  normalize(wangEdges16, "builtin"),
  normalize(blob47, "builtin"),
  normalize(dualGrid, "builtin"),
];

export const templateRegistry = new EventTarget();

export const builtinTemplates = BUILTIN;

export const defaultTemplate = BUILTIN[0];

export function listTemplates() {
  const userMetas = templateStorage.list();
  const userTemplates = [];
  for (const meta of userMetas) {
    const data = templateStorage.load(meta.id);
    if (data)
      userTemplates.push(
        normalize({ ...data, id: meta.id, name: meta.name }, "user"),
      );
  }
  return [...BUILTIN, ...userTemplates];
}

export function getTemplateById(id) {
  if (!id) return null;
  const builtin = BUILTIN.find((t) => t.id === id);
  if (builtin) return builtin;
  const meta = templateStorage.meta?.(id);
  const data = templateStorage.load(id);
  if (!data) return null;
  return normalize(
    { ...data, id, name: meta?.name || data.name || id },
    "user",
  );
}

// Built-in ids are reserved and rejected. Same id = update in place.
export function saveUserTemplate(template) {
  if (!template || !template.id || !template.name) return null;
  if (BUILTIN.some((t) => t.id === template.id)) {
    throw new Error(`Cannot overwrite built-in template "${template.id}"`);
  }
  // Strip derived `index` field; re-derived on load by normalize.
  const slots = (template.slots || []).map((s) => cloneSlot(s));
  const card = [4, 8, 16, 32].includes(Number(template.triangleCardinals))
    ? Number(template.triangleCardinals)
    : 4;
  const sampleArr  = template.slots?.[0]?.array;
  const patternR   = sampleArr?.length ?? 3;
  const patternC   = sampleArr?.[0]?.length ?? 3;
  const connectedSaddle = ("connectedSaddle" in template)
    ? template.connectedSaddle === true
    : (patternR % 2 === 0 || patternC % 2 === 0);
  const gridKind = template.gridKind === "dual"
    ? "dual"
    : (("gridKind" in template) ? "single"
       : ((patternR % 2 === 0 || patternC % 2 === 0) ? "dual" : "single"));
  const saddleBridgeOffset = clamp01(template.saddleBridgeOffset, DEFAULT_SADDLE_BRIDGE_OFFSET);
  const terrainMode = TERRAIN_MODES.includes(template.terrainMode)
    ? template.terrainMode
    : DEFAULT_TERRAIN_MODE;
  const data = {
    version: VERSION,
    name: template.name,
    cols: template.cols,
    rows: template.rows,
    cellShape: template.cellShape === "triangle" ? "triangle" : "square",
    triangleCardinals: card,
    gridKind,
    connectedSaddle,
    saddleBridgeOffset,
    terrainMode,
    slots,
  };
  // Opaque id: present + in storage = update in place (saving edits to a
  // loaded template); present + new = create. With name-independent ids a new
  // template's id can never accidentally equal another's, so save is safe.
  templateStorage.save(template.id, data, template.name);
  templateRegistry.dispatchEvent(
    new CustomEvent("changed", { detail: template.id }),
  );
  return template.id;
}

// Single source of truth for slot serialization. Used by:
//   - saveUserTemplate (storage write)
//   - cloneTemplateAsUser (builtin → editable copy)
//   - snapshotTemplate in view/templateCreator.js (Save + Export JSON)
//   - importTemplateFromObject in view/templateCreator.js (Import JSON)
// Adding a new persistent TEMPLATE-LEVEL slot field → add it here.
// Project-level modifiers (tileOffsets, cutBowOverrides, slotCutTransform,
// pool overrides, exportConfig) live on state.* keyed by slot.index and
// are NEVER stored on the slot itself — the template is read-only outside
// Template mode.
// opts.withIndex + opts.cols: emits derived index for in-memory consumers.
// Storage path omits index — re-derived by normalize() on load.
export function cloneSlot(slot, opts = {}) {
  if (!slot) return null;
  const out = {
    col: slot.col,
    row: slot.row,
    array: slot.array.map((r) => r.map(cloneCell)),
  };
  if (opts.withIndex) {
    out.index = slot.row * (opts.cols || 0) + slot.col;
  }
  return out;
}

function cloneCell(v) {
  return Array.isArray(v) ? v.slice() : v;
}

export function deleteUserTemplate(id) {
  if (BUILTIN.some((t) => t.id === id)) {
    throw new Error(`Cannot delete built-in template "${id}"`);
  }
  templateStorage.delete(id);
  templateRegistry.dispatchEvent(new CustomEvent("changed", { detail: id }));
}

export function isBuiltinTemplate(id) {
  return BUILTIN.some((t) => t.id === id);
}

function slugify(s) {
  return String(s || "untitled")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "untitled";
}

// Slug of a name — used ONLY for human-friendly export filenames now.
// Storage ids are opaque (newTemplateId), never derived from the name, so a
// rename can never collide with or overwrite another template.
export function templateIdFromName(name) {
  return slugify(name);
}

// Opaque, name-independent id for a new template (clone / import / duplicate).
// Same scheme as projects (genId) — see controller/storage.js#templates.newId.
export function newTemplateId() {
  return templateStorage.newId();
}

// Returns baseName if no other template (builtin or user) uses that DISPLAY
// name, otherwise `${baseName} (N)` with smallest free N≥2. Names are the only
// thing users compare templates by (ids are opaque + name-independent), so we
// keep them unique. opts.excludeId skips one stored template (rename of
// itself); opts.alsoTaken reserves extra names (a duplicate must differ from
// its source even when the source isn't persisted yet).
export function findFreeTemplateName(baseName, { excludeId, alsoTaken } = {}) {
  const taken = new Set(alsoTaken || []);
  for (const t of BUILTIN) taken.add(t.name);
  for (const m of templateStorage.list()) {
    if (excludeId && m.id === excludeId) continue;
    taken.add(m.name);
  }
  return firstFreeName(baseName, taken);
}

// In-memory clone of a built-in template marked as 'unsaved' user template.
// Opaque id (name-independent); storage write happens on explicit Save.
export function cloneTemplateAsUser(template) {
  if (!template) return null;
  const slots = (template.slots || []).map((s) =>
    cloneSlot(s, { withIndex: true, cols: template.cols }));
  const name = findFreeTemplateName(template.name || "template");
  const id   = templateStorage.newId();
  return {
    id,
    name,
    cols: template.cols,
    rows: template.rows,
    cellShape: template.cellShape === "triangle" ? "triangle" : "square",
    triangleCardinals: template.triangleCardinals,
    gridKind: template.gridKind === "dual" ? "dual" : "single",
    connectedSaddle: template.connectedSaddle === true,
    saddleBridgeOffset: clamp01(template.saddleBridgeOffset, DEFAULT_SADDLE_BRIDGE_OFFSET),
    terrainMode: TERRAIN_MODES.includes(template.terrainMode)
      ? template.terrainMode : DEFAULT_TERRAIN_MODE,
    slots,
    source: "unsaved",
  };
}
