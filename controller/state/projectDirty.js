// Project-level dirty flag. Analogous to _templateDirty but spans the whole
// project blob: any user-driven mutation flips dirty=true; save / load / new
// reset to false. Visual is the topbar Save button accent (.is-dirty class).
//
// Bridge subscribes to mutation events at module init. _loadingProject
// suppresses dirty during deserialize — that event burst is a load, not user
// intent.

const MUTATION_EVENTS = [
  "template:changed",
  "pools:changed",
  "pool-weights:changed",
  "pool-names:changed",
  "slot-pool-override:changed",
  "variant-pool-override:changed",
  "global-curve:changed",
  "noise:changed",
  "texture-ops:changed",
  "seed:changed",
  "tile-offsets:changed",
  "slot-cut-transform:changed",
  "variant-cut-transform:changed",
  "slot-texture-transform:changed",
  "project-name:changed",
  "export-config:changed",
  "export-direction:changed",
  "export-aspect:changed",
  "export-variability:changed",
  "export-show-islands:changed",
  "export-layout-view:changed",
  "export-include-sources:changed",
  "export-master-share:changed",
];

export function initProjectDirtyState(state) {
  state._projectDirty   = false;
  state._loadingProject = false;
}

export function applyProjectDirtyMixin(StateClass) {
  Object.defineProperty(StateClass.prototype, "projectDirty", {
    get() { return this._projectDirty; },
  });

  StateClass.prototype.isProjectDirty = function () {
    return this._projectDirty;
  };

  StateClass.prototype.markProjectDirty = function () {
    if (this._projectDirty || this._loadingProject) return;
    this._projectDirty = true;
    this.dispatchEvent(new CustomEvent("project-dirty:changed", { detail: true }));
  };

  StateClass.prototype.markProjectClean = function () {
    if (!this._projectDirty) return;
    this._projectDirty = false;
    this.dispatchEvent(new CustomEvent("project-dirty:changed", { detail: false }));
  };

  StateClass.prototype._beginProjectLoad = function () {
    this._loadingProject = true;
  };

  StateClass.prototype._endProjectLoad = function () {
    this._loadingProject = false;
    // Load resets dirty regardless of any mutation events that slipped through.
    if (this._projectDirty) {
      this._projectDirty = false;
      this.dispatchEvent(new CustomEvent("project-dirty:changed", { detail: false }));
    }
  };
}

// Wires the mutation-event bridge. Called once after state construction so
// `state` is the live instance (not the prototype).
export function attachProjectDirtyBridge(state) {
  const mark = () => state.markProjectDirty();
  for (const name of MUTATION_EVENTS) {
    state.addEventListener(name, mark);
  }
}
