const DEFAULTS = {
  minZoom:     0.25,
  maxZoom:     8,
  wheelStep:   1.15,
  zoomOrigin:  "center",
  fitToContent: false,
  isActive:    () => true,
  onNoisePause: null,
  noiseIdleMs: 200,
};

export function createStage(stageEl, opts = {}) {
  const o = { ...DEFAULTS, ...opts };

  let content   = null;
  let contentW  = 0;
  let contentH  = 0;
  let zoom      = 1;
  let fitScale  = 1;
  let offsetX   = 0;
  let offsetY   = 0;
  let panning   = false;
  let panButton = -1;
  let suppressClick = false;
  let panStartX = 0, panStartY = 0;
  let panStartOffsetX = 0, panStartOffsetY = 0;
  let noiseIdleTimer = null;
  const transformSubs = [];

  function applyTransform() {
    if (!content) return;
    const s = fitScale * zoom;
    content.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${s})`;
    for (const cb of transformSubs) cb();
  }

  function computeFitScale() {
    if (!o.fitToContent || !content || contentW <= 0 || contentH <= 0) return 1;
    const cs = getComputedStyle(stageEl);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop)  + parseFloat(cs.paddingBottom);
    const availW = Math.max(1, stageEl.clientWidth  - padX);
    const availH = Math.max(1, stageEl.clientHeight - padY);
    return Math.max(0.1, Math.min(availW / contentW, availH / contentH));
  }

  function refit() {
    fitScale = computeFitScale();
    applyTransform();
  }

  function onWheel(e) {
    if (!o.isActive()) return;
    e.preventDefault();
    if (o.onNoisePause) {
      o.onNoisePause(true);
      clearTimeout(noiseIdleTimer);
      noiseIdleTimer = setTimeout(() => o.onNoisePause(false), o.noiseIdleMs);
    }
    const dir    = e.deltaY < 0 ? +1 : -1;
    const factor = dir > 0 ? o.wheelStep : 1 / o.wheelStep;
    zoom = clamp(zoom * factor, o.minZoom, o.maxZoom);
    applyTransform();
  }

  // Pan gestures: middle-mouse OR Ctrl+Left. Middle stays as a power-user
  // shortcut; Ctrl+Left works for laptop trackpads / mice without middle button.
  function isPanGesture(e) {
    if (e.button === 1) return true;
    if (e.button === 0 && e.ctrlKey) return true;
    return false;
  }

  function onMouseDown(e) {
    if (!o.isActive()) return;
    if (!isPanGesture(e)) return;
    e.preventDefault();
    panning = true;
    panButton = e.button;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panStartOffsetX = offsetX;
    panStartOffsetY = offsetY;
    stageEl.style.cursor = "grabbing";
  }

  function onMouseMove(e) {
    if (!panning) return;
    offsetX = panStartOffsetX + (e.clientX - panStartX);
    offsetY = panStartOffsetY + (e.clientY - panStartY);
    applyTransform();
  }

  function onMouseUp(e) {
    if (!panning) return;
    if (e.button !== panButton) return;
    panning = false;
    panButton = -1;
    // Ctrl+Left pan would otherwise fire a regular click on the canvas
    // (selection / payload report). Swallow the click that closes this
    // pointer cycle via the capture-phase onCaptureClick handler.
    suppressClick = true;
    stageEl.style.cursor = "";
  }

  function onCaptureClick(e) {
    if (!suppressClick) return;
    suppressClick = false;
    e.stopPropagation();
    e.preventDefault();
  }

  function onAuxClick(e) {
    // Suppress browser middle-click auto-scroll.
    if (e.button === 1) e.preventDefault();
  }

  stageEl.addEventListener("wheel",     onWheel, { passive: false });
  stageEl.addEventListener("mousedown", onMouseDown);
  stageEl.addEventListener("click",     onCaptureClick, true);
  stageEl.addEventListener("auxclick",  onAuxClick);
  window.addEventListener("mousemove",  onMouseMove);
  window.addEventListener("mouseup",    onMouseUp);

  const resizeObserver = new ResizeObserver(refit);
  resizeObserver.observe(stageEl);

  return {
    setContent(el) {
      content = el;
      if (o.zoomOrigin === "center") {
        content.style.transformOrigin = "50% 50%";
      }
      applyTransform();
    },
    // Required when fitToContent: true.
    setContentSize(w, h) {
      contentW = w;
      contentH = h;
      refit();
    },
    resetView() {
      zoom = 1;
      offsetX = 0;
      offsetY = 0;
      applyTransform();
    },
    refit,
    displayScale: () => fitScale * zoom,
    // Fires on every transform change (pan / zoom / fit / reset) so screen-
    // space overlays (e.g. the selection frame) can reposition. Returns an
    // unsubscribe fn.
    onTransform(cb) {
      transformSubs.push(cb);
      return () => {
        const i = transformSubs.indexOf(cb);
        if (i >= 0) transformSubs.splice(i, 1);
      };
    },
    isPanning: () => panning,
    clientToContent(clientX, clientY) {
      if (!content) return null;
      const rect = content.getBoundingClientRect();
      const s = fitScale * zoom;
      return { x: (clientX - rect.left) / s, y: (clientY - rect.top) / s };
    },
    destroy() {
      stageEl.removeEventListener("wheel",     onWheel);
      stageEl.removeEventListener("mousedown", onMouseDown);
      stageEl.removeEventListener("click",     onCaptureClick, true);
      stageEl.removeEventListener("auxclick",  onAuxClick);
      window.removeEventListener("mousemove",  onMouseMove);
      window.removeEventListener("mouseup",    onMouseUp);
      resizeObserver.disconnect();
    },
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
