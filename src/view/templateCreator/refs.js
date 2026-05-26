// Shared module-level state for the template creator. All submodules
// import these and mutate them in place — keeps cross-module wiring
// flat instead of threading every DOM ref through function args.

export const refs = {
  nameInput:       null,
  cellShapeSelect: null,
  shapeParamsHost: null,
  stageMeta:       null,
  canvasEl:        null,
  stage:           null,
};

// Sync flags.
//   suppressNextRebuild: set before state.replaceTemplate / notifyTemplateChanged
//     when the active rebuild already happened in-place. Listener consumes it
//     once and resets, so the grid doesn't double-paint.
//   lastRenderedRef: the template ref we last drew; the template:changed
//     listener uses it to skip rebuilds on no-op reference equality.
export const sync = {
  suppressNextRebuild: false,
  lastRenderedRef:     null,
};
