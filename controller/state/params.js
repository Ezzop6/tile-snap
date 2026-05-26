import { defaultGlobalCurve } from "../../core/curve_params.js";
import { defaultNoiseParams, DEFAULT_SEED, SEED_MIN, SEED_MAX } from "../../core/noise_params.js";
import { buildOpDefaults } from "../../view/render2/textureOps/registry.js";

export function initParamsState(state) {
  state._projectName = "untitled";
  state._globalCurve = defaultGlobalCurve();
  state._noiseParams = defaultNoiseParams();
  // Global texture pipeline ops, per pool. Schema lives in
  // view/render2/textureOps/registry.js — single source of truth that
  // drives state defaults, slotComposite chain, and texOpsPanel UI.
  state._globalTextureOps = { A: buildOpDefaults(), B: buildOpDefaults() };
  state._mapVisible = true;
  state._seed = DEFAULT_SEED;
  // Global throttle for the heavy ops (noise + wave). ON (default) SKIPS both
  // while a slider/handle is being dragged (interactionGate), then re-renders
  // full quality on pointerup, so dragging stays responsive. OFF runs both ops
  // every refresh (= live during drag but heavier/choppier).
  state._renderThrottle = true;
  // Pipeline trace: two independent toggles.
  //   _traceVisible   = overlay shown / hidden (centred on screen)
  //   _traceRecording = whether core/trace actually accumulates timings
  // Independent so the user can hide the panel without losing the running
  // recording, or record in the background without on-screen clutter.
  state._traceVisible   = false;
  state._traceRecording = false;
}

export function applyParamsMixin(StateClass) {
  Object.defineProperty(StateClass.prototype, "globalCurve", {
    get() { return this._globalCurve; },
  });

  StateClass.prototype.setGlobalCurveParam = function (key, value) {
    if (!(key in this._globalCurve)) return;
    if (this._globalCurve[key] === value) return;
    this._globalCurve[key] = value;
    this.dispatchEvent(new CustomEvent("global-curve:changed", { detail: key }));
  };

  Object.defineProperty(StateClass.prototype, "noiseParams", {
    get() { return this._noiseParams; },
  });

  Object.defineProperty(StateClass.prototype, "globalTextureOps", {
    get() { return this._globalTextureOps; },
  });

  StateClass.prototype.getGlobalTextureOp = function (poolKey, opName) {
    if (poolKey !== "A" && poolKey !== "B") return null;
    return this._globalTextureOps?.[poolKey]?.[opName] || null;
  };

  StateClass.prototype.setGlobalTextureOpParam = function (poolKey, opName, key, value) {
    if (poolKey !== "A" && poolKey !== "B") return;
    const op = this._globalTextureOps?.[poolKey]?.[opName];
    if (!op || !(key in op)) return;
    if (op[key] === value) return;
    op[key] = value;
    this.dispatchEvent(new CustomEvent("texture-ops:changed", { detail: { poolKey, op: opName, key } }));
  };

  StateClass.prototype.setNoiseLayerParam = function (layer, key, value) {
    const obj = this._noiseParams?.[layer];
    if (!obj || !(key in obj)) return;
    if (obj[key] === value) return;
    obj[key] = value;
    this.dispatchEvent(new CustomEvent("noise:changed", { detail: { layer, key } }));
  };

  StateClass.prototype.setNoiseLayerEnabled = function (layer, enabled) {
    this.setNoiseLayerParam(layer, "enabled", !!enabled);
  };

  // Both export PNG and live preview render at this size so they stay pixel-identical.
  Object.defineProperty(StateClass.prototype, "nativeSlotSize", {
    get() {
      let size = 0;
      for (const key of ["A", "B"]) {
        for (const ref of this._pools[key]) {
          const inp = this._inputs.find((i) => i.id === ref.inputId);
          if (inp && inp.tileSize > size) size = inp.tileSize;
        }
      }
      return size || 64;
    },
  });

  Object.defineProperty(StateClass.prototype, "seed", {
    get() { return this._seed; },
  });

  StateClass.prototype.setSeed = function (value) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) return;
    const clamped = Math.max(SEED_MIN, Math.min(SEED_MAX, n));
    if (clamped === this._seed) return;
    this._seed = clamped;
    this.dispatchEvent(new CustomEvent("seed:changed", { detail: clamped }));
  };

  Object.defineProperty(StateClass.prototype, "renderThrottle", {
    get() { return this._renderThrottle; },
  });

  StateClass.prototype.setRenderThrottle = function (v) {
    const b = !!v;
    if (this._renderThrottle === b) return;
    this._renderThrottle = b;
    this.dispatchEvent(new CustomEvent("render-throttle:changed", { detail: b }));
    // Force a re-render so the user immediately sees the on/off effect for
    // both gated ops.
    this.dispatchEvent(new CustomEvent("noise:changed", { detail: null }));
    this.dispatchEvent(new CustomEvent("global-curve:changed", { detail: null }));
  };

  Object.defineProperty(StateClass.prototype, "traceVisible", {
    get() { return this._traceVisible; },
  });
  StateClass.prototype.setTraceVisible = function (v) {
    const b = !!v;
    if (this._traceVisible === b) return;
    this._traceVisible = b;
    this.dispatchEvent(new CustomEvent("trace-visible:changed", { detail: b }));
  };

  Object.defineProperty(StateClass.prototype, "traceRecording", {
    get() { return this._traceRecording; },
  });
  StateClass.prototype.setTraceRecording = function (v) {
    const b = !!v;
    if (this._traceRecording === b) return;
    this._traceRecording = b;
    this.dispatchEvent(new CustomEvent("trace-recording:changed", { detail: b }));
  };

  Object.defineProperty(StateClass.prototype, "mapVisible", {
    get() { return this._mapVisible; },
  });

  StateClass.prototype.setMapVisible = function (visible) {
    const v = !!visible;
    if (this._mapVisible === v) return;
    this._mapVisible = v;
    this.dispatchEvent(new CustomEvent("map-visible:changed", { detail: v }));
  };

  Object.defineProperty(StateClass.prototype, "projectName", {
    get() { return this._projectName; },
  });

  StateClass.prototype.setProjectName = function (name) {
    const trimmed = String(name ?? "").trim() || "untitled";
    if (this._projectName === trimmed) return;
    this._projectName = trimmed;
    this.dispatchEvent(new CustomEvent("project-name:changed", { detail: trimmed }));
  };
}
