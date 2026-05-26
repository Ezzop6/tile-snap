// Self-contained project JSON support.
//
// A "bundle" is an extra `bundle` field appended to the regular serialize()
// output before download:
//   bundle.inputs   — every input referenced by pool refs, with its dataURL
//                     so the importer can rehydrate without needing access
//                     to this browser's localStorage.
//   bundle.template — the full template definition, but ONLY for user
//                     templates (builtin templates live in code on every
//                     install, so the id alone is enough).
//
// Save-to-localStorage uses the lean serialize() output; only Export JSON
// produces a bundle. Importing a JSON that doesn't carry a bundle falls
// back to ref-only behaviour (pool refs may go unresolved if the importing
// browser doesn't have the same input ids).

import { state } from "./state.js";
import {
  images,
  inputsLibrary,
  templates as templateStorage,
} from "./storage.js";
import {
  isBuiltinTemplate,
  getTemplateById,
  saveUserTemplate,
  findFreeTemplateName,
} from "../templates/index.js";

// Collects unique inputIds referenced by pool refs in a project blob.
function collectReferencedInputIds(data) {
  const ids = new Set();
  for (const key of ["A", "B"]) {
    const refs = Array.isArray(data?.pools?.[key]) ? data.pools[key] : [];
    for (const r of refs) if (r?.inputId) ids.add(r.inputId);
  }
  // Variant overrides may pull from extra refs that aren't in the master pool.
  const vpo = data?.variantPoolOverride;
  if (vpo && typeof vpo === "object") {
    for (const perSlot of Object.values(vpo)) {
      if (!perSlot || typeof perSlot !== "object") continue;
      // Variant override values are indices into pools, not inputId refs,
      // so nothing to harvest here — pool refs already cover the source set.
    }
  }
  return ids;
}

// Builds the bundle for an ACTIVE project — reads inputs from state._inputs
// (so dataURL comes from the in-memory canvas, no storage lookup needed).
export function bundleFromCurrentState() {
  const data = state.serialize();
  const ids = collectReferencedInputIds(data);
  const inputs = [];
  for (const inp of state.inputs) {
    if (!ids.has(inp.id)) continue;
    const dataURL = images.get(inp.hash);
    if (!dataURL) continue; // image binary missing — skip silently
    inputs.push({
      id: inp.id, name: inp.name, tileSize: inp.tileSize,
      hash: inp.hash, dataURL,
    });
  }
  const template = embeddableTemplate(data?.template);
  const bundle = { inputs };
  if (template) bundle.template = template;
  return bundle;
}

// Builds the bundle for a SAVED project blob (e.g. per-row Export JSON of a
// non-active project). Same shape as bundleFromCurrentState, but sources
// metadata from inputsLibrary + image bytes from images storage.
export function bundleFromSavedData(data) {
  const ids = collectReferencedInputIds(data);
  const inputs = [];
  for (const id of ids) {
    const meta = inputsLibrary.get(id);
    if (!meta) continue;
    const dataURL = images.get(meta.hash);
    if (!dataURL) continue;
    inputs.push({
      id: meta.id, name: meta.name, tileSize: meta.tileSize,
      hash: meta.hash, dataURL,
    });
  }
  const template = embeddableTemplate(data?.template);
  const bundle = { inputs };
  if (template) bundle.template = template;
  return bundle;
}

// Returns the full user-template object suitable for embedding, or null when
// the template is built-in / unknown. We embed exactly what
// templateStorage.save would have written, so import can replay the storage
// write verbatim.
function embeddableTemplate(templateId) {
  if (!templateId || isBuiltinTemplate(templateId)) return null;
  const meta = templateStorage.meta?.(templateId);
  const data = templateStorage.load(templateId);
  if (!data) return null;
  return {
    id:   templateId,
    name: meta?.name || data.name || templateId,
    data,
  };
}

// Assembles the full self-contained payload for an EXPORT — `serialize()`
// output (project state, version) + `bundle` (inputs with dataURL + user
// template object if any). Used by Export-mode JSON + ZIP exporters, the
// project modal's per-row JSON download, and anything else that needs the
// portable shape. Single source of truth for "what's in an exported project
// JSON".
export function buildProjectExportPayload() {
  return { ...state.serialize(), bundle: bundleFromCurrentState() };
}

// Variant for non-active projects: reads from a saved storage blob instead
// of live state. The blob lacks the live `bundle` field (localStorage entries
// are lean), so we assemble it from inputsLibrary + image storage.
export function buildProjectExportPayloadForSaved(data) {
  if (!data) return null;
  return { ...data, bundle: bundleFromSavedData(data) };
}

// Import side. Mutates obj: registers bundled inputs into global storage,
// saves embedded user template if absent, remaps pool refs / obj.template
// when ids collide with EXISTING entries that have different content.
// Returns the same obj (sans `bundle`) ready for state.deserialize.
export async function hydrateBundle(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const bundle = obj.bundle;
  if (!bundle || typeof bundle !== "object") return obj;

  // Inputs: build a remap inputId → newId. Default = same id.
  const inputRemap = new Map();
  if (Array.isArray(bundle.inputs)) {
    for (const inp of bundle.inputs) {
      if (!inp?.id || !inp?.hash || !inp?.dataURL) continue;
      // Image bytes are content-addressed — collisions on hash are real
      // collisions (same content), so put() is a no-op when bytes match.
      try {
        images.put(inp.hash, inp.dataURL);
      } catch (err) {
        console.warn(`[bundle] image put failed for hash ${inp.hash}:`, err);
      }
      const existing = inputsLibrary.get(inp.id);
      if (!existing) {
        // Free id — register the entry directly.
        inputsLibrary.put({
          id: inp.id, name: inp.name, tileSize: inp.tileSize, hash: inp.hash,
        });
      } else if (existing.hash === inp.hash) {
        // Same id, same content — already registered.
      } else {
        // Collision: same id, different content. Generate a new id and remap
        // pool refs so the imported project points to the new entry.
        const newId = freeInputId(inp.id);
        inputsLibrary.put({
          id: newId, name: inp.name, tileSize: inp.tileSize, hash: inp.hash,
        });
        inputRemap.set(inp.id, newId);
      }
    }
    // Hydrate freshly-registered library entries into state._inputs so the
    // deserialize about to follow can resolve pool refs immediately.
    await state.loadInputsLibrary();
  }

  // Template: if user template, save unless already present.
  if (bundle.template && typeof bundle.template === "object") {
    const t = bundle.template;
    if (t.id && t.data && !isBuiltinTemplate(t.id)) {
      const existing = templateStorage.load(t.id);
      if (!existing) {
        // Opaque id is kept (obj.template references it); only the display
        // name is bumped if it collides, so template names stay unique.
        const name = findFreeTemplateName(t.name || t.id);
        templateStorage.save(t.id, t.data, name);
      }
      // If existing, user's version wins; obj.template stays pointing at the
      // existing id and that's the right behaviour.
    }
  }

  // Apply input id remap to pool refs in the obj copy.
  if (inputRemap.size > 0) remapPoolInputIds(obj, inputRemap);

  // Strip the bundle field so deserialize sees just the regular project blob.
  const { bundle: _drop, ...rest } = obj;
  return rest;
}

// Returns an id that isn't in inputsLibrary. Tries `${base}-N` with smallest
// free N≥2, so a re-import of the same file generates predictable ids.
function freeInputId(base) {
  const taken = new Set(inputsLibrary.list().map((i) => i.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function remapPoolInputIds(obj, remap) {
  for (const key of ["A", "B"]) {
    const refs = obj?.pools?.[key];
    if (!Array.isArray(refs)) continue;
    for (const r of refs) {
      if (r?.inputId && remap.has(r.inputId)) r.inputId = remap.get(r.inputId);
    }
  }
}
