// Module-local singleton shared by the debug submodules. Keeping the
// state in one place lets click.js, render orchestration, and selection
// drawing read/write the same `selected` / `lastReport` without circular
// imports or repeated getters.
export const dbgState = {
  selected:   null,
  lastReport: null,
  stageEl:    null,
  canvasEl:   null,
  stage:      null,
};
