import { state }    from "./state.js";
import { settings } from "./storage.js";

const KEYS = {
  renderMode:       "renderMode",
  mapVisible:       "mapVisible",
  renderThrottle:   "renderThrottle",
  traceVisible:     "traceVisible",
  traceRecording:   "traceRecording",
  bundleOverrides:  "bundleOverrides",
  bundleAtlasPath:  "bundleAtlasPath",
  lastProjectId:    "lastProjectId",
};

const LEGACY_KEYS = ["renderFreeze", "noiseThrottle", "waveThrottle"];

// Must run before views init so sliders/radios start at the persisted value.
export function applySettingsToState() {
  const mode = settings.get(KEYS.renderMode);
  if (mode === "pixel" || mode === "smooth") state.setRenderMode(mode);

  const mapVisible = settings.get(KEYS.mapVisible);
  if (typeof mapVisible === "boolean") state.setMapVisible(mapVisible);

  const throttle = settings.get(KEYS.renderThrottle);
  if (typeof throttle === "boolean") state.setRenderThrottle(throttle);

  const traceVisible = settings.get(KEYS.traceVisible);
  if (typeof traceVisible === "boolean") state.setTraceVisible(traceVisible);

  const traceRecording = settings.get(KEYS.traceRecording);
  if (typeof traceRecording === "boolean") state.setTraceRecording(traceRecording);

  const bundleOverrides = settings.get(KEYS.bundleOverrides);
  if (bundleOverrides && typeof bundleOverrides === "object") state.loadBundleOverrides(bundleOverrides);

  const bundleAtlasPath = settings.get(KEYS.bundleAtlasPath);
  if (typeof bundleAtlasPath === "string") state.loadBundleAtlasPath(bundleAtlasPath);

  for (const k of LEGACY_KEYS) settings.remove(k);
  // Last release stored both flags under a single `tracing` key.
  settings.remove("tracing");
}

export function bindSettingsListeners() {
  state.addEventListener("render-mode:changed", () => {
    settings.set(KEYS.renderMode, state.renderMode);
  });
  state.addEventListener("map-visible:changed", () => {
    settings.set(KEYS.mapVisible, state.mapVisible);
  });
  state.addEventListener("render-throttle:changed", () => {
    settings.set(KEYS.renderThrottle, state.renderThrottle);
  });
  state.addEventListener("trace-visible:changed", () => {
    settings.set(KEYS.traceVisible, state.traceVisible);
  });
  state.addEventListener("trace-recording:changed", () => {
    settings.set(KEYS.traceRecording, state.traceRecording);
  });
  state.addEventListener("bundle-overrides:changed", () => {
    settings.set(KEYS.bundleOverrides, state.serializeBundleOverrides());
  });
  state.addEventListener("bundle-path:changed", () => {
    settings.set(KEYS.bundleAtlasPath, state.bundleAtlasPath);
  });
}

export function getLastProjectId() {
  return settings.get(KEYS.lastProjectId);
}

export function setLastProjectId(id) {
  const next = id == null ? null : id;
  if (next == null) settings.remove(KEYS.lastProjectId);
  else              settings.set(KEYS.lastProjectId, next);
  state.dispatchEvent(new CustomEvent("active-project:changed", { detail: next }));
}
