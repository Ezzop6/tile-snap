// Cross-project settings import — copies a curated subset of state from
// another project's serialised blob into the live state. Used by the
// canvas-toolbar dropdowns "Import curve + noise" / "Import texture ops".
//
// Replace semantics: target's existing values for the imported category
// are wiped to defaults first so a saved blob missing fields doesn't
// leave a half-merged state. Per-slot deformations + pool refs +
// template are deliberately NOT imported — only project-level params
// that are safe to transplant across templates.

import { defaultGlobalCurve } from "../../core/curve_params.js";
import { defaultNoiseParams } from "../../core/noise_params.js";
import { mergeOpsPool } from "./serialize.js";

export function applyImportSettingsMixin(StateClass) {
  StateClass.prototype.importCurveAndNoiseFrom = function (obj) {
    if (!obj || typeof obj !== "object") return false;
    this._globalCurve = { ...defaultGlobalCurve(), ...(obj.globalCurve || {}) };
    this._noiseParams = defaultNoiseParams();
    if (obj.noiseParams && typeof obj.noiseParams === "object") {
      const np = obj.noiseParams;
      if (np.A || np.B) {
        for (const k of ["A", "B"]) {
          if (np[k] && typeof np[k] === "object") {
            this._noiseParams[k] = { ...this._noiseParams[k], ...np[k] };
          }
        }
      }
    }
    this.dispatchEvent(new CustomEvent("global-curve:changed", { detail: null }));
    this.dispatchEvent(new CustomEvent("noise:changed",        { detail: null }));
    return true;
  };

  StateClass.prototype.importTextureOpsFrom = function (obj) {
    if (!obj || typeof obj !== "object") return false;
    this._globalTextureOps = {
      A: mergeOpsPool(obj.globalTextureOps?.A),
      B: mergeOpsPool(obj.globalTextureOps?.B),
    };
    this.dispatchEvent(new CustomEvent("texture-ops:changed", { detail: null }));
    return true;
  };
}
