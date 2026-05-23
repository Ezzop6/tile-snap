// Bundle Overrides right-panel section — per-group rows (= curated
// keys of globalCurve params, e.g. "outline" = outlineColor + outlineWidth)
// each with one toggle + one control per key + a label at the end.
// Singleton + persisted via state.bundleOverrides (controller/state).

import { state } from "../../controller/state.js";
import { GLOBAL_CURVE_PARAMS } from "../../core/curve_params.js";
import { dom } from "./state.js";

// Logical grouping of override keys for the UI. Each group renders as a
// single row: [enabled toggle] [controls per key] [label]. The toggle
// flips every key's enabled flag together so e.g. enabling "outline"
// forces both colour and width across the bundle.
const OVERRIDE_GROUPS = [
  { id: "outline", label: "outline", keys: ["outlineColor", "outlineWidth"] },
];

export function renderOverrides() {
  const overridesEl = dom.overridesEl;
  if (!overridesEl) return;
  overridesEl.innerHTML = "";
  for (const group of OVERRIDE_GROUPS) {
    overridesEl.append(buildOverrideRow(group));
  }
  overridesEl.append(buildResolutionRow());
}

// Resolution override — not a globalCurve key, so its own row. When on, every
// bundled project is exported at this tile size; when off, the bundle export
// requires all projects to already share one resolution.
function buildResolutionRow() {
  const row = document.createElement("div");
  row.className = "bundle-override";
  row.dataset.groupId = "resolution";

  const res = state.getBundleResolution();

  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.title = "Force one export resolution onto every bundled project. Needed when projects use different resolutions.";
  enabled.checked = !!res.enabled;
  enabled.addEventListener("change", () => state.setBundleResolutionEnabled(enabled.checked));
  row.append(enabled);

  const value = document.createElement("input");
  value.type = "number";
  value.className = "bundle-override__value";
  value.dataset.resolution = "1";
  value.min = "1";
  value.step = "1";
  value.value = String(res.value);
  value.title = "Export tile resolution (px) applied to all bundled projects.";
  value.addEventListener("change", () => {
    state.setBundleResolutionValue(parseFloat(value.value) || 0);
    value.value = String(state.getBundleResolution().value);
  });
  row.append(value);

  const label = document.createElement("span");
  label.className = "bundle-override__label";
  label.textContent = "resolution (px)";
  row.append(label);
  return row;
}

function buildOverrideRow(group) {
  const row = document.createElement("div");
  row.className = "bundle-override";
  row.dataset.groupId = group.id;

  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.title = "Apply this override to every bundled project at export.";
  enabled.checked = group.keys.every((k) => state.getBundleOverride(k)?.enabled);
  enabled.addEventListener("change", () => {
    for (const k of group.keys) state.setBundleOverrideEnabled(k, enabled.checked);
  });
  row.append(enabled);

  for (const key of group.keys) {
    const spec = GLOBAL_CURVE_PARAMS[key];
    const ov   = state.getBundleOverride(key);
    if (!spec || !ov) continue;
    row.append(buildControl(key, spec, ov));
  }

  // Label at end — matches the user's mental model "[toggle + controls]
  // override [what]". camelCase → "outline color" so the UI reads naturally.
  const label = document.createElement("span");
  label.className = "bundle-override__label";
  label.textContent = group.label;
  row.append(label);

  return row;
}

// Builds a single control per state key. Hex-string default → color
// picker. Numeric → number input in display-units (state value × effect
// scale, e.g. outlineWidth state 0..1 ↔ 0..4 px) so the user sees the
// same numbers as the project's Curve panel.
function buildControl(key, spec, ov) {
  const isColor = typeof spec.default === "string" && /^#[0-9a-f]+$/i.test(spec.default);
  if (isColor) {
    const color = document.createElement("input");
    color.type = "color";
    color.className = "bundle-override__color";
    color.dataset.overrideKey = key;
    color.value = ov.value;
    color.addEventListener("input", () => state.setBundleOverrideValue(key, color.value));
    return color;
  }
  const effectScale = spec.effectScale ?? 1;
  const stateMin = spec.min ?? 0;
  const stateMax = spec.max ?? 1;
  const value = document.createElement("input");
  value.type  = "number";
  value.className = "bundle-override__value";
  value.dataset.overrideKey = key;
  value.min  = String(stateMin * effectScale);
  value.max  = String(stateMax * effectScale);
  value.step = effectScale >= 1 ? "0.1" : "0.01";
  value.value = (ov.value * effectScale).toFixed(value.step === "0.1" ? 1 : 2);
  value.title = `${humanizeKey(key)} — units match the project's Curve panel (state 0..${stateMax} × ${effectScale}).`;
  value.addEventListener("change", () => {
    const ui = parseFloat(value.value) || 0;
    const state01 = Math.max(stateMin, Math.min(stateMax, ui / effectScale));
    state.setBundleOverrideValue(key, state01);
    value.value = (state01 * effectScale).toFixed(value.step === "0.1" ? 1 : 2);
  });
  return value;
}

function humanizeKey(key) {
  return key.replace(/([A-Z])/g, " $1").toLowerCase();
}

// Push state values back into existing override-row DOM (= settings
// hydration on boot wrote into state without firing per-row events).
export function syncOverrideRows() {
  const overridesEl = dom.overridesEl;
  if (!overridesEl) return;
  for (const row of overridesEl.querySelectorAll(".bundle-override")) {
    if (row.dataset.groupId === "resolution") {
      const res = state.getBundleResolution();
      const cb = row.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = !!res.enabled;
      const num = row.querySelector("[data-resolution]");
      if (num && num.value !== String(res.value)) num.value = String(res.value);
      continue;
    }
    const group = OVERRIDE_GROUPS.find((g) => g.id === row.dataset.groupId);
    if (!group) continue;
    const cb = row.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = group.keys.every((k) => state.getBundleOverride(k)?.enabled);
    for (const ctrl of row.querySelectorAll("[data-override-key]")) {
      const key = ctrl.dataset.overrideKey;
      const ov  = state.getBundleOverride(key);
      if (!ov) continue;
      const spec = GLOBAL_CURVE_PARAMS[key];
      if (ctrl.type === "color") {
        if (ctrl.value !== ov.value) ctrl.value = ov.value;
      } else {
        const effectScale = spec?.effectScale ?? 1;
        const display = (ov.value * effectScale).toFixed(effectScale >= 1 ? 1 : 2);
        if (ctrl.value !== display) ctrl.value = display;
      }
    }
  }
}
