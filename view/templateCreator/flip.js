// Bulk flip of binary pattern values across every slot in the template
// (0 ↔ 1). Quick toggle for "I want the negative of what I painted" —
// no confirm because flipping twice restores the original.
//
// cellShape === "square" only. Triangle stores wedge arrays per cell which
// aren't binary in the same shape; triangle remains WIP so we no-op +
// toast instead of risking a bad write.
//
// NOTE: PointGraph treats cell `1` and `0` asymmetrically at slot edges
// (closure fires only for 1-adjacent-to-OOB). Bulk flip can therefore
// change boundary topology, not just side labels. Acceptable today; if
// users hit weird renders after Flip, revisit (polarity flag / pipeline
// symmetrisation).

import { state } from "../../controller/state.js";
import { ensureEditable } from "./guards.js";
import { renderEditor } from "./render.js";
import { sync } from "./refs.js";
import { showToast } from "../toast.js";

export async function flipPattern() {
  const t = state.template;
  if (!t) return;
  if (t.cellShape !== "square") {
    showToast("Flip pattern supports square cellShape only (triangle is WIP).", { kind: "info" });
    return;
  }
  if (!(await ensureEditable())) return;

  for (const slot of t.slots) {
    if (!Array.isArray(slot.array)) continue;
    for (let r = 0; r < slot.array.length; r++) {
      const row = slot.array[r];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < row.length; c++) {
        // Defensive: any truthy → 0, falsy → 1 so non-binary cells flatten
        // to the binary scheme rather than mixing types.
        row[c] = row[c] ? 0 : 1;
      }
    }
  }

  renderEditor();
  state.markTemplateDirty();
  sync.suppressNextRebuild = true;
  state.notifyTemplateChanged();
}
