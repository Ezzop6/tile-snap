// Tiny perf tracer used by buildSlotGraph (PointGraph pipeline) and
// slotComposite (per-pool texture ops). No-op when disabled.
//
// Marks accumulate across the current "render burst" (everything that runs
// before the JS event loop goes idle for ~80 ms). When idle, the current
// accumulator becomes `last` (= the displayed snapshot) and is cleared.
// Listeners get notified so the UI can refresh.

let enabled = false;
let current = Object.create(null);
let last = Object.create(null);
let flushTimer = null;
const listeners = new Set();
const FLUSH_IDLE_MS = 80;

export function setTracingEnabled(v) {
  enabled = !!v;
  if (!enabled) {
    current = Object.create(null);
    last = Object.create(null);
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    notify();
  }
}

export function isTracingEnabled() { return enabled; }

export function mark(name, dt) {
  if (!enabled) return;
  current[name] = (current[name] || 0) + dt;
  scheduleFlush();
}

// Wrap a synchronous op; returns its result so callers can inline.
export function timed(name, fn) {
  if (!enabled) return fn();
  const t0 = performance.now();
  const r = fn();
  mark(name, performance.now() - t0);
  return r;
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    last = current;
    current = Object.create(null);
    notify();
  }, FLUSH_IDLE_MS);
}

export function getLastTimings() { return last; }

export function onTimingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}
