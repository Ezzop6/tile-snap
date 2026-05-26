import { REFERENCE_SLOT_SIZE } from "../render2/buildSlotGraph.js";

// Debug stage renders each slot at 3× REFERENCE_SLOT_SIZE — more pixels
// to look at while inspecting graph structure. The graph itself stays in
// REF coords; per-slot ctx.scale maps REF → SLOT_SIZE at draw time.
export const SLOT_SIZE          = REFERENCE_SLOT_SIZE * 3;
export const SLOT_SCALE         = SLOT_SIZE / REFERENCE_SLOT_SIZE;
export const SLOT_GAP           = 0;
export const STAGE_PADDING      = 16;
export const SUPERSAMPLE        = 2;
export const POINT_HIT_RADIUS   = 8;
export const CONN_HIT_TOLERANCE = 5;
export const HIGHLIGHT_COLOR    = "#ffcc00";

export function slotOrigin(slot) {
  return {
    x: STAGE_PADDING + slot.col * (SLOT_SIZE + SLOT_GAP),
    y: STAGE_PADDING + slot.row * (SLOT_SIZE + SLOT_GAP),
  };
}
