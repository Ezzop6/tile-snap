import { inputsLibrary, images } from "../storage.js";
import { splitIntoTiles } from "../../core/source.js";

export function initInputsState(state) {
  state._inputs = [];
  state._nextInputN = 1;
  state._selectedTile = null;
}

// Rebuilds a tile-source object (canvas + dims) from a dataURL. Result
// shape matches core/source.js#loadImageFile so splitIntoTiles consumes
// it identically.
function loadImageFromDataURL(dataURL) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth  || img.width;
      const h = img.naturalHeight || img.height;
      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ canvas, width: w, height: h, fileName: "" });
    };
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = dataURL;
  });
}

// Rebuilds a tile-split source from saved metadata. Used both by project
// deserialize (legacy path) and by loadInputsLibrary on app start.
async function hydrateInput(spec) {
  if (!spec?.hash) return null;
  const dataURL = images.get(spec.hash);
  if (!dataURL) return null;
  const source = await loadImageFromDataURL(dataURL);
  const { tiles, cols, rows } = splitIntoTiles(source, spec.tileSize);
  return {
    id:       spec.id,
    name:     spec.name,
    source,
    tileSize: spec.tileSize,
    hash:     spec.hash,
    cols, rows, tiles,
  };
}

export function applyInputsMixin(StateClass) {
  Object.defineProperty(StateClass.prototype, "inputs", {
    get() { return this._inputs; },
  });
  Object.defineProperty(StateClass.prototype, "selectedTile", {
    get() { return this._selectedTile; },
  });

  StateClass.prototype.addInput = function (input) {
    this._inputs.push(input);
    inputsLibrary.put({
      id: input.id, name: input.name, tileSize: input.tileSize, hash: input.hash,
    });
    this.dispatchEvent(new CustomEvent("input:added", { detail: input }));
  };

  StateClass.prototype.removeInput = function (id) {
    const idx = this._inputs.findIndex((i) => i.id === id);
    if (idx < 0) return;
    this._inputs.splice(idx, 1);
    inputsLibrary.remove(id);
    this.dispatchEvent(new CustomEvent("input:removed", { detail: id }));

    if (this._selectedTile?.inputId === id) {
      this._selectedTile = null;
      this.dispatchEvent(new CustomEvent("selection:changed", { detail: null }));
    }
    for (const key of ["A", "B"]) {
      this._dropPoolRefsForInput(key, id);
    }
  };

  StateClass.prototype.updateInput = function (id, patch) {
    const input = this._inputs.find((i) => i.id === id);
    if (!input) return;
    Object.assign(input, patch);
    inputsLibrary.put({
      id: input.id, name: input.name, tileSize: input.tileSize, hash: input.hash,
    });
    this.dispatchEvent(new CustomEvent("input:updated", { detail: input }));

    if (this._selectedTile?.inputId === id) {
      const s = this._selectedTile;
      if (s.tileCol >= input.cols || s.tileRow >= input.rows) {
        this._selectedTile = null;
        this.dispatchEvent(new CustomEvent("selection:changed", { detail: null }));
      }
    }
    for (const key of ["A", "B"]) {
      this._dropPoolEntriesIf(key, (ref) => ref.inputId === id
        && (ref.tileCol >= input.cols || ref.tileRow >= input.rows));
    }
  };

  StateClass.prototype.nextInputId = function () {
    return `input-${this._nextInputN++}`;
  };

  // Idempotent — hydrates only library entries not yet in state._inputs.
  // Called once at app start AND again after each project deserialize so
  // legacy projects' `inputs` arrays (merged into the library inside
  // deserialize) get hydrated without duplicates.
  StateClass.prototype.loadInputsLibrary = async function () {
    const specs = inputsLibrary.list();
    const existing = new Set(this._inputs.map((i) => i.id));
    let maxN = this._nextInputN - 1;
    for (const spec of specs) {
      if (existing.has(spec.id)) continue;
      const hydrated = await hydrateInput(spec);
      if (!hydrated) {
        console.warn(`[inputs] library entry "${spec.id}" skipped — image binary ${spec.hash} missing`);
        continue;
      }
      this._inputs.push(hydrated);
      const n = parseInt(String(spec.id).replace(/^input-/, ""), 10);
      if (!Number.isNaN(n) && n > maxN) maxN = n;
      this.dispatchEvent(new CustomEvent("input:added", { detail: hydrated }));
    }
    this._nextInputN = Math.max(this._nextInputN, maxN + 1);
  };

  StateClass.prototype.selectTile = function (inputId, tileCol, tileRow) {
    this._selectedTile = { inputId, tileCol, tileRow };
    this.dispatchEvent(new CustomEvent("selection:changed", { detail: this._selectedTile }));
  };

  StateClass.prototype.clearTileSelection = function () {
    if (!this._selectedTile) return;
    this._selectedTile = null;
    this.dispatchEvent(new CustomEvent("selection:changed", { detail: null }));
  };
}
