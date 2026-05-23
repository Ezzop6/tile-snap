// Bundle-wide overrides for state values forced onto every bundled
// project at export time. Singleton (= one set across the whole tool, not
// per-bundle / per-project). Curated registry (BUNDLE_OVERRIDE_KEYS)
// keeps the UI predictable; new keys join here + the UI renders them
// automatically from GLOBAL_CURVE_PARAMS schema.

import { GLOBAL_CURVE_PARAMS, defaultGlobalCurve } from "../../core/curve_params.js";

// Curated list of globalCurve params worth exposing as bundle overrides.
// Extend here when a new override becomes useful — the UI + apply hook
// pick it up without further wiring.
// Curated list of globalCurve params overrideable in the bundle. The UI
// groups them visually (see OVERRIDE_GROUPS in bundleMode.js) — state
// itself stays flat so apply-at-export iterates one entry at a time.
export const BUNDLE_OVERRIDE_KEYS = [
  "outlineColor",
  "outlineWidth",
];

function defaultsFor(key) {
  const spec = GLOBAL_CURVE_PARAMS[key];
  if (spec) return spec.default;
  const fallback = defaultGlobalCurve();
  return fallback[key] ?? 0;
}

export function initBundleOverridesState(state) {
  state._bundleOverrides = {};
  for (const key of BUNDLE_OVERRIDE_KEYS) {
    state._bundleOverrides[key] = { enabled: false, value: defaultsFor(key) };
  }
}

export function applyBundleOverridesMixin(StateClass) {
  Object.defineProperty(StateClass.prototype, "bundleOverrides", {
    get() { return this._bundleOverrides; },
  });

  StateClass.prototype.getBundleOverride = function (key) {
    return this._bundleOverrides?.[key] || null;
  };

  StateClass.prototype.setBundleOverrideEnabled = function (key, enabled) {
    const ov = this._bundleOverrides?.[key];
    if (!ov) return;
    const b = !!enabled;
    if (ov.enabled === b) return;
    ov.enabled = b;
    this.dispatchEvent(new CustomEvent("bundle-overrides:changed", { detail: { key, field: "enabled" } }));
  };

  StateClass.prototype.setBundleOverrideValue = function (key, value) {
    const ov = this._bundleOverrides?.[key];
    if (!ov) return;
    if (ov.value === value) return;
    ov.value = value;
    this.dispatchEvent(new CustomEvent("bundle-overrides:changed", { detail: { key, field: "value" } }));
  };

  // Bulk load (used by settings hydration on app start).
  StateClass.prototype.loadBundleOverrides = function (obj) {
    if (!obj || typeof obj !== "object") return;
    for (const key of BUNDLE_OVERRIDE_KEYS) {
      const inc = obj[key];
      if (!inc || typeof inc !== "object") continue;
      const cur = this._bundleOverrides[key];
      if (!cur) continue;
      if (typeof inc.enabled === "boolean") cur.enabled = inc.enabled;
      if ("value" in inc) cur.value = inc.value;
    }
    this.dispatchEvent(new CustomEvent("bundle-overrides:changed", { detail: null }));
  };

  StateClass.prototype.serializeBundleOverrides = function () {
    const out = {};
    for (const key of BUNDLE_OVERRIDE_KEYS) {
      const ov = this._bundleOverrides[key];
      if (!ov) continue;
      out[key] = { enabled: ov.enabled, value: ov.value };
    }
    return out;
  };
}
