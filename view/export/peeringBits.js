// Maps a slot's pattern (slot.array) to Godot 4 terrain peering bits.
//
// Default builtin templates use a 3×3 pattern where:
//   (0,0)=NW   (0,1)=N   (0,2)=NE
//   (1,0)=W    (1,1)=C   (1,2)=E
//   (2,0)=SW   (2,1)=S   (2,2)=SE
// Center cell tells us whether the tile is "this terrain" (body).
// Outer ring cells encode which neighbor directions this tile connects to.
//
// Non-3×3 patterns (2×2, 5×5 etc.) aren't mapped yet — we return a body-only
// descriptor so the tile still appears as a terrain tile, just without
// peering bits. Caller logs a console.warn so the user knows manual setup
// is needed in Godot.

const CELL_TO_BIT = {
  "0,0": "top_left_corner",
  "0,1": "top_side",
  "0,2": "top_right_corner",
  "1,0": "left_side",
  "1,2": "right_side",
  "2,0": "bottom_left_corner",
  "2,1": "bottom_side",
  "2,2": "bottom_right_corner",
};

// Dual-grid (2×2): each cell IS a corner of the tile. No side bits exist
// in this layout — Godot's MATCH_CORNERS mode only checks corners anyway.
const CELL_TO_BIT_2X2 = {
  "0,0": "top_left_corner",
  "0,1": "top_right_corner",
  "1,0": "bottom_left_corner",
  "1,1": "bottom_right_corner",
};

const SIDE_BITS = new Set(["top_side", "right_side", "bottom_side", "left_side"]);
const CORNER_BITS = new Set(["top_left_corner", "top_right_corner", "bottom_right_corner", "bottom_left_corner"]);

const PEERING_BIT_NAMES = Object.values(CELL_TO_BIT);

function cellOn(v) {
  if (Array.isArray(v)) return v.some((x) => x);
  return !!v;
}

// Returns { body, bits, fallback } where:
//   - body: true if center cell is ON (= tile body is Terrain 0).
//   - bits: { <bit>: <terrain id 0|1>, ... } for every peering direction
//     relevant to the given terrain mode. Godot only checks bits matching
//     the active mode, so we omit corners in "sides" mode and sides in
//     "corners" mode — the .tres exactly matches what an editor-saved file
//     for that mode looks like.
//   - fallback: true for non-3×3 patterns; bits stays empty and the .tres
//     builder skips peering bits for that tile.
//
// `mode` is one of "corners-and-sides", "corners", "sides". Anything else
// falls back to "corners-and-sides".
export function derivePeeringBits(slotArray, mode = "corners-and-sides") {
  const rows = slotArray?.length ?? 0;
  const cols = slotArray?.[0]?.length ?? 0;

  // Dual-grid 2×2: each cell maps directly to a corner. "sides" mode
  // can't derive anything from this layout (no side cells), so we
  // fallback rather than emit zero-bit tiles that would confuse Godot.
  if (rows === 2 && cols === 2) {
    if (mode === "sides") {
      return { body: true, bits: {}, fallback: true };
    }
    const bits = {};
    let anyOn = false;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        const on = cellOn(slotArray[r][c]);
        if (on) anyOn = true;
        const name = CELL_TO_BIT_2X2[`${r},${c}`];
        bits[name] = on ? 0 : 1;
      }
    }
    // Convention: mixed-corner tiles belong to terrain 0 (foreground).
    // Pure-background (all cells off) → terrain 1 — that's the T1
    // interior tile Godot needs to fill deep background regions.
    return { body: anyOn, bits, fallback: false };
  }

  if (rows !== 3 || cols !== 3) {
    return { body: true, bits: {}, fallback: true };
  }
  const body = cellOn(slotArray[1][1]);
  const bits = {};
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (r === 1 && c === 1) continue;
      const key = `${r},${c}`;
      const name = CELL_TO_BIT[key];
      if (!name) continue;
      if (mode === "sides"   && !SIDE_BITS.has(name))   continue;
      if (mode === "corners" && !CORNER_BITS.has(name)) continue;
      bits[name] = cellOn(slotArray[r][c]) ? 0 : 1;
    }
  }
  return { body, bits, fallback: false };
}

// Scan all slots; pick the most general terrain mode that fits.
// Mode constants from Godot 4 TileSet:
//   0 = MATCH_CORNERS_AND_SIDES
//   1 = MATCH_CORNERS
//   2 = MATCH_SIDES
export function detectTerrainMode(slots) {
  let anyCorner = false;
  let anySide   = false;
  const sides   = new Set(["top_side", "right_side", "bottom_side", "left_side"]);
  for (const s of slots || []) {
    const { bits, fallback } = derivePeeringBits(s.array);
    if (fallback) continue;
    for (const k of Object.keys(bits)) {
      if (sides.has(k)) anySide = true;
      else              anyCorner = true;
    }
  }
  if (anyCorner && anySide) return 0;
  if (anyCorner)            return 1;
  return 2;
}

export { PEERING_BIT_NAMES };

// Walks every slot to check which terrain interiors the template can render
// in Godot autotile painter under the active mode:
//   - T0 interior = a tile with body=on + every relevant peering bit = 0.
//   - T1 interior = a tile with body=off + every relevant peering bit = 1.
// Returns { hasT0Interior, hasT1Interior }. Caller uses these to warn the
// user when a side is missing (= Godot can't fill deep interiors).
export function analyzeTerrainCoverage(template) {
  const mode = template?.terrainMode || "corners-and-sides";
  let hasT0Interior = false;
  let hasT1Interior = false;
  for (const slot of template?.slots || []) {
    const { body, bits, fallback } = derivePeeringBits(slot.array, mode);
    if (fallback) continue;
    const values = Object.values(bits);
    if (values.length === 0) continue;
    const want = body ? 0 : 1;
    if (values.every((b) => b === want)) {
      if (body) hasT0Interior = true;
      else      hasT1Interior = true;
    }
  }
  return { hasT0Interior, hasT1Interior };
}
