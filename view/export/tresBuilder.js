// Builds the Godot 4 TileSet .tres file content.
// Output is a plain string (Godot uses a simple INI-like resource format).
// No UIDs — the user said they don't want them; Godot re-derives them on import.
//
// Atlas layout MUST match the PNG cell grid produced by buildExportCanvas:
//   - Each master slot is at (slot.col, slot.row).
//   - Each variant is at variantCellInGroup(group, variantIdx-1).
// The .tres references each cell as an individual atlas tile (NOT alt_tiles
// of the master), with the master's peering bits replicated to every variant,
// so Godot's terrain painter sees N tiles matching the same peering pattern
// and picks via probability_weight.

import { state } from "../../controller/state.js";
import { variantCellInGroup } from "./layout.js";
import { buildVariantOverride } from "./tile.js";
import { derivePeeringBits } from "./peeringBits.js";
import { FALLBACK_COLOR, inverseColorOfTile } from "./colorHelpers.js";
import { cellOn as cellOnArray } from "../../core/cellValue.js";

// Re-export FALLBACK_COLOR so callers that already pulled it from this
// module (= the .tres builder's terrain swatch fallback) don't break.
export { FALLBACK_COLOR };

// Godot TileSet terrain mode constants. Picked per template (see
// templates/index.js TERRAIN_MODES). The mode controls which peering bits
// the painter checks AND which we emit in `.tres` — emitting an irrelevant
// bit confuses the editor.
export const TERRAIN_MODE_MAP = {
  "corners-and-sides": 0,
  "corners":           1,
  "sides":             2,
};

export function resolveTerrainMode(template) {
  const m = template?.terrainMode;
  return TERRAIN_MODE_MAP[m] != null ? m : "corners-and-sides";
}

export function buildTilesetTres({ template, layout, slotsWithVariants, slotSize, atlasPath, sourceLayout }) {
  const terrainModeStr = resolveTerrainMode(template);
  const tiles = enumerateAtlasTiles(template, slotsWithVariants, layout, terrainModeStr);
  const lines = [];

  lines.push(`[gd_resource type="TileSet" format=3]`);
  lines.push("");
  lines.push(`[ext_resource type="Texture2D" path="${atlasPath}" id="1"]`);
  lines.push("");
  lines.push(`[sub_resource type="TileSetAtlasSource" id="atlas_1"]`);
  lines.push(`texture = ExtResource("1")`);
  lines.push(`texture_region_size = Vector2i(${slotSize}, ${slotSize})`);

  // Sort for stable output (col, row).
  tiles.sort((a, b) => (a.col - b.col) || (a.row - b.row) || (a.altId - b.altId));

  // corners mode (dual-grid) skips terrain tagging on the slot tiles —
  // rules aren't finalised yet, so we emit the atlas cells as plain
  // references and let the user wire up terrain assignments in Godot.
  // Variants + bundle placement stay intact; only the terrain/peering
  // lines are suppressed.
  const skipSlotTerrain = terrainModeStr === "corners";
  for (const tile of tiles) {
    const prefix = `${tile.col}:${tile.row}/${tile.altId}`;
    lines.push(`${prefix} = 0`);
    // Body terrain: center cell ON → Terrain 0 (foreground), center OFF →
    // Terrain 1 (background-only tile, e.g. the empty cell in blob-47 at
    // (10,1)). Without this, body-off tiles end up untagged in Godot.
    if (!skipSlotTerrain && !tile.fallback) {
      const bodyTerrain = tile.body ? 0 : 1;
      lines.push(`${prefix}/terrain_set = 0`);
      lines.push(`${prefix}/terrain = ${bodyTerrain}`);
      // Probability only emitted when it deviates from Godot's default 1.0,
      // matching how the editor saves the file. Order matches reference:
      // terrain_set → terrain → probability → peering bits.
      if (tile.probability !== 1.0) {
        lines.push(`${prefix}/probability = ${tile.probability.toFixed(2)}`);
      }
      // ALL 8 peering bits with terrain ID per direction. For body-off tiles
      // we flip the bit meaning: pattern-ON cells stay 0 (terrain 0
      // neighbour pokes in from that side); pattern-OFF cells become 1
      // (terrain 1 continues outward). Effectively the same derivation —
      // the body terrain is what changes.
      for (const [bit, terrainId] of Object.entries(tile.bits)) {
        lines.push(`${prefix}/terrains_peering_bit/${bit} = ${terrainId}`);
      }
    }
  }

  // Bundled source tiles — per-mode rules. Each mode picks which pools get
  // a terrain assignment (Godot autotile recognises them) vs. emitted as
  // plain atlas tiles (PNG-only reference). One function per mode keeps
  // the rule local and easy to change when a mode's needs evolve.
  if (sourceLayout?.entries?.length) {
    if (terrainModeStr === "sides") {
      emitBundleSides(lines, sourceLayout);
    } else if (terrainModeStr === "corners-and-sides") {
      emitBundleCornersAndSides(lines, sourceLayout, template);
    } else if (terrainModeStr === "corners") {
      emitBundleCorners(lines, sourceLayout);
    }
  }

  const t0 = describeTerrain("A", 0);
  const t1 = describeTerrain("B", 1);

  lines.push("");
  lines.push(`[resource]`);
  lines.push(`tile_size = Vector2i(${slotSize}, ${slotSize})`);
  // Flat keys (NOT nested slashes) — Godot's editor saves
  // `terrain_set_0/mode` and `terrain_set_0/terrain_0/...`, not
  // `terrain_sets/0/...`.
  lines.push(`terrain_set_0/mode = ${TERRAIN_MODE_MAP[terrainModeStr]}`);
  lines.push(`terrain_set_0/terrain_0/name = "${t0.name}"`);
  lines.push(`terrain_set_0/terrain_0/color = ${t0.color}`);
  lines.push(`terrain_set_0/terrain_1/name = "${t1.name}"`);
  lines.push(`terrain_set_0/terrain_1/color = ${t1.color}`);
  lines.push(`sources/0 = SubResource("atlas_1")`);
  lines.push("");

  return lines.join("\n");
}

// Bit name groups for the three peering modes Godot supports. Sides
// covers the 4 cardinal directions; corners the 4 diagonals; the
// "corners-and-sides" mode uses all 8.
const SIDE_BIT_NAMES   = ["top_side", "right_side", "bottom_side", "left_side"];
const CORNER_BIT_NAMES = ["top_left_corner", "top_right_corner", "bottom_right_corner", "bottom_left_corner"];
const ALL_BIT_NAMES    = [...SIDE_BIT_NAMES, ...CORNER_BIT_NAMES];

// Probability emitted only when it deviates from Godot's implicit 1.0
// (matches the editor's own save format). Pool weights are already in
// Godot's 0..1 scale, so no conversion needed.
function emitProbabilityIfNeeded(lines, prefix, poolKey, poolIdx) {
  const weight = Math.max(0, Math.min(1, state.poolWeight(poolKey, poolIdx)));
  if (weight !== 1.0) {
    lines.push(`${prefix}/probability = ${weight.toFixed(2)}`);
  }
}

// Plain entry: PNG cell only, no terrain assignment. Probability is still
// emitted so the user can tag the tile manually in Godot and keep the
// configured weight bias.
function emitPlainEntry(lines, entry) {
  const prefix = `${entry.col}:${entry.row}/0`;
  lines.push(`${prefix} = 0`);
  if (entry.key && entry.poolIdx != null) {
    emitProbabilityIfNeeded(lines, prefix, entry.key, entry.poolIdx);
  }
}

// Interior tile entry: terrain id + every active peering bit set to the
// same id (= deep-region interior). Used for B in every mode, and for A
// in corners-and-sides when the template already covers both interiors.
function emitInteriorEntry(lines, entry, terrainId, bitNames) {
  const prefix = `${entry.col}:${entry.row}/0`;
  lines.push(`${prefix} = 0`);
  lines.push(`${prefix}/terrain_set = 0`);
  lines.push(`${prefix}/terrain = ${terrainId}`);
  emitProbabilityIfNeeded(lines, prefix, entry.key, entry.poolIdx);
  for (const bit of bitNames) {
    lines.push(`${prefix}/terrains_peering_bit/${bit} = ${terrainId}`);
  }
}

// sides mode: A = plain, B = terrain 1 + 4 side bits.
// Reason: 3×3 sides templates (wang-edges-16) lack a T1 interior slot
// (no center-off pattern), so B bundle plugs the gap. A is redundant
// with the existing all-on slot, so we leave it untagged.
// Bundle-export variant: same per-mode rules as the single-project
// emitBundle* functions, but the pool→terrain assignment uses caller-
// supplied global terrain ids (bundle has multiple atlases sharing one
// terrain_set; ids 0/1 from the single-project case don't apply).
export function emitSourceBundleWithIds(lines, sourceLayout, terrainModeStr, terrainIds, template) {
  if (!sourceLayout?.entries?.length) return;
  const { A: idA, B: idB } = terrainIds;
  if (terrainModeStr === "sides") {
    for (const entry of sourceLayout.entries) {
      if (entry.key === "B") emitInteriorEntry(lines, entry, idB, SIDE_BIT_NAMES);
      else                   emitPlainEntry(lines, entry);
    }
  } else if (terrainModeStr === "corners-and-sides") {
    const hasBoth = hasFullInteriorPair(template);
    for (const entry of sourceLayout.entries) {
      if (entry.key === "B") {
        emitInteriorEntry(lines, entry, idB, ALL_BIT_NAMES);
      } else if (hasBoth) {
        emitInteriorEntry(lines, entry, idA, ALL_BIT_NAMES);
      } else {
        emitPlainEntry(lines, entry);
      }
    }
  } else {
    // "corners" — both pools emit plain (user tags by hand in Godot).
    for (const entry of sourceLayout.entries) emitPlainEntry(lines, entry);
  }
}

function emitBundleSides(lines, sourceLayout) {
  for (const entry of sourceLayout.entries) {
    if (entry.key === "B") emitInteriorEntry(lines, entry, 1, SIDE_BIT_NAMES);
    else                   emitPlainEntry(lines, entry);
  }
}

// corners-and-sides mode: depends on template completeness.
//   - If the template already contains BOTH a T0 interior (3×3 all-1)
//     AND a T1 interior (3×3 all-0) slot, both pools may be tagged
//     (extra weighted variants of the existing interiors).
//   - Otherwise only B is tagged. The user must add the missing
//     interior pattern(s) to the template to get full A coverage;
//     bundling A as terrain-tagged when the template lacks T0
//     would create a foreign interior that fights with the rest of
//     the atlas's peering bits.
function emitBundleCornersAndSides(lines, sourceLayout, template) {
  const hasBoth = hasFullInteriorPair(template);
  for (const entry of sourceLayout.entries) {
    if (entry.key === "B") {
      emitInteriorEntry(lines, entry, 1, ALL_BIT_NAMES);
    } else if (hasBoth) {
      emitInteriorEntry(lines, entry, 0, ALL_BIT_NAMES);
    } else {
      emitPlainEntry(lines, entry);
    }
  }
}

// corners mode: rules TBD. Until we settle dual-grid terrain semantics,
// both pools emit plain atlas entries — bundle slots still appear in
// the PNG (so variants + source rows survive), Godot just doesn't see
// them as terrain-tagged tiles. User tags them by hand if needed.
function emitBundleCorners(lines, sourceLayout) {
  for (const entry of sourceLayout.entries) emitPlainEntry(lines, entry);
}

// Strict 3×3 interior pair check: both [[1,1,1],[1,1,1],[1,1,1]] and
// [[0,0,0],[0,0,0],[0,0,0]] must appear among the template slots.
// Pattern-level (not derivePeeringBits) so the rule lines up with the
// literal 3×3 cells the user sees in the editor.
function hasFullInteriorPair(template) {
  let allOnSlot = false;
  let allOffSlot = false;
  for (const slot of template?.slots || []) {
    const arr = slot.array;
    if (!Array.isArray(arr) || arr.length !== 3) continue;
    let on = 0, off = 0;
    for (let r = 0; r < 3; r++) {
      const row = arr[r];
      if (!Array.isArray(row) || row.length !== 3) { on = -1; break; }
      for (let c = 0; c < 3; c++) {
        if (cellOnArray(row[c])) on++;
        else                     off++;
      }
    }
    if (on === 9)      allOnSlot = true;
    else if (off === 9) allOffSlot = true;
    if (allOnSlot && allOffSlot) return true;
  }
  return allOnSlot && allOffSlot;
}

// Terrain naming + color from a pool's master tile. Name = filename without
// extension; color = inverse of the tile's center pixel so the swatch reads
// against the actual texture in Godot's terrain editor. Falls back to a
// generic gray "Terrain N" when the pool isn't set.
export function describeTerrain(poolKey, idx) {
  const ref = state.master(poolKey);
  const input = ref ? state.inputs.find((i) => i.id === ref.inputId) : null;
  // User-set pool name wins over master tile's input filename. This is the
  // terrain identity used when bundling multiple projects into one TileSet.
  const explicit = state.poolName(poolKey);
  if (!ref || !input) {
    return {
      name: explicit || `Terrain ${idx}`,
      color: `Color(${FALLBACK_COLOR})`,
    };
  }
  const name = explicit || stripExtension(input.name) || `Terrain ${idx}`;
  return { name, color: inverseColorOfTile(input, ref.tileCol, ref.tileRow) };
}

function stripExtension(filename) {
  return String(filename || "").replace(/\.[^./\\]+$/, "");
}

// Build the full atlas tile list: master cells plus packed variants.
// Each entry has its (col, row) atlas coord + derived peering bits + the
// probability used by Godot's terrain painter, computed from this tile's
// pool A and pool B weights: probability = (weightA + weightB) / 2 (both
// in Godot's 0..1 scale). Default weights (1.0 each) → probability 1.0,
// which Godot expects as the implicit default so we omit emission in that
// case (matches editor output).
export function enumerateAtlasTiles(template, slotsWithVariants, layout, terrainModeStr) {
  const out = [];

  for (const slot of template.slots) {
    const { body, bits, fallback } = derivePeeringBits(slot.array, terrainModeStr);
    if (fallback) {
      console.warn(`[tresBuilder] slot index ${slot.index} has non-3×3 pattern; emitted as plain tile without peering bits`);
    }
    out.push({
      col: slot.col,
      row: slot.row,
      altId: 0,
      body, bits, fallback,
      probability: probabilityForTile(slot, 0),
    });
  }

  for (let gi = 0; gi < layout.groups.length; gi++) {
    const g = layout.groups[gi];
    const slot = slotsWithVariants[gi];
    const count = state.getExportVariantCount(slot.index);
    const { body, bits, fallback } = derivePeeringBits(slot.array, terrainModeStr);
    for (let v = 1; v < count; v++) {
      const { col, row } = variantCellInGroup(g, v - 1);
      out.push({
        col, row,
        altId: 0,
        body, bits, fallback,
        probability: probabilityForTile(slot, v),
      });
    }
  }

  return out;
}

// Per-tile probability from the pool weights of the source tiles (pool A
// and pool B) it composites. Master (variantIdx=0) uses slot-pool override
// if set, else pool[0] entries. Variants reuse `buildVariantOverride` which
// already handles variantPoolOverride + weighted random pick (deterministic
// given seed). Missing pool ref → contributes default weight 100 (= no
// penalty).
//
// Slots without variants (variantCount=1) skip probability entirely — with
// only one tile matching its peering bits, the painter has nothing to pick
// between and the field would only add noise to the .tres.
function probabilityForTile(slot, variantIdx) {
  if (state.getExportVariantCount(slot.index) <= 1) return 1.0;
  let refA, refB;
  if (variantIdx === 0) {
    const slotOv = state.getSlotPoolOverride(slot.index);
    refA = slotOv?.A != null ? state.poolAt("A", slotOv.A) : state.master("A");
    refB = slotOv?.B != null ? state.poolAt("B", slotOv.B) : state.master("B");
  } else {
    const ov = buildVariantOverride(slot.index, variantIdx);
    refA = ov?.sources?.A || state.master("A");
    refB = ov?.sources?.B || state.master("B");
  }
  const wA = weightOfRef("A", refA);
  const wB = weightOfRef("B", refB);
  const p = (wA + wB) / 2;
  return Math.max(0, Math.min(1, p));
}

function weightOfRef(key, ref) {
  if (!ref) return 1;
  const pool = state.pool(key);
  for (let i = 0; i < pool.length; i++) {
    const e = pool[i];
    if (e.inputId === ref.inputId
        && e.tileCol === ref.tileCol
        && e.tileRow === ref.tileRow) {
      return Math.max(0, state.poolWeight(key, i));
    }
  }
  return 1;
}
