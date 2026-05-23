import { state } from "../controller/state.js";
import {
  NOISE_LAYER_PARAMS,
  NOISE_LAYER_KEYS,
  defaultNoiseLayer,
} from "../core/noise_params.js";

const SLIDER_KEYS = ["density", "scale", "edgeFade"];

export function initNoisePanel() {
  const sliders = new Map();
  const valueEls = new Map();
  const typeSels = new Map();
  const enableBoxes = new Map();

  for (const layer of NOISE_LAYER_KEYS) {
    for (const key of SLIDER_KEYS) {
      const slider = document.querySelector(
        `input[data-noise-layer="${layer}"][data-noise-key="${key}"][data-role="slider"]`,
      );
      const valueEl = document.querySelector(
        `input[data-noise-layer="${layer}"][data-noise-key="${key}"][data-role="value"]`,
      );
      if (!slider) continue;
      sliders.set(`${layer}:${key}`, slider);
      if (valueEl) valueEls.set(`${layer}:${key}`, valueEl);
      const initial = formatNoise01((state.noiseParams[layer]?.[key] ?? 0) * 100);
      slider.value = String(initial);
      if (valueEl) valueEl.value = String(initial);
      slider.addEventListener("input", () => {
        const ui = parseFloat(slider.value);
        if (valueEl) valueEl.value = String(ui);
        state.setNoiseLayerParam(layer, key, ui / 100);
      });
      if (valueEl) {
        valueEl.addEventListener("change", () => {
          const lo = parseFloat(slider.min);
          const hi = parseFloat(slider.max);
          let ui = parseFloat(valueEl.value);
          if (!Number.isFinite(ui)) ui = lo;
          ui = Math.max(lo, Math.min(hi, ui));
          slider.value = String(ui);
          valueEl.value = String(ui);
          state.setNoiseLayerParam(layer, key, ui / 100);
        });
      }
    }

    const typeSel = document.querySelector(
      `select[data-noise-layer="${layer}"][data-noise-key="type"]`,
    );
    if (typeSel) {
      typeSels.set(layer, typeSel);
      typeSel.value = state.noiseParams[layer]?.type || "simplex";
      typeSel.addEventListener("change", () => {
        state.setNoiseLayerParam(layer, "type", typeSel.value);
      });
    }

    const enableBox = document.querySelector(
      `input[data-noise-layer="${layer}"][data-noise-action="enable"]`,
    );
    if (enableBox) {
      enableBoxes.set(layer, enableBox);
      enableBox.checked = !!state.noiseParams[layer]?.enabled;
      enableBox.addEventListener("change", () => {
        state.setNoiseLayerEnabled(layer, enableBox.checked);
      });
    }
  }

  state.addEventListener("noise:changed", (e) => {
    const detail = e.detail;
    if (!detail) {
      syncAll();
      return;
    }
    const { layer, key } = detail;
    if (!layer) return;
    if (SLIDER_KEYS.includes(key)) {
      const slider = sliders.get(`${layer}:${key}`);
      const valueEl = valueEls.get(`${layer}:${key}`);
      if (slider) {
        const ui = formatNoise01((state.noiseParams[layer]?.[key] ?? 0) * 100);
        slider.value = String(ui);
        if (valueEl) valueEl.value = String(ui);
      }
    } else if (key === "type") {
      const sel = typeSels.get(layer);
      if (sel) sel.value = state.noiseParams[layer]?.type || "simplex";
    } else if (key === "enabled") {
      const box = enableBoxes.get(layer);
      if (box) box.checked = !!state.noiseParams[layer]?.enabled;
    }
  });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-noise-action]");
    if (!btn) return;
    e.preventDefault();
    const action = btn.dataset.noiseAction;
    const layer = btn.dataset.noiseLayer;
    if (!layer || !NOISE_LAYER_KEYS.includes(layer)) return;
    if (action === "reset-layer") {
      resetLayer(layer);
      return;
    }
    if (action === "random-layer") {
      randomLayer(layer);
      return;
    }
    const key = btn.dataset.noiseKey;
    if (!key || !NOISE_LAYER_PARAMS[key]) return;
    if (action === "reset") applyReset(layer, key);
  });

  function syncAll() {
    for (const layer of NOISE_LAYER_KEYS) {
      for (const key of SLIDER_KEYS) {
        const slider = sliders.get(`${layer}:${key}`);
        const valueEl = valueEls.get(`${layer}:${key}`);
        if (!slider) continue;
        const ui = formatNoise01((state.noiseParams[layer]?.[key] ?? 0) * 100);
        slider.value = String(ui);
        if (valueEl) valueEl.value = String(ui);
      }
      const sel = typeSels.get(layer);
      if (sel) sel.value = state.noiseParams[layer]?.type || "simplex";
      const box = enableBoxes.get(layer);
      if (box) box.checked = !!state.noiseParams[layer]?.enabled;
    }
  }
}

function applyReset(layer, key) {
  const spec = NOISE_LAYER_PARAMS[key];
  if (!spec) return;
  state.setNoiseLayerParam(layer, key, spec.default);
}

function applyRandom(layer, key) {
  const spec = NOISE_LAYER_PARAMS[key];
  if (!spec) return;
  if (spec.type === "enum") {
    const v = spec.values[Math.floor(Math.random() * spec.values.length)];
    state.setNoiseLayerParam(layer, key, v);
    return;
  }
  const min = typeof spec.min === "number" ? spec.min : 0;
  const max = typeof spec.max === "number" ? spec.max : 1;
  const v = min + Math.random() * (max - min);
  state.setNoiseLayerParam(layer, key, Math.round(v * 100000) / 100000);
}

function resetLayer(layer) {
  const defaults = defaultNoiseLayer();
  for (const key of Object.keys(defaults)) {
    state.setNoiseLayerParam(layer, key, defaults[key]);
  }
}

// Randomize the whole layer in one go (replaces the per-value 🎲). Touches the
// noise character params (type + density + scale + edgeFade) but not `enabled`.
function randomLayer(layer) {
  for (const key of Object.keys(NOISE_LAYER_PARAMS)) {
    applyRandom(layer, key);
  }
}

function formatNoise01(ui) {
  return Math.round(ui * 1000) / 1000;
}
