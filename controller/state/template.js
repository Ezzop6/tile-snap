export function initTemplateState(state) {
  state._template = null;
  state._selectedSlotIndex = null;
  state._tileOffsets = new Map(); // Map<slotIndex, Record<pointKey, {dx,dy}>>
  state._cutBowOverrides = new Map(); // Map<slotIndex, Record<connId, bowProportion>>
  state._slotCutTransform = new Map(); // Map<slotIndex, {rotate, flipH}>
  // Per-variant CUT transform override. Map<slotIndex, Map<variantIdx, {rotate,flipH}>>.
  // Absent variant entry = inherit the slot's (master) cut transform.
  state._variantCutTransform = new Map();
  state._slotTextureTransform = new Map(); // Map<slotIndex, {rotate, flipH}>
  state._templateDirty = false;
}

export function applyTemplateMixin(StateClass) {
  Object.defineProperty(StateClass.prototype, "template", {
    get() { return this._template; },
  });

  Object.defineProperty(StateClass.prototype, "templateDirty", {
    get() { return this._templateDirty; },
  });

  StateClass.prototype.isTemplateDirty = function () {
    return this._templateDirty;
  };

  // Full template switch: wipes slot-keyed maps + clears dirty. Used by dropdown.
  // Each mixin owns the clear-all method for its own slot-keyed state — adding a
  // new slot-keyed map (e.g. heal/mirror) only needs that mixin's clearAll exposed
  // here, not direct knowledge of its internals.
  StateClass.prototype.setTemplate = function (template) {
    if (this._template === template) return;
    this._template = template;
    if (this._selectedSlotIndex !== null) {
      this._selectedSlotIndex = null;
      this.dispatchEvent(new CustomEvent("slot-selection:changed", { detail: null }));
    }
    this.clearAllTileOffsets();
    this.clearAllCutBowOverrides();
    this.clearAllSlotCutTransforms();
    this.clearAllVariantCutTransforms();
    this.clearAllSlotTextureTransforms();
    this.clearAllExportConfig();
    this.clearAllSlotPoolOverrides();
    this.clearAllVariantPoolOverrides();
    const wasDirty = this._templateDirty;
    this._templateDirty = false;
    this.dispatchEvent(new CustomEvent("template:changed", { detail: template }));
    if (wasDirty) {
      this.dispatchEvent(new CustomEvent("template-dirty:changed", { detail: false }));
    }
  };

  // Swap ref without wiping slot-keyed maps. For builtin→copy where layout
  // is identical, and for in-place rewrites that produce a new object ref.
  // Caller owns the dirty marker (set explicitly via markTemplateDirty/Clean).
  StateClass.prototype.replaceTemplate = function (template) {
    if (this._template === template) return;
    this._template = template;
    this.dispatchEvent(new CustomEvent("template:changed", { detail: template }));
  };

  // In-place refresh after re-save (same id, same layout) keeps per-slot work; layout change falls through to setTemplate.
  StateClass.prototype.refreshTemplate = function (template) {
    if (!template) return;
    const old = this._template;
    if (!old || old.id !== template.id
        || old.rows !== template.rows
        || old.cols !== template.cols) {
      this.setTemplate(template);
      return;
    }
    this._template = template;
    this.dispatchEvent(new CustomEvent("template:changed", { detail: template }));
  };

  // For in-place mutations (paint, rename) — re-emits without ref swap. Callers
  // mutate this._template directly then call this.
  StateClass.prototype.notifyTemplateChanged = function () {
    if (!this._template) return;
    this.dispatchEvent(new CustomEvent("template:changed", { detail: this._template }));
  };

  StateClass.prototype.markTemplateDirty = function () {
    if (this._templateDirty) return;
    this._templateDirty = true;
    this.dispatchEvent(new CustomEvent("template-dirty:changed", { detail: true }));
  };

  StateClass.prototype.markTemplateClean = function () {
    if (!this._templateDirty) return;
    this._templateDirty = false;
    this.dispatchEvent(new CustomEvent("template-dirty:changed", { detail: false }));
  };

  Object.defineProperty(StateClass.prototype, "selectedSlotIndex", {
    get() { return this._selectedSlotIndex; },
  });

  StateClass.prototype.selectSlot = function (slotIndex) {
    if (this._selectedSlotIndex === slotIndex) return;
    this._selectedSlotIndex = slotIndex;
    this.dispatchEvent(new CustomEvent("slot-selection:changed", { detail: slotIndex }));
  };

  StateClass.prototype.clearSlotSelection = function () {
    if (this._selectedSlotIndex === null) return;
    this._selectedSlotIndex = null;
    this.dispatchEvent(new CustomEvent("slot-selection:changed", { detail: null }));
  };

  StateClass.prototype.getTileOffsets = function (slotIndex) {
    return this._tileOffsets.get(slotIndex) || {};
  };

  StateClass.prototype.setTileOffset = function (slotIndex, pointKey, dx, dy) {
    let map = this._tileOffsets.get(slotIndex);
    if (!map) {
      map = {};
      this._tileOffsets.set(slotIndex, map);
    }
    const prev = map[pointKey];
    if (prev && prev.dx === dx && prev.dy === dy) return;
    map[pointKey] = { dx, dy };
    this.dispatchEvent(new CustomEvent("tile-offsets:changed", { detail: slotIndex }));
  };

  StateClass.prototype.clearTileOffset = function (slotIndex, pointKey) {
    const map = this._tileOffsets.get(slotIndex);
    if (!map || !(pointKey in map)) return;
    delete map[pointKey];
    if (Object.keys(map).length === 0) this._tileOffsets.delete(slotIndex);
    this.dispatchEvent(new CustomEvent("tile-offsets:changed", { detail: slotIndex }));
  };

  StateClass.prototype.clearTileOffsetsForSlot = function (slotIndex) {
    if (!this._tileOffsets.has(slotIndex)) return;
    this._tileOffsets.delete(slotIndex);
    this.dispatchEvent(new CustomEvent("tile-offsets:changed", { detail: slotIndex }));
  };

  StateClass.prototype.clearAllTileOffsets = function () {
    if (this._tileOffsets.size === 0) return;
    this._tileOffsets.clear();
    this.dispatchEvent(new CustomEvent("tile-offsets:changed", { detail: null }));
  };

  // Per-slot bow overrides for cut connections. Keyed by stable conn IDs
  // so they survive graph rebuilds; consumed by buildSlotGraph after the
  // ops pipeline so user-set bows replace cornerSoften's defaults.
  StateClass.prototype.getCutBowOverrides = function (slotIndex) {
    return this._cutBowOverrides.get(slotIndex) || {};
  };

  StateClass.prototype.setCutBowOverride = function (slotIndex, connId, bow) {
    let map = this._cutBowOverrides.get(slotIndex);
    if (!map) {
      map = {};
      this._cutBowOverrides.set(slotIndex, map);
    }
    if (map[connId] === bow) return;
    map[connId] = bow;
    this.dispatchEvent(new CustomEvent("tile-offsets:changed", { detail: slotIndex }));
  };

  StateClass.prototype.clearCutBowOverride = function (slotIndex, connId) {
    const map = this._cutBowOverrides.get(slotIndex);
    if (!map || !(connId in map)) return;
    delete map[connId];
    if (Object.keys(map).length === 0) this._cutBowOverrides.delete(slotIndex);
    this.dispatchEvent(new CustomEvent("tile-offsets:changed", { detail: slotIndex }));
  };

  StateClass.prototype.clearCutBowOverridesForSlot = function (slotIndex) {
    if (!this._cutBowOverrides.has(slotIndex)) return;
    this._cutBowOverrides.delete(slotIndex);
    this.dispatchEvent(new CustomEvent("tile-offsets:changed", { detail: slotIndex }));
  };

  StateClass.prototype.clearAllCutBowOverrides = function () {
    if (this._cutBowOverrides.size === 0) return;
    this._cutBowOverrides.clear();
    this.dispatchEvent(new CustomEvent("tile-offsets:changed", { detail: null }));
  };

  // Per-slot CUT geometry transform (D4 group). Project-level modifier
  // sitting alongside tileOffsets / cutBowOverrides — the TEMPLATE itself
  // stays untouched. Pipeline (buildSlotGraph.applySlotCutTransform) reads
  // via getSlotCutTransform and applies as the very last op so cut, noise
  // and merged-cut chains transform together.
  StateClass.prototype.getSlotCutTransform = function (slotIndex) {
    return this._slotCutTransform.get(slotIndex) || null;
  };

  StateClass.prototype.setSlotCutTransform = function (slotIndex, value) {
    if (slotIndex == null) return;
    const rotate = value ? (((value.rotate | 0) % 4) + 4) % 4 : 0;
    const flipH  = !!value?.flipH;
    const isIdentity = rotate === 0 && !flipH;
    const prev = this._slotCutTransform.get(slotIndex);
    if (isIdentity) {
      if (!prev) return;
      this._slotCutTransform.delete(slotIndex);
    } else {
      if (prev && prev.rotate === rotate && prev.flipH === flipH) return;
      this._slotCutTransform.set(slotIndex, { rotate, flipH });
    }
    this.dispatchEvent(new CustomEvent("slot-cut-transform:changed", { detail: slotIndex }));
  };

  StateClass.prototype.clearSlotCutTransform = function (slotIndex) {
    if (!this._slotCutTransform.has(slotIndex)) return;
    this._slotCutTransform.delete(slotIndex);
    this.dispatchEvent(new CustomEvent("slot-cut-transform:changed", { detail: slotIndex }));
  };

  StateClass.prototype.clearAllSlotCutTransforms = function () {
    if (this._slotCutTransform.size === 0) return;
    this._slotCutTransform.clear();
    this.dispatchEvent(new CustomEvent("slot-cut-transform:changed", { detail: null }));
  };

  // Per-variant CUT transform. null = inherit master (getSlotCutTransform).
  // Symmetry gating is identical to master (depends only on slot.array, which
  // variants share). Stored as an ABSOLUTE D4; storing a value that equals the
  // master clears the override so the variant just inherits — keeps it clean
  // AND still lets you force a variant to identity when the master is flipped.
  StateClass.prototype.getVariantCutTransform = function (slotIndex, variantIdx) {
    return this._variantCutTransform.get(slotIndex)?.get(variantIdx) || null;
  };

  // Effective transform actually rendered for a variant: its override, else master.
  StateClass.prototype.effectiveVariantCutTransform = function (slotIndex, variantIdx) {
    return this.getVariantCutTransform(slotIndex, variantIdx)
      || this.getSlotCutTransform(slotIndex);
  };

  StateClass.prototype.setVariantCutTransform = function (slotIndex, variantIdx, value) {
    if (slotIndex == null || variantIdx == null) return;
    const rotate = value ? (((value.rotate | 0) % 4) + 4) % 4 : 0;
    const flipH  = !!value?.flipH;
    const master = this.getSlotCutTransform(slotIndex);
    const matchesMaster = rotate === (((master?.rotate | 0) % 4) + 4) % 4 && flipH === !!master?.flipH;
    let perSlot = this._variantCutTransform.get(slotIndex);
    if (matchesMaster) {
      if (!perSlot?.has(variantIdx)) return;
      perSlot.delete(variantIdx);
      if (perSlot.size === 0) this._variantCutTransform.delete(slotIndex);
    } else {
      const prev = perSlot?.get(variantIdx);
      if (prev && prev.rotate === rotate && prev.flipH === flipH) return;
      if (!perSlot) { perSlot = new Map(); this._variantCutTransform.set(slotIndex, perSlot); }
      perSlot.set(variantIdx, { rotate, flipH });
    }
    this.dispatchEvent(new CustomEvent("variant-cut-transform:changed", { detail: { slotIndex, variantIdx } }));
  };

  StateClass.prototype.clearVariantCutTransform = function (slotIndex, variantIdx) {
    const perSlot = this._variantCutTransform.get(slotIndex);
    if (!perSlot?.has(variantIdx)) return;
    perSlot.delete(variantIdx);
    if (perSlot.size === 0) this._variantCutTransform.delete(slotIndex);
    this.dispatchEvent(new CustomEvent("variant-cut-transform:changed", { detail: { slotIndex, variantIdx } }));
  };

  StateClass.prototype.clearAllVariantCutTransforms = function () {
    if (this._variantCutTransform.size === 0) return;
    this._variantCutTransform.clear();
    this.dispatchEvent(new CustomEvent("variant-cut-transform:changed", { detail: null }));
  };

  // Per-slot TEXTURE transform (D4), independent per pool (A and B).
  // Map<slotIdx, { A?: {rotate, flipH}, B?: {rotate, flipH} }>. No gating.
  StateClass.prototype.getSlotTextureTransform = function (slotIndex, poolKey) {
    if (poolKey !== "A" && poolKey !== "B") return null;
    const entry = this._slotTextureTransform.get(slotIndex);
    return entry?.[poolKey] || null;
  };

  StateClass.prototype.setSlotTextureTransform = function (slotIndex, poolKey, value) {
    if (slotIndex == null || (poolKey !== "A" && poolKey !== "B")) return;
    const rotate = value ? (((value.rotate | 0) % 4) + 4) % 4 : 0;
    const flipH  = !!value?.flipH;
    const isIdentity = rotate === 0 && !flipH;
    let entry = this._slotTextureTransform.get(slotIndex);
    if (isIdentity) {
      if (!entry || !entry[poolKey]) return;
      delete entry[poolKey];
      if (!entry.A && !entry.B) this._slotTextureTransform.delete(slotIndex);
    } else {
      const prev = entry?.[poolKey];
      if (prev && prev.rotate === rotate && prev.flipH === flipH) return;
      if (!entry) {
        entry = {};
        this._slotTextureTransform.set(slotIndex, entry);
      }
      entry[poolKey] = { rotate, flipH };
    }
    this.dispatchEvent(new CustomEvent("slot-texture-transform:changed", { detail: { slotIndex, poolKey } }));
  };

  // Clears BOTH pools for the given slot (used by per-slot Reset).
  StateClass.prototype.clearSlotTextureTransform = function (slotIndex) {
    if (!this._slotTextureTransform.has(slotIndex)) return;
    this._slotTextureTransform.delete(slotIndex);
    this.dispatchEvent(new CustomEvent("slot-texture-transform:changed", { detail: { slotIndex } }));
  };

  StateClass.prototype.clearAllSlotTextureTransforms = function () {
    if (this._slotTextureTransform.size === 0) return;
    this._slotTextureTransform.clear();
    this.dispatchEvent(new CustomEvent("slot-texture-transform:changed", { detail: null }));
  };

  // Resize-safe slot-keyed map remap. Old slot.index → new slot.index.
  // Entries NOT present in `remap` are dropped (= slot removed by resize).
  // Each mixin owns its remap helper; this is just the orchestrator.
  StateClass.prototype.remapSlotKeyedIndices = function (remap) {
    if (!remap || remap.size === 0) return;
    this._remapTileOffsets(remap);
    this._remapCutBowOverrides(remap);
    this._remapSlotCutTransform(remap);
    this._remapVariantCutTransform(remap);
    this._remapSlotTextureTransform(remap);
    this._remapSlotPoolOverride(remap);
    this._remapVariantPoolOverride(remap);
    this._remapExportConfig(remap);
    // Selection follows the slot to its new index, OR clears if the slot
    // was dropped (resize-row-/col- removes slots not present in remap).
    if (this._selectedSlotIndex !== null) {
      const next = remap.get(this._selectedSlotIndex);
      if (next === undefined) {
        this._selectedSlotIndex = null;
        this.dispatchEvent(new CustomEvent("slot-selection:changed", { detail: null }));
      } else if (next !== this._selectedSlotIndex) {
        this._selectedSlotIndex = next;
        this.dispatchEvent(new CustomEvent("slot-selection:changed", { detail: next }));
      }
    }
  };

  StateClass.prototype._remapTileOffsets = function (remap) {
    if (this._tileOffsets.size === 0) return;
    this._tileOffsets = remapKeys(this._tileOffsets, remap);
    this.dispatchEvent(new CustomEvent("tile-offsets:changed", { detail: null }));
  };

  StateClass.prototype._remapCutBowOverrides = function (remap) {
    if (this._cutBowOverrides.size === 0) return;
    this._cutBowOverrides = remapKeys(this._cutBowOverrides, remap);
    this.dispatchEvent(new CustomEvent("tile-offsets:changed", { detail: null }));
  };

  StateClass.prototype._remapSlotCutTransform = function (remap) {
    if (this._slotCutTransform.size === 0) return;
    this._slotCutTransform = remapKeys(this._slotCutTransform, remap);
    this.dispatchEvent(new CustomEvent("slot-cut-transform:changed", { detail: null }));
  };

  // remapKeys rewrites the outer slot key; the inner Map<variantIdx,…> rides along.
  StateClass.prototype._remapVariantCutTransform = function (remap) {
    if (this._variantCutTransform.size === 0) return;
    this._variantCutTransform = remapKeys(this._variantCutTransform, remap);
    this.dispatchEvent(new CustomEvent("variant-cut-transform:changed", { detail: null }));
  };

  StateClass.prototype._remapSlotTextureTransform = function (remap) {
    if (this._slotTextureTransform.size === 0) return;
    this._slotTextureTransform = remapKeys(this._slotTextureTransform, remap);
    this.dispatchEvent(new CustomEvent("slot-texture-transform:changed", { detail: null }));
  };
}

// Drop entries whose old key has no new key in remap; rewrite the rest.
function remapKeys(map, remap) {
  const next = new Map();
  for (const [oldKey, val] of map) {
    const newKey = remap.get(oldKey);
    if (newKey === undefined) continue;
    next.set(newKey, val);
  }
  return next;
}
