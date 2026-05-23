// Bundle-mode atlas path override. Singleton string prepended to every
// atlas filename in the exported combined .tres so users can drop the
// ZIP into a non-root Godot subfolder without hand-editing the .tres.
//
// Storage holds whatever the user typed; normalizeAtlasPrefix at export
// time produces the final Godot-flavoured prefix: `res://<path>/`. The
// user can type `addons/myset`, `addons/myset/`, `/addons/myset`, or even
// `res://addons/myset` — all collapse to the same canonical
// `res://addons/myset/` output. Empty input = root behaviour (bare
// filenames in .tres, relative to .tres location).
//
// Persisted via `settings.bundleAtlasPath` (cross-session, not per-project)
// alongside bundleOverrides + bundleSelection — they're all bundle-mode
// scratch state, not project state.

export function initBundlePathState(state) {
  state._bundleAtlasPath = "";
}

export function applyBundlePathMixin(StateClass) {
  Object.defineProperty(StateClass.prototype, "bundleAtlasPath", {
    get() { return this._bundleAtlasPath; },
  });

  StateClass.prototype.setBundleAtlasPath = function (value) {
    const v = String(value ?? "");
    if (this._bundleAtlasPath === v) return;
    this._bundleAtlasPath = v;
    this.dispatchEvent(new CustomEvent("bundle-path:changed", { detail: v }));
  };

  StateClass.prototype.loadBundleAtlasPath = function (value) {
    if (typeof value !== "string") return;
    if (this._bundleAtlasPath === value) return;
    this._bundleAtlasPath = value;
    this.dispatchEvent(new CustomEvent("bundle-path:changed", { detail: value }));
  };
}

// Canonicalises the user-typed path into the final `res://<path>/` prefix
// (or empty string for root). Tolerates leading `res://`, leading/trailing
// slashes — strips them then re-applies our format. The caller
// (bundleExport) emits `path="${prefix}${atlasFile}"` directly, so an empty
// return = root behaviour (bare filename, relative to .tres).
export function normalizeAtlasPrefix(raw) {
  let v = String(raw ?? "").trim();
  if (!v) return "";
  // Tolerate `res://` typed by users out of habit so we don't double-prefix.
  v = v.replace(/^res:\/\//i, "");
  // Strip surrounding slashes so we control the format.
  v = v.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!v) return "";
  return `res://${v}/`;
}
