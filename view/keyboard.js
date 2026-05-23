// Single source of truth for keyboard shortcuts. Modules register combos here
// instead of attaching their own document-level keydown listeners.
//
// Combo format: "Ctrl+S", "Ctrl+Shift+S", "Alt+Enter". Order: Ctrl, Alt, Shift,
// Meta then key. Letter keys are uppercased; non-letter keys taken from
// event.key as-is ("Enter", "Escape", "ArrowUp", "/").

const handlers = new Map(); // combo → { fn, description }

export function registerShortcut(combo, fn, { description } = {}) {
  const key = normalizeCombo(combo);
  if (handlers.has(key)) {
    console.warn(`[keyboard] overwriting shortcut "${key}"`);
  }
  handlers.set(key, { fn, description });
}

export function unregisterShortcut(combo) {
  handlers.delete(normalizeCombo(combo));
}

export function listShortcuts() {
  return [...handlers.entries()].map(([combo, { description }]) => ({ combo, description }));
}

function normalizeCombo(combo) {
  const parts = String(combo).split("+").map((p) => p.trim());
  const mods = { Ctrl: false, Alt: false, Shift: false, Meta: false };
  let key = "";
  for (const p of parts) {
    if (p in mods) mods[p] = true;
    else key = p.length === 1 ? p.toUpperCase() : p;
  }
  const out = [];
  if (mods.Ctrl)  out.push("Ctrl");
  if (mods.Alt)   out.push("Alt");
  if (mods.Shift) out.push("Shift");
  if (mods.Meta)  out.push("Meta");
  out.push(key);
  return out.join("+");
}

function eventToCombo(e) {
  const parts = [];
  if (e.ctrlKey)  parts.push("Ctrl");
  if (e.altKey)   parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey)  parts.push("Meta");
  const k = e.key;
  parts.push(k.length === 1 ? k.toUpperCase() : k);
  return parts.join("+");
}

// Skip shortcuts when user is typing — otherwise Ctrl+S in a text input
// would steal focus from the browser's own form behaviour and feel broken.
function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

document.addEventListener("keydown", (e) => {
  // Ctrl+S etc. should fire even from inputs — saving while a rename input is
  // focused is a common case. But pure letter keys (no modifier) get
  // suppressed in inputs.
  const hasModifier = e.ctrlKey || e.altKey || e.metaKey;
  if (!hasModifier && isTypingTarget(e.target)) return;

  const combo = eventToCombo(e);
  const entry = handlers.get(combo);
  if (!entry) return;
  e.preventDefault();
  entry.fn(e);
});
