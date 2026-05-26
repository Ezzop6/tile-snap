// Tiny perf tracer used by buildSlotGraph (PointGraph pipeline) and
// slotComposite (per-pool texture ops). No-op when disabled.
//
// PER-CALL accounting — NOT per frame. Each mark() = one op invocation (e.g.
// one slot's merge). We keep, per key: sum + count (→ avg = mean cost of a
// single call) + last. This is completely independent of frames, bursts and
// event-loop timing, so neither drag length nor input-event priority can
// distort it; and over thousands of calls the avg averages out both GC/JIT
// outliers AND the ~0.1 ms performance.now() coarsening, so it's stable to
// ~0.01 ms. avg is THE comparison number. full-render cost ≈ avg × (calls of
// that op per render).
//
// (We tried tracking min as an "interference-free" number — useless here: many
// calls hit trivial slots (interior / empty region) that finish in ~0, and the
// timer coarsens sub-tick calls to 0, so min pins to 0 everywhere. The large-n
// avg is the robust statistic instead.)
//
// (History: earlier models accumulated per "burst" bounded by an idle timer,
// then by setTimeout(0). Both defined the unit via event-loop timing, which is
// non-deterministic under input pressure — a burst could swallow several frames
// and spike. Per-call accounting removes the timing dependence entirely.)
//
// UI notification is throttled (~NOTIFY_MS) so the overlay doesn't re-render on
// every op call while stats keep accumulating.

let enabled = false;
let stats = Object.create(null); // name -> { sum, count, last }
let notifyTimer = null;
const listeners = new Set();
const NOTIFY_MS = 100;

export function setTracingEnabled(v) {
  enabled = !!v;
  stats = Object.create(null); // fresh baseline on (re)start, full clear on stop
  if (notifyTimer) { clearTimeout(notifyTimer); notifyTimer = null; }
  notify();
}

export function isTracingEnabled() { return enabled; }

export function mark(name, dt) {
  if (!enabled) return;
  let s = stats[name];
  if (!s) s = stats[name] = { sum: 0, count: 0, last: 0 };
  s.sum += dt;
  s.count++;
  s.last = dt;
  scheduleNotify();
}

// Wrap a synchronous op; returns its result so callers can inline.
export function timed(name, fn) {
  if (!enabled) return fn();
  const t0 = performance.now();
  const r = fn();
  mark(name, performance.now() - t0);
  return r;
}

// name -> { avg, last, count }.
export function getTimingStats() {
  const out = Object.create(null);
  for (const k in stats) {
    const s = stats[k];
    out[k] = { avg: s.sum / s.count, last: s.last, count: s.count };
  }
  return out;
}

export function onTimingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function scheduleNotify() {
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => { notifyTimer = null; notify(); }, NOTIFY_MS);
}

function notify() {
  for (const fn of listeners) fn();
}
