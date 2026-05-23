// Singleton pan/zoom shared by the Preview / Export / Debug stages so the view
// (zoom + pan) persists when switching between them instead of resetting on
// every mode change. Each stage keeps its OWN fitScale (content-size
// dependent) — only the user transform (zoom multiplier + pan offset) is
// shared. Passed to createStage as `{ shared: sharedTransform }`.

const state = { zoom: 1, offsetX: 0, offsetY: 0 };
const subs = new Set();

export const sharedTransform = {
  state,
  // Re-apply on every stage (incl. hidden ones, so they're correct on switch).
  notify() { for (const cb of subs) cb(); },
  subscribe(cb) { subs.add(cb); return () => subs.delete(cb); },
};
