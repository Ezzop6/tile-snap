export function initExportConfigState(state) {
  // Sparse Map<slotIdx, { variantCount, ranges, variantOffsets }>; missing entries = defaults.
  state._exportConfig = new Map();
  state._exportVariantDirection = "smart";
  state._exportTargetAspect = 1.0;
  state._exportVariability = 0.1;
  state._exportShowIslands = true;
  // Coloured group markers on slots that have variants (+ their variant tiles).
  // App-wide UI pref (persisted via settings, NOT the project blob).
  state._exportShowGroups = true;
  state._exportLayoutView = "textures";
  state._exportIncludeSourceA = false;
  state._exportIncludeSourceB = false;
  // Master-biased pool randomize: master gets this share, variants split (1 - share).
  state._exportMasterShare = 0.75;
}

export function applyExportConfigMixin(StateClass) {
  StateClass.prototype.getExportVariantCount = function (slotIndex) {
    return this._exportConfig.get(slotIndex)?.variantCount ?? 1;
  };

  StateClass.prototype.setExportVariantCount = function (slotIndex, count) {
    const c = Math.max(1, Math.floor(count) || 1);
    const prev = this._exportConfig.get(slotIndex);
    if (c === 1) {
      if (!prev) return;
      const hasRanges = prev.ranges && Object.keys(prev.ranges).length > 0;
      if (!hasRanges) this._exportConfig.delete(slotIndex);
      else            this._exportConfig.set(slotIndex, { ...prev, variantCount: 1 });
    } else {
      if (prev && prev.variantCount === c) return;
      this._exportConfig.set(slotIndex, { ...(prev || {}), variantCount: c });
    }
    this.dispatchEvent(new CustomEvent("export-config:changed", { detail: slotIndex }));
  };

  StateClass.prototype.exportConfigEntries = function () {
    return this._exportConfig.entries();
  };

  StateClass.prototype.clearAllExportConfig = function () {
    if (this._exportConfig.size === 0) return;
    this._exportConfig.clear();
    this.dispatchEvent(new CustomEvent("export-config:changed", { detail: null }));
  };

  // Resize-safe key remap. Drops entries for removed slots.
  StateClass.prototype._remapExportConfig = function (remap) {
    if (this._exportConfig.size === 0) return;
    const next = new Map();
    for (const [oldIdx, val] of this._exportConfig) {
      const newIdx = remap.get(oldIdx);
      if (newIdx === undefined) continue;
      next.set(newIdx, val);
    }
    this._exportConfig = next;
    this.dispatchEvent(new CustomEvent("export-config:changed", { detail: null }));
  };

  StateClass.prototype.getExportRange = function (slotIndex, key) {
    return this._exportConfig.get(slotIndex)?.ranges?.[key] || null;
  };

  StateClass.prototype.setExportRange = function (slotIndex, key, dMin, dMax) {
    const lo = Math.min(dMin, dMax);
    const hi = Math.max(dMin, dMax);
    const prev = this._exportConfig.get(slotIndex);
    const ranges = { ...(prev?.ranges || {}) };
    const cur = ranges[key];
    if (cur && cur.dMin === lo && cur.dMax === hi) return;
    ranges[key] = { dMin: lo, dMax: hi };
    this._exportConfig.set(slotIndex, { ...(prev || { variantCount: 1 }), ranges });
    this.dispatchEvent(new CustomEvent("export-config:changed", { detail: slotIndex }));
  };

  StateClass.prototype.clearExportRange = function (slotIndex, key) {
    const prev = this._exportConfig.get(slotIndex);
    if (!prev?.ranges?.[key]) return;
    const ranges = { ...prev.ranges };
    delete ranges[key];
    const next = { ...prev, ranges };
    if ((next.variantCount ?? 1) === 1 && Object.keys(ranges).length === 0) {
      this._exportConfig.delete(slotIndex);
    } else {
      this._exportConfig.set(slotIndex, next);
    }
    this.dispatchEvent(new CustomEvent("export-config:changed", { detail: slotIndex }));
  };

  StateClass.prototype.getVariantSeedOffset = function (slotIndex, variantIdx) {
    return this._exportConfig.get(slotIndex)?.variantOffsets?.[variantIdx] || 0;
  };

  StateClass.prototype.setVariantSeedOffset = function (slotIndex, variantIdx, value) {
    const v = Math.trunc(value) | 0;
    const prev = this._exportConfig.get(slotIndex);
    const offsets = { ...(prev?.variantOffsets || {}) };
    if (v === 0) {
      if (!(variantIdx in offsets)) return;
      delete offsets[variantIdx];
    } else {
      if (offsets[variantIdx] === v) return;
      offsets[variantIdx] = v;
    }
    this._exportConfig.set(slotIndex, {
      ...(prev || { variantCount: 1 }),
      variantOffsets: offsets,
    });
    this.dispatchEvent(new CustomEvent("export-config:changed", { detail: slotIndex }));
  };

  StateClass.prototype.adjustVariantSeedOffset = function (slotIndex, variantIdx, delta) {
    const cur = this.getVariantSeedOffset(slotIndex, variantIdx);
    this.setVariantSeedOffset(slotIndex, variantIdx, cur + delta);
  };

  Object.defineProperty(StateClass.prototype, "exportVariability", {
    get() { return this._exportVariability; },
  });

  StateClass.prototype.setExportVariability = function (value) {
    const v = Math.max(0, Math.min(1, +value));
    if (!Number.isFinite(v) || v === this._exportVariability) return;
    this._exportVariability = v;
    this.dispatchEvent(new CustomEvent("export-variability:changed", { detail: v }));
  };

  Object.defineProperty(StateClass.prototype, "exportMasterShare", {
    get() { return this._exportMasterShare; },
  });

  StateClass.prototype.setExportMasterShare = function (value) {
    const v = Math.max(0, Math.min(1, +value));
    if (!Number.isFinite(v) || v === this._exportMasterShare) return;
    this._exportMasterShare = v;
    this.dispatchEvent(new CustomEvent("export-master-share:changed", { detail: v }));
  };

  Object.defineProperty(StateClass.prototype, "exportShowIslands", {
    get() { return this._exportShowIslands; },
  });

  StateClass.prototype.setExportShowIslands = function (value) {
    const v = !!value;
    if (v === this._exportShowIslands) return;
    this._exportShowIslands = v;
    this.dispatchEvent(new CustomEvent("export-show-islands:changed", { detail: v }));
  };

  Object.defineProperty(StateClass.prototype, "exportShowGroups", {
    get() { return this._exportShowGroups; },
  });

  StateClass.prototype.setExportShowGroups = function (value) {
    const v = !!value;
    if (v === this._exportShowGroups) return;
    this._exportShowGroups = v;
    this.dispatchEvent(new CustomEvent("export-show-groups:changed", { detail: v }));
  };

  Object.defineProperty(StateClass.prototype, "exportLayoutView", {
    get() { return this._exportLayoutView; },
  });

  StateClass.prototype.setExportLayoutView = function (value) {
    const v = value === "textures" ? "textures" : "cuts";
    if (v === this._exportLayoutView) return;
    this._exportLayoutView = v;
    this.dispatchEvent(new CustomEvent("export-layout-view:changed", { detail: v }));
  };

  Object.defineProperty(StateClass.prototype, "exportIncludeSourceA", {
    get() { return this._exportIncludeSourceA; },
  });
  Object.defineProperty(StateClass.prototype, "exportIncludeSourceB", {
    get() { return this._exportIncludeSourceB; },
  });

  StateClass.prototype.setExportIncludeSourceA = function (value) {
    const v = !!value;
    if (v === this._exportIncludeSourceA) return;
    this._exportIncludeSourceA = v;
    this.dispatchEvent(new CustomEvent("export-include-sources:changed", { detail: { key: "A", value: v } }));
  };

  StateClass.prototype.setExportIncludeSourceB = function (value) {
    const v = !!value;
    if (v === this._exportIncludeSourceB) return;
    this._exportIncludeSourceB = v;
    this.dispatchEvent(new CustomEvent("export-include-sources:changed", { detail: { key: "B", value: v } }));
  };

  Object.defineProperty(StateClass.prototype, "exportVariantDirection", {
    get() { return this._exportVariantDirection; },
  });

  StateClass.prototype.setExportVariantDirection = function (direction) {
    const v = direction === "right" ? "right"
            : direction === "down"  ? "down"
            : "smart";
    if (v === this._exportVariantDirection) return;
    this._exportVariantDirection = v;
    this.dispatchEvent(new CustomEvent("export-direction:changed", { detail: v }));
  };

  Object.defineProperty(StateClass.prototype, "exportTargetAspect", {
    get() { return this._exportTargetAspect; },
  });

  StateClass.prototype.setExportTargetAspect = function (value) {
    const v = Math.max(0.25, Math.min(4, +value));
    if (!Number.isFinite(v) || v === this._exportTargetAspect) return;
    this._exportTargetAspect = v;
    this.dispatchEvent(new CustomEvent("export-aspect:changed", { detail: v }));
  };
}
