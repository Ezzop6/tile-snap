// Bipolar sliders: UI -100..100 maps to state -1..1.

import { state } from "../controller/state.js";
import { GLOBAL_CURVE_PARAMS } from "../core/curve_params.js";
import { confirmDestructive } from "./dialog.js";

const SLIDER_KEYS = [
  "cornerSoftness",
  "cornerArcness",
  "waveAmplitude",
  "waveFrequency",
  "waveJitter",
  "waveSymmetric",
  "inflate",
  "organic",
  "outlineWidth",
];

const BOOL_KEYS = [];

const COLOR_KEYS = ["outlineColor"];

const ALL_KEYS = [...SLIDER_KEYS, ...BOOL_KEYS, ...COLOR_KEYS];

// Outline width + colour stay out of random-all: width = user-chosen weight, colour = project identity.
const RANDOM_ALL_KEYS = SLIDER_KEYS.filter((k) => k !== "outlineWidth");

export function initCurvePanel() {
  const sliders = new Map();
  const valueEls = new Map();
  const colors   = new Map();

  for (const key of SLIDER_KEYS) {
    const slider  = document.getElementById(`curve-${key}`);
    const valueEl = document.getElementById(`curve-${key}-value`);
    if (!slider) continue;
    sliders.set(key, slider);
    if (valueEl) valueEls.set(key, valueEl);

    syncWidgets(key, slider, valueEl, state.globalCurve[key] ?? 0);

    slider.addEventListener("input", () => {
      const state01 = uiToState(key, parseFloat(slider.value));
      if (valueEl) valueEl.value = uiFromState(key, state01).toString();
      state.setGlobalCurveParam(key, state01);
    });

    // Commit on `change` not `input`: partial typing like "-" or "0." would otherwise snap slider to 0.
    if (valueEl) {
      valueEl.addEventListener("change", () => {
        const ui = clampToSliderRange(slider, parseFloat(valueEl.value));
        const state01 = uiToState(key, ui);
        slider.value = ui.toString();
        valueEl.value = ui.toString();
        state.setGlobalCurveParam(key, state01);
      });
    }
  }

  const checks = new Map();
  for (const key of BOOL_KEYS) {
    const check = document.getElementById(`curve-${key}`);
    if (!check) continue;
    checks.set(key, check);
    check.checked = state.globalCurve[key] !== false;
    check.addEventListener("change", () => {
      state.setGlobalCurveParam(key, check.checked);
    });
  }

  for (const key of COLOR_KEYS) {
    const picker = document.getElementById(`curve-${key}`);
    if (!picker) continue;
    colors.set(key, picker);

    picker.value = state.globalCurve[key] || "#000000";

    picker.addEventListener("input", () => {
      state.setGlobalCurveParam(key, picker.value);
    });
  }

  state.addEventListener("global-curve:changed", (e) => {
    const key = e.detail;
    const slider = sliders.get(key);
    if (slider) {
      syncWidgets(key, slider, valueEls.get(key), state.globalCurve[key] ?? 0);
      return;
    }
    const check = checks.get(key);
    if (check) {
      check.checked = state.globalCurve[key] !== false;
      return;
    }
    const color = colors.get(key);
    if (color) {
      color.value = state.globalCurve[key] || "#000000";
    }
  });

  const panelEl = document.querySelector(".curve-panel");
  if (panelEl) {
    panelEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-curve-action]");
      if (!btn) return;
      e.preventDefault();
      const action = btn.dataset.curveAction;
      const key    = btn.dataset.curveKey;
      if (!key || !GLOBAL_CURVE_PARAMS[key]) return;
      if (action === "reset")  applyReset(key);
      if (action === "random") applyRandom(key);
    });
  }

  const btnResetAll   = document.getElementById("curve-reset-all");
  const btnResetPaths = document.getElementById("curve-reset-paths");
  const btnRandomAll  = document.getElementById("curve-random-all");
  if (btnResetAll) btnResetAll.addEventListener("click", async () => {
    const ok = await confirmDestructive({
      title:   "Reset everything",
      message: "Reset all global curves AND every per-slot deformation? This can't be undone.",
      confirmLabel: "Reset",
    });
    if (!ok) return;
    ALL_KEYS.forEach(applyReset);
    state.clearAllTileOffsets();
    state.clearAllCutBowOverrides?.();
    state.clearAllSlotCutTransforms?.();
    state.clearAllSlotTextureTransforms?.();
  });
  if (btnResetPaths) btnResetPaths.addEventListener("click", async () => {
    const ok = await confirmDestructive({
      title:   "Reset path deformations",
      message: "Reset path deformations on every tile? This can't be undone.",
      confirmLabel: "Reset",
    });
    if (!ok) return;
    state.clearAllTileOffsets();
    state.clearAllCutBowOverrides?.();
    state.clearAllSlotCutTransforms?.();
    state.clearAllSlotTextureTransforms?.();
  });
  if (btnRandomAll) btnRandomAll.addEventListener("click", () => RANDOM_ALL_KEYS.forEach(applyRandom));
}

// outlineWidth uses a 1:1 px slider (0..10); others map slider to state via
// uiScale (default 100 → slider 0..100 ↔ state 0..1; waveFrequency uses 25
// so slider 0..100 ↔ state 0..4).
function uiToState(key, sliderValue) {
  if (key === "outlineWidth") return sliderValue / GLOBAL_CURVE_PARAMS.outlineWidth.effectScale;
  const uiScale = GLOBAL_CURVE_PARAMS[key]?.uiScale ?? 100;
  return sliderValue / uiScale;
}

function uiFromState(key, state01) {
  if (key === "outlineWidth") {
    const px = state01 * GLOBAL_CURVE_PARAMS.outlineWidth.effectScale;
    return Math.round(px * 10) / 10;
  }
  const uiScale = GLOBAL_CURVE_PARAMS[key]?.uiScale ?? 100;
  return Math.round(state01 * uiScale);
}

function syncWidgets(key, slider, valueEl, state01) {
  const ui = uiFromState(key, state01);
  slider.value = ui.toString();
  if (valueEl) valueEl.value = ui.toString();
}

function clampToSliderRange(slider, n) {
  if (!Number.isFinite(n)) return parseFloat(slider.min) || 0;
  const lo = parseFloat(slider.min);
  const hi = parseFloat(slider.max);
  return Math.max(lo, Math.min(hi, n));
}

function applyReset(key) {
  const spec = GLOBAL_CURVE_PARAMS[key];
  if (!spec) return;
  state.setGlobalCurveParam(key, spec.default);
}

function applyRandom(key) {
  const spec = GLOBAL_CURVE_PARAMS[key];
  if (!spec) return;
  if (key === "outlineColor") {
    const hex = "#" + Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, "0");
    state.setGlobalCurveParam(key, hex);
    return;
  }
  const min = typeof spec.min === "number" ? spec.min : 0;
  const max = typeof spec.max === "number" ? spec.max : 1;
  // Snap to slider step (1/100) so displayed value matches state exactly.
  const v = min + Math.random() * (max - min);
  state.setGlobalCurveParam(key, Math.round(v * 100) / 100);
}
