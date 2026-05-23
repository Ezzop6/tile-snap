// Shared mutable state for export panel submodules. Exported `let` bindings are
// read-only at the import site, hence the object form.

export const xs = {
  layoutEl:       null,
  slotMetaEl:     null,
  previewEl:      null,
  previewPrevBtn: null,
  previewNextBtn: null,

  // 0 = template tile (V=0). 1..N = variant tile of the selected slot.
  selectedVariantIdx: 0,

  stage: null,

  // Pool weights block is rebuilt per renderParams; outer section collapse lives in the DOM.
  poolWeightsCollapsed: new Set(),
};

export const LAYOUT_TILE_DISPLAY_PX = 64;
export const PREVIEW_MIN_PX = 64;

export function isActive() {
  return document.body.classList.contains("export-active");
}
