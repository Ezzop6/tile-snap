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
  // Export tile resolution forced onto every bundled project. Not a globalCurve
  // key (lives outside BUNDLE_OVERRIDE_KEYS) — when off, each project uses its
  // own resolution and the bundle export blocks if they don't all match.
  state._bundleResolution = { enabled: false, value: 64 };
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

  // Resolution override (separate from the curve keys above).
  StateClass.prototype.getBundleResolution = function () {
    return this._bundleResolution;
  };

  StateClass.prototype.setBundleResolutionEnabled = function (enabled) {
    const b = !!enabled;
    if (this._bundleResolution.enabled === b) return;
    this._bundleResolution.enabled = b;
    this.dispatchEvent(new CustomEvent("bundle-overrides:changed", { detail: { key: "resolution", field: "enabled" } }));
  };

  StateClass.prototype.setBundleResolutionValue = function (value) {
    const n = Math.round(+value);
    if (!Number.isFinite(n) || n <= 0 || this._bundleResolution.value === n) return;
    this._bundleResolution.value = n;
    this.dispatchEvent(new CustomEvent("bundle-overrides:changed", { detail: { key: "resolution", field: "value" } }));
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
    const res = obj.resolution;
    if (res && typeof res === "object") {
      if (typeof res.enabled === "boolean") this._bundleResolution.enabled = res.enabled;
      if (Number.isFinite(res.value) && res.value > 0) this._bundleResolution.value = Math.round(res.value);
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
    out.resolution = { enabled: this._bundleResolution.enabled, value: this._bundleResolution.value };
    return out;
  };
}
