// rAF-coalesce: wrap a paint fn so N calls in one tick collapse into a single
// run on the next animation frame (burst events like "Random all" or the
// bundle deserialize loop → one paint per frame). Shared by mainView /
// mapView / slotEditor.
export function coalesceRaf(fn) {
  let pending = false;
  return function coalesced() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; fn(); });
  };
}
