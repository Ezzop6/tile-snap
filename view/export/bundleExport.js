// Combined Godot TileSet export: takes N saved projects, renders each
// project's atlas PNG, builds a single .tres that wires them all under
// one shared terrain_set, then packs the result as a ZIP.
//
// Per-project rendering reuses the live state singleton: we snapshot the
// current state.serialize() output, deserialize each bundled project into
// state in turn, run buildExportCanvas / enumerateAtlasTiles, then
// restore the original snapshot. Other views' refresh listeners fire
// during the swap but they're invisible in Bundle mode.

import { state } from "../../controller/state.js";
import { projects as projectStorage } from "../../controller/storage.js";
import { VERSION } from "../../config.js";
import { buildExportCanvas } from "./png.js";
import {
  enumerateAtlasTiles,
  emitSourceBundleWithIds,
  resolveTerrainMode,
  describeTerrain,
  TERRAIN_MODE_MAP,
} from "./tresBuilder.js";
import { buildProjectExportPayloadForSaved } from "../../controller/exportBundle.js";
import { normalizeAtlasPrefix } from "../../controller/state/bundlePath.js";

// Build the per-project Pool A / Pool B terrain-name pair using the same
// "name or projectName.<key>" fallback the bundle matrix uses. Trimmed.
function effectiveTerrainName(rawName, projectName, poolKey) {
  const v = String(rawName ?? "").trim();
  return v || `${projectName}.${poolKey}`;
}

// Master tile's centre-pixel inverse colour, falling back to a fixed grey.
// State is assumed to already be deserialized to the project we're describing.
function describeTerrainColor(poolKey) {
  const desc = describeTerrain(poolKey, 0);
  return desc.color;
}

// Re-renders the current state's atlas to a PNG blob using the existing
// export pipeline. Returns { blob, slotSize, layout, slotsWithVariants,
// sourceLayout, template } — everything the tres builder needs.
async function renderActiveAtlas() {
  const built = await buildExportCanvas();
  if (!built) return null;
  const blob = await new Promise((resolve) =>
    built.canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) return null;
  return { ...built, blob };
}

// Emits one atlas's tile rows with terrain IDs remapped from the per-project
// 0/1 (Pool A / B) to the bundle-wide global IDs. `terrainIds` is
// { A: <global>, B: <global> }.
function emitAtlasTiles(lines, tiles, terrainIds, terrainModeStr) {
  const skipSlotTerrain = terrainModeStr === "corners";
  for (const tile of tiles) {
    const prefix = `${tile.col}:${tile.row}/${tile.altId}`;
    lines.push(`${prefix} = 0`);
    if (skipSlotTerrain || tile.fallback) continue;
    const bodyTerrain = tile.body ? terrainIds.A : terrainIds.B;
    lines.push(`${prefix}/terrain_set = 0`);
    lines.push(`${prefix}/terrain = ${bodyTerrain}`);
    if (tile.probability !== 1.0) {
      lines.push(`${prefix}/probability = ${tile.probability.toFixed(2)}`);
    }
    for (const [bit, localId] of Object.entries(tile.bits)) {
      const globalId = localId === 0 ? terrainIds.A : terrainIds.B;
      lines.push(`${prefix}/terrains_peering_bit/${bit} = ${globalId}`);
    }
  }
}

// Sanitize filename component — strip path separators + control chars.
function sanitizeFilename(s) {
  return String(s || "").trim().replace(/[\\/:*?"<>|]+/g, "_") || "untitled";
}

// Build the unique-by-name terrain registry from each project's pool names.
// First occurrence wins for color (we don't ask the user to deconflict —
// terrain names ARE the identity, color is derived from whoever defines
// the terrain first).
function buildTerrainRegistry(projectInfos) {
  const byName = new Map(); // name → { id, color }
  let nextId = 0;
  for (const info of projectInfos) {
    for (const key of ["A", "B"]) {
      const name = info.terrains[key].name;
      if (!byName.has(name)) {
        byName.set(name, { id: nextId++, color: info.terrains[key].color });
      }
    }
  }
  return byName;
}

// Main orchestrator. `entries` = ordered list of { projectId, reversed }
// selected in bundle UI. `reversed: true` swaps pools A↔B (via state
// .swapPools()) before rendering so the same source project contributes
// a second atlas with inverted terrain semantics. `bundleName` = base
// filename for the .tres + ZIP. Optional `signal` (AbortSignal) lets the
// caller cancel between projects; `onProgress({ index, total, projectName })`
// is invoked before each project starts rendering. Returns { zip, filename }.
export async function buildBundleZip({ entries, bundleName, atlasPathPrefix, signal, onProgress }) {
  if (!window.JSZip) throw new Error("JSZip not loaded");
  if (!entries || entries.length === 0) {
    throw new Error("Bundle is empty");
  }
  const checkAbort = () => {
    if (signal?.aborted) throw new DOMException("Bundle export aborted", "AbortError");
  };
  const pathPrefix = normalizeAtlasPrefix(atlasPathPrefix);

  // state.serialize captures the template by id only; an unsaved builtin
  // clone won't roundtrip. Hold the live ref so we can force-restore even
  // when getTemplateById can't find the clone's id.
  const snapshot = state.serialize();
  const originalTemplateRef = state.template;

  const projectInfos = [];
  // Track forward (non-reversed) projects so we can emit one .tilesetproj.json
  // per source project — reversed entries are virtual and share the source
  // project's JSON; emitting twice would just bloat the ZIP.
  const forwardJsonProjects = new Map(); // projectId → { name, savedData }
  // Track filename collisions — two entries for the same project (forward
  // + reverse) need distinct PNG filenames inside the ZIP.
  const usedFilenames = new Set();
  const uniqueFilename = (base) => {
    let n = base;
    let i = 2;
    while (usedFilenames.has(n)) n = `${base.replace(/\.png$/, "")}_${i++}.png`;
    usedFilenames.add(n);
    return n;
  };

  try {
    for (let i = 0; i < entries.length; i++) {
      checkAbort();
      const { projectId, reversed } = entries[i];
      const data = projectStorage.load(projectId);
      if (!data) continue;
      const meta = projectStorage.meta(projectId);
      const projectName = data.projectName || meta?.name || "untitled";
      // Capture saved-blob snapshot ONCE per source project (forward only).
      // Reversed is a virtual variant of the same project — same JSON.
      if (!reversed && !forwardJsonProjects.has(projectId)) {
        forwardJsonProjects.set(projectId, { name: projectName, savedData: data });
      }
      onProgress?.({ index: i, total: entries.length, projectName });
      // Yield to the browser so the progress overlay can paint between
      // the heavy synchronous renders that follow.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await state.deserialize(data);

      // Reverse: pools A↔B swap (entries, weights, names, all overrides)
      // is exactly what state.swapPools does — same operation users can
      // run on a live project via the ⇄ button in Sources.
      if (reversed) state.swapPools();

      // Bundle-wide overrides: forced globalCurve values so every atlas
      // in the bundle shares the same look (outline width / colour,
      // future params). Applied after deserialize so the project's own
      // values are loaded first, then overwritten where override is on.
      applyBundleOverrides();

      const built = await renderActiveAtlas();
      if (!built) continue;

      const terrainModeStr = resolveTerrainMode(state.template);
      const tiles = enumerateAtlasTiles(
        state.template,
        built.slotsWithVariants,
        built.layout,
        terrainModeStr,
      );
      const baseFile = `${sanitizeFilename(projectName)}${reversed ? "_reversed" : ""}.png`;
      const atlasFile = uniqueFilename(baseFile);
      // Fallback id tracks the SOURCE pool letter (not the destination
      // position). After a swap, pool A position holds original pool B
      // content, so its fallback id "projectName.B" matches what the
      // matrix shows + keeps terrain identity stable across forward / reverse.
      const aFallbackLetter = reversed ? "B" : "A";
      const bFallbackLetter = reversed ? "A" : "B";
      projectInfos.push({
        projectName,
        reversed,
        atlasFile,
        slotSize: built.slotSize,
        terrainModeStr,
        tiles,
        // Source bundle rows (= raw pool A/B tiles appended below the
        // atlas grid) are also part of the PNG when the project has them
        // enabled; carry the layout so the .tres can emit their terrain
        // assignments under the bundle's shared terrain_set.
        sourceLayout: built.sourceLayout || null,
        template:     state.template,
        blob: built.blob,
        terrains: {
          A: {
            name:  effectiveTerrainName(state.poolName("A"), projectName, aFallbackLetter),
            color: describeTerrainColor("A"),
          },
          B: {
            name:  effectiveTerrainName(state.poolName("B"), projectName, bFallbackLetter),
            color: describeTerrainColor("B"),
          },
        },
      });
    }
  } finally {
    // Always restore the user's open project, even if a render threw.
    await state.deserialize(snapshot);
    if (originalTemplateRef && state.template !== originalTemplateRef) {
      state.replaceTemplate(originalTemplateRef);
    }
  }

  if (projectInfos.length === 0) throw new Error("No bundled projects produced output");

  // Pick the most-common terrain mode across projects (= the .tres only has
  // one terrain_set; mismatched projects' bits get emitted under the same
  // mode so a "sides" project's tiles inside a "corners-and-sides" bundle
  // still emit but the irrelevant bits stay zero).
  const terrainModeStr = pickMajorityMode(projectInfos);

  const registry = buildTerrainRegistry(projectInfos);

  // Assemble combined .tres
  const lines = [];
  lines.push(`[gd_resource type="TileSet" load_steps=${projectInfos.length + 1} format=3]`);
  lines.push("");

  // ext_resources — one per atlas PNG, ids start at 1. atlasPathPrefix
  // (normalised to end with `/` when non-empty) is prepended so the .tres
  // resolves to wherever the user drops the ZIP inside their Godot project
  // (defaults to `res://` root when prefix is empty).
  projectInfos.forEach((info, idx) => {
    const resourceId = `tex_${idx + 1}`;
    info.extResourceId = resourceId;
    lines.push(`[ext_resource type="Texture2D" path="${pathPrefix}${info.atlasFile}" id="${resourceId}"]`);
  });
  lines.push("");

  // Per-project atlas sub_resource blocks.
  projectInfos.forEach((info, idx) => {
    const atlasId = `atlas_${idx + 1}`;
    info.atlasId = atlasId;
    lines.push(`[sub_resource type="TileSetAtlasSource" id="${atlasId}"]`);
    lines.push(`texture = ExtResource("${info.extResourceId}")`);
    lines.push(`texture_region_size = Vector2i(${info.slotSize}, ${info.slotSize})`);
    // Sort for stable output.
    info.tiles.sort((a, b) => (a.col - b.col) || (a.row - b.row) || (a.altId - b.altId));
    const terrainIds = {
      A: registry.get(info.terrains.A.name)?.id ?? 0,
      B: registry.get(info.terrains.B.name)?.id ?? 1,
    };
    emitAtlasTiles(lines, info.tiles, terrainIds, info.terrainModeStr);
    if (info.sourceLayout?.entries?.length) {
      emitSourceBundleWithIds(lines, info.sourceLayout, info.terrainModeStr, terrainIds, info.template);
    }
    lines.push("");
  });

  // [resource] block: tile_size from the first project (Godot requires one
  // shared tile_size across atlases; mismatched projects scale visually but
  // their grid math still works as long as tile_size is reasonable).
  const slotSize = projectInfos[0].slotSize;
  lines.push(`[resource]`);
  lines.push(`tile_size = Vector2i(${slotSize}, ${slotSize})`);
  lines.push(`terrain_set_0/mode = ${TERRAIN_MODE_MAP[terrainModeStr]}`);
  // Terrains in registry insertion order (= first-seen wins for color too).
  for (const [name, entry] of registry) {
    lines.push(`terrain_set_0/terrain_${entry.id}/name = "${name}"`);
    lines.push(`terrain_set_0/terrain_${entry.id}/color = ${entry.color}`);
  }
  projectInfos.forEach((info, idx) => {
    lines.push(`sources/${idx} = SubResource("${info.atlasId}")`);
  });
  lines.push("");

  // Build the ZIP. JSZip is a UMD global pulled from index.html.
  const zip = new window.JSZip();
  const safeName = sanitizeFilename(bundleName) || "bundle";
  const tresName = `${safeName}.tres`;
  zip.file(tresName, lines.join("\n"));
  for (const info of projectInfos) {
    zip.file(info.atlasFile, info.blob);
  }

  // Per-source-project self-contained JSON (forward entries only —
  // see forwardJsonProjects population above). Lets the user re-import
  // every source project on another machine via drag-drop or the modal
  // Import button without needing the original localStorage.
  // Names disambiguated only on hash collision (different projects with
  // identical sanitised names) — appends -2 / -3 / ….
  const usedJsonNames = new Set();
  const uniqueJsonName = (base) => {
    let n = `${base}.tilesetproj.json`;
    let i = 2;
    while (usedJsonNames.has(n)) n = `${base}-${i++}.tilesetproj.json`;
    usedJsonNames.add(n);
    return n;
  };
  for (const { name, savedData } of forwardJsonProjects.values()) {
    const payload = buildProjectExportPayloadForSaved(savedData);
    if (!payload) continue;
    const fname = uniqueJsonName(sanitizeFilename(name));
    zip.file(fname, JSON.stringify(payload, null, 2));
  }

  // Manifest: tool version + applied overrides + path prefix + ordered
  // entries. Captures the "as-exported" config separately from the
  // per-project JSONs (which reflect saved snapshots — the user wanted
  // those untouched). Reproducibility: future tool can read manifest +
  // re-create the bundle by importing each JSON and re-applying settings.
  const manifest = {
    version:         VERSION,
    exportedAt:      new Date().toISOString(),
    bundleName:      safeName,
    atlasPathPrefix: pathPrefix,
    appliedOverrides: serializeAppliedOverrides(),
    entries: entries.map((e) => ({
      projectId:   e.projectId,
      projectName: projectStorage.meta(e.projectId)?.name || "untitled",
      reversed:    !!e.reversed,
    })),
  };
  zip.file("bundle.manifest.json", JSON.stringify(manifest, null, 2));

  return { zip, filename: `${safeName}.zip` };
}

// Snapshot of bundleOverrides as they're applied at export time (enabled +
// value per key). Mirrors state.serializeBundleOverrides() but always called
// AFTER the export-time mutations so the manifest captures what actually
// went into the atlases.
function serializeAppliedOverrides() {
  if (typeof state.serializeBundleOverrides === "function") {
    return state.serializeBundleOverrides();
  }
  return {};
}

// Iterates state.bundleOverrides; for each enabled entry, writes its
// value onto state.globalCurve via the normal setter so render listeners
// fire. No-op when no overrides are enabled.
function applyBundleOverrides() {
  const overrides = state.bundleOverrides;
  if (!overrides) return;
  for (const [key, ov] of Object.entries(overrides)) {
    if (!ov?.enabled) continue;
    state.setGlobalCurveParam(key, ov.value);
  }
}

function pickMajorityMode(infos) {
  const counts = new Map();
  for (const info of infos) {
    counts.set(info.terrainModeStr, (counts.get(info.terrainModeStr) || 0) + 1);
  }
  let best = "corners-and-sides";
  let bestN = -1;
  for (const [mode, n] of counts) {
    if (n > bestN) { best = mode; bestN = n; }
  }
  return best;
}
