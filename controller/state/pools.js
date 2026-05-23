// Pool A/B: ordered TileRef lists. Index 0 = master (default everywhere); >=1 = export variants.
export function initPoolsState(state) {
  state._pools = { A: [], B: [] };
  state._poolWeights = { A: [], B: [] };
  state._poolNames   = { A: "", B: "" };
  state._slotPoolOverride = new Map();
  state._variantPoolOverride = new Map();
}

export function applyPoolsMixin(StateClass) {
  StateClass.prototype.pool = function (key) {
    return this._pools[key] || [];
  };
  StateClass.prototype.master = function (key) {
    return this._pools[key]?.[0] || null;
  };
  StateClass.prototype.poolAt = function (key, index) {
    const p = this._pools[key];
    return (p && index >= 0 && index < p.length) ? p[index] : null;
  };
  StateClass.prototype.poolWeight = function (key, index) {
    const w = this._poolWeights[key];
    return (w && index >= 0 && index < w.length) ? w[index] : 0;
  };

  // Project-level terrain identity for the pool (= what the Godot
  // terrain_set's terrain will be called). Empty string = fallback to the
  // master tile's input filename, matching legacy behaviour.
  StateClass.prototype.poolName = function (key) {
    return this._poolNames?.[key] ?? "";
  };

  StateClass.prototype.setPoolName = function (key, value) {
    if (key !== "A" && key !== "B") return;
    const v = String(value ?? "").trim();
    if (this._poolNames[key] === v) return;
    this._poolNames[key] = v;
    this.dispatchEvent(new CustomEvent("pool-names:changed", { detail: key }));
  };

  // Duplicates rejected: same tile twice would just bias the random pick without adding variety.
  StateClass.prototype.addToPool = function (key, inputId, tileCol, tileRow) {
    if (key !== "A" && key !== "B") return;
    const pool = this._pools[key];
    if (pool.some((r) => r.inputId === inputId && r.tileCol === tileCol && r.tileRow === tileRow)) return;
    pool.push({ inputId, tileCol, tileRow });
    this._equalizeWeights(key);
    this.dispatchEvent(new CustomEvent("pools:changed", { detail: key }));
    this.dispatchEvent(new CustomEvent("pool-weights:changed", { detail: key }));
  };

  StateClass.prototype.clearPool = function (key) {
    if (key !== "A" && key !== "B") return;
    if (this._pools[key].length === 0) return;
    this._pools[key] = [];
    this._poolWeights[key] = [];
    for (const [slotIdx, ov] of this._slotPoolOverride) {
      ov[key] = null;
      if (ov.A == null && ov.B == null) this._slotPoolOverride.delete(slotIdx);
    }
    for (const [slotIdx, perSlot] of this._variantPoolOverride) {
      for (const [v, ov] of perSlot) {
        ov[key] = null;
        if (ov.A == null && ov.B == null) perSlot.delete(v);
      }
      if (perSlot.size === 0) this._variantPoolOverride.delete(slotIdx);
    }
    this.dispatchEvent(new CustomEvent("pools:changed", { detail: key }));
    this.dispatchEvent(new CustomEvent("pool-weights:changed", { detail: key }));
    this.dispatchEvent(new CustomEvent("slot-pool-override:changed", { detail: null }));
    this.dispatchEvent(new CustomEvent("variant-pool-override:changed", { detail: null }));
  };

  // Slot/variant overrides shift with the array; an override pointing at the removed index resets to null.
  StateClass.prototype.removeFromPool = function (key, index) {
    const pool    = this._pools[key];
    const weights = this._poolWeights[key];
    if (!pool || index < 0 || index >= pool.length) return;
    pool.splice(index, 1);
    weights.splice(index, 1);
    const shift = (ov) => {
      const cur = ov[key];
      if (cur == null) return;
      if (cur === index) ov[key] = null;
      else if (cur > index) ov[key] = cur - 1;
    };
    for (const [slotIdx, ov] of this._slotPoolOverride) {
      shift(ov);
      if (ov.A == null && ov.B == null) this._slotPoolOverride.delete(slotIdx);
    }
    for (const [slotIdx, perSlot] of this._variantPoolOverride) {
      for (const [v, ov] of perSlot) {
        shift(ov);
        if (ov.A == null && ov.B == null) perSlot.delete(v);
      }
      if (perSlot.size === 0) this._variantPoolOverride.delete(slotIdx);
    }
    this._equalizeWeights(key);
    this.dispatchEvent(new CustomEvent("pools:changed", { detail: key }));
    this.dispatchEvent(new CustomEvent("pool-weights:changed", { detail: key }));
    this.dispatchEvent(new CustomEvent("slot-pool-override:changed", { detail: null }));
    this.dispatchEvent(new CustomEvent("variant-pool-override:changed", { detail: null }));
  };

  StateClass.prototype.setPoolItemRef = function (key, index, inputId, tileCol, tileRow) {
    const pool = this._pools[key];
    if (!pool || index < 0 || index >= pool.length) return;
    pool[index] = { inputId, tileCol, tileRow };
    this.dispatchEvent(new CustomEvent("pools:changed", { detail: key }));
  };

  // Weights are 0..1 (matches Godot's TileData.probability convention).
  StateClass.prototype.setPoolWeight = function (key, index, value) {
    const w = this._poolWeights[key];
    if (!w || index < 0 || index >= w.length) return;
    const n = Math.max(0, Math.min(1, Number(value) || 0));
    if (w[index] === n) return;
    w[index] = n;
    this.dispatchEvent(new CustomEvent("pool-weights:changed", { detail: key }));
  };

  // Master-biased random: master keeps state.exportMasterShare (default 0.75),
  // the remaining (1 - share) splits randomly among the variants. "Mostly
  // master, occasional variant" matches typical tile-art workflows where
  // the master is the primary look and variants are subtle breakups.
  StateClass.prototype.randomizePoolWeights = function (key) {
    const w = this._poolWeights[key];
    if (!w || w.length === 0) return;
    if (w.length === 1) { w[0] = 1; }
    else {
      const share = Math.max(0, Math.min(1, this._exportMasterShare ?? 0.75));
      w[0] = share;
      const variantBudget = 1 - share;
      const raw = [];
      let total = 0;
      for (let i = 1; i < w.length; i++) {
        const r = Math.random() + 0.0001;
        raw.push(r);
        total += r;
      }
      for (let i = 1; i < w.length; i++) {
        w[i] = Math.max(0, Math.min(1, (raw[i - 1] / total) * variantBudget));
      }
    }
    this.dispatchEvent(new CustomEvent("pool-weights:changed", { detail: key }));
  };

  // Default after add/remove: master 1.0, rest 0.
  StateClass.prototype._equalizeWeights = function (key) {
    const w = this._poolWeights[key];
    const n = this._pools[key].length;
    w.length = n;
    if (n === 0) return;
    for (let i = 0; i < n; i++) {
      w[i] = (i === 0) ? 1 : 0;
    }
  };

  StateClass.prototype._dropPoolRefsForInput = function (key, inputId) {
    this._dropPoolEntriesIf(key, (ref) => ref.inputId === inputId);
  };

  StateClass.prototype._dropPoolEntriesIf = function (key, predicate) {
    const pool    = this._pools[key];
    const weights = this._poolWeights[key];
    const indexMap = [];
    const newPool = [];
    const newWeights = [];
    for (let i = 0; i < pool.length; i++) {
      if (predicate(pool[i])) {
        indexMap.push(-1);
      } else {
        indexMap.push(newPool.length);
        newPool.push(pool[i]);
        newWeights.push(weights[i] ?? 1);
      }
    }
    if (newPool.length === pool.length) return;
    this._pools[key]       = newPool;
    this._poolWeights[key] = newWeights;
    const remap = (ov) => {
      const cur = ov[key];
      if (cur == null) return false;
      const next = indexMap[cur] ?? -1;
      ov[key] = next < 0 ? null : next;
      return true;
    };
    for (const [slotIdx, ov] of this._slotPoolOverride) {
      if (!remap(ov)) continue;
      if (ov.A == null && ov.B == null) this._slotPoolOverride.delete(slotIdx);
    }
    for (const [slotIdx, perSlot] of this._variantPoolOverride) {
      for (const [v, ov] of perSlot) {
        if (!remap(ov)) continue;
        if (ov.A == null && ov.B == null) perSlot.delete(v);
      }
      if (perSlot.size === 0) this._variantPoolOverride.delete(slotIdx);
    }
    this.dispatchEvent(new CustomEvent("pools:changed", { detail: key }));
    this.dispatchEvent(new CustomEvent("pool-weights:changed", { detail: key }));
    this.dispatchEvent(new CustomEvent("slot-pool-override:changed", { detail: null }));
    this.dispatchEvent(new CustomEvent("variant-pool-override:changed", { detail: null }));
  };

  StateClass.prototype.getSlotPoolOverride = function (slotIndex) {
    return this._slotPoolOverride.get(slotIndex) || { A: null, B: null };
  };

  StateClass.prototype.setSlotPoolOverride = function (slotIndex, key, value) {
    if (key !== "A" && key !== "B") return;
    const cur = this._slotPoolOverride.get(slotIndex) || { A: null, B: null };
    // Index 0 = master = no-override fallback. Collapse to null so the dropdown
    // (which only enumerates variants >= 1) can show "master (default)".
    const raw = (value == null || value < 0) ? null : Math.floor(value);
    const next = raw === 0 ? null : raw;
    if (cur[key] === next) return;
    cur[key] = next;
    if (cur.A == null && cur.B == null) {
      this._slotPoolOverride.delete(slotIndex);
    } else {
      this._slotPoolOverride.set(slotIndex, cur);
    }
    this.dispatchEvent(new CustomEvent("slot-pool-override:changed", { detail: slotIndex }));
  };

  StateClass.prototype.clearAllSlotPoolOverrides = function () {
    if (this._slotPoolOverride.size === 0) return;
    this._slotPoolOverride.clear();
    this.dispatchEvent(new CustomEvent("slot-pool-override:changed", { detail: null }));
  };

  // Both A + B in one go for slot-level "reset to defaults" actions.
  StateClass.prototype.clearSlotPoolOverride = function (slotIndex) {
    if (!this._slotPoolOverride.has(slotIndex)) return;
    this._slotPoolOverride.delete(slotIndex);
    this.dispatchEvent(new CustomEvent("slot-pool-override:changed", { detail: slotIndex }));
  };

  StateClass.prototype.swapPools = function () {
    [this._pools.A,        this._pools.B]        = [this._pools.B,        this._pools.A];
    [this._poolWeights.A,  this._poolWeights.B]  = [this._poolWeights.B,  this._poolWeights.A];
    [this._poolNames.A,    this._poolNames.B]    = [this._poolNames.B,    this._poolNames.A];
    // Per-pool texture ops belong to the pool, not the position — swap
    // them too so e.g. a colour adjust the user set on the "lava" pool
    // follows it from A to B (and the .tres + composite render reflect it).
    if (this._globalTextureOps) {
      [this._globalTextureOps.A, this._globalTextureOps.B] =
        [this._globalTextureOps.B, this._globalTextureOps.A];
    }
    for (const ov of this._slotPoolOverride.values()) {
      [ov.A, ov.B] = [ov.B, ov.A];
    }
    for (const perSlot of this._variantPoolOverride.values()) {
      for (const ov of perSlot.values()) {
        [ov.A, ov.B] = [ov.B, ov.A];
      }
    }
    this.dispatchEvent(new CustomEvent("pools:changed",                  { detail: null }));
    this.dispatchEvent(new CustomEvent("pool-weights:changed",           { detail: null }));
    this.dispatchEvent(new CustomEvent("pool-names:changed",             { detail: null }));
    this.dispatchEvent(new CustomEvent("texture-ops:changed",            { detail: null }));
    this.dispatchEvent(new CustomEvent("slot-pool-override:changed",     { detail: null }));
    this.dispatchEvent(new CustomEvent("variant-pool-override:changed",  { detail: null }));
  };

  // No seed: re-clicking gives a fresh distribution.
  StateClass.prototype.randomizeSlotPoolOverrides = function (key) {
    if (key !== "A" && key !== "B") return;
    const pool = this._pools[key];
    const slots = this._template?.slots;
    if (!pool || pool.length < 2 || !slots?.length) return;
    for (const slot of slots) {
      const idx = Math.floor(Math.random() * pool.length);
      const cur = this._slotPoolOverride.get(slot.index) || { A: null, B: null };
      // Storing 0 would leave the per-slot select (variants >= 1) with no matching option.
      cur[key] = idx === 0 ? null : idx;
      if (cur.A == null && cur.B == null) {
        this._slotPoolOverride.delete(slot.index);
      } else {
        this._slotPoolOverride.set(slot.index, cur);
      }
    }
    this.dispatchEvent(new CustomEvent("slot-pool-override:changed", { detail: null }));
  };

  StateClass.prototype.getVariantPoolOverride = function (slotIndex, variantIdx) {
    return this._variantPoolOverride.get(slotIndex)?.get(variantIdx)
      || { A: null, B: null };
  };

  StateClass.prototype.setVariantPoolOverride = function (slotIndex, variantIdx, key, value) {
    if (key !== "A" && key !== "B") return;
    let perSlot = this._variantPoolOverride.get(slotIndex);
    const cur = perSlot?.get(variantIdx) || { A: null, B: null };
    const next = (value == null || value < 0) ? null : Math.floor(value);
    if (cur[key] === next) return;
    cur[key] = next;
    if (cur.A == null && cur.B == null) {
      perSlot?.delete(variantIdx);
      if (perSlot && perSlot.size === 0) this._variantPoolOverride.delete(slotIndex);
    } else {
      if (!perSlot) {
        perSlot = new Map();
        this._variantPoolOverride.set(slotIndex, perSlot);
      }
      perSlot.set(variantIdx, cur);
    }
    this.dispatchEvent(new CustomEvent("variant-pool-override:changed",
      { detail: { slotIndex, variantIdx } }));
  };

  StateClass.prototype.clearAllVariantPoolOverrides = function () {
    if (this._variantPoolOverride.size === 0) return;
    this._variantPoolOverride.clear();
    this.dispatchEvent(new CustomEvent("variant-pool-override:changed", { detail: null }));
  };

  // Resize-safe key remap. Drops entries for removed slots.
  StateClass.prototype._remapSlotPoolOverride = function (remap) {
    if (this._slotPoolOverride.size === 0) return;
    const next = new Map();
    for (const [oldIdx, val] of this._slotPoolOverride) {
      const newIdx = remap.get(oldIdx);
      if (newIdx === undefined) continue;
      next.set(newIdx, val);
    }
    this._slotPoolOverride = next;
    this.dispatchEvent(new CustomEvent("slot-pool-override:changed", { detail: null }));
  };

  StateClass.prototype._remapVariantPoolOverride = function (remap) {
    if (this._variantPoolOverride.size === 0) return;
    const next = new Map();
    for (const [oldIdx, val] of this._variantPoolOverride) {
      const newIdx = remap.get(oldIdx);
      if (newIdx === undefined) continue;
      next.set(newIdx, val);
    }
    this._variantPoolOverride = next;
    this.dispatchEvent(new CustomEvent("variant-pool-override:changed", { detail: null }));
  };
}
