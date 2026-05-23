// Single source of truth for the slot SELECTION frame, visually identical in
// every view (preview / debug / export).
//
// The frame is a DOM overlay living in the stage's OWN (screen) space, with a
// fixed CSS-px border (.slot-selection-frame). It is NOT drawn into the slot
// canvas — so it never rasterises at the texture resolution (which made the
// preview line thin/blurry on small textures and crisp on large ones) and
// never changes thickness with the texture resolution or the stage zoom. One
// thin crisp line, the same everywhere.
//
// Each view supplies a `tracker` that returns the selected slot's client-space
// rect (or null). The overlay repositions itself on every paint and on every
// stage transform change (pan / zoom / fit) via stage.onTransform.

export function createSelectionOverlay(stageEl, stage) {
  // Absolute positioning is resolved against the stage box; the stage clips
  // (overflow: hidden) so a panned-out frame doesn't float over other UI.
  if (getComputedStyle(stageEl).position === "static") {
    stageEl.style.position = "relative";
  }
  const el = document.createElement("div");
  el.className = "slot-selection-frame";
  el.hidden = true;
  stageEl.appendChild(el);

  let tracker = () => null;

  function refresh() {
    const rect = tracker();
    if (!rect) { el.hidden = true; return; }
    const host = stageEl.getBoundingClientRect();
    el.style.left   = (rect.left - host.left) + "px";
    el.style.top    = (rect.top  - host.top)  + "px";
    el.style.width  = rect.width  + "px";
    el.style.height = rect.height + "px";
    el.hidden = false;
  }

  const unsub = stage?.onTransform ? stage.onTransform(refresh) : null;

  return {
    setTracker(fn) { tracker = fn || (() => null); refresh(); },
    refresh,
    destroy() { if (unsub) unsub(); el.remove(); },
  };
}

// Client-space rect of a slot drawn inside a canvas whose CSS layout box is
// contentW × contentH content-px. getBoundingClientRect is post-transform, so
// this works regardless of backing resolution / supersample / stage zoom.
export function slotClientRect(canvasEl, contentW, contentH, x, y, w, h) {
  if (!canvasEl || !contentW || !contentH) return null;
  const r = canvasEl.getBoundingClientRect();
  const sx = r.width / contentW;
  const sy = r.height / contentH;
  return { left: r.left + x * sx, top: r.top + y * sy, width: w * sx, height: h * sy };
}
