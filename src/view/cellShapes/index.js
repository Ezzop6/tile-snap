import { SQUARE   } from "./square.js";
import { TRIANGLE } from "./triangle.js";

const SHAPES = {
  [SQUARE.id]:   SQUARE,
  [TRIANGLE.id]: TRIANGLE,
};

// Falls back to SQUARE for unknown / missing ids so legacy data still loads.
export function getCellShape(id) {
  return SHAPES[id] || SQUARE;
}

export function listCellShapes() {
  return [SQUARE, TRIANGLE];
}
