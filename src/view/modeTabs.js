// preview = no body class; export/template/debug = mutually-exclusive body classes.

import { settings } from "../controller/storage.js";

const SETTING_KEY = "modeTab";

const MODES = {
  preview:  { btnId: "mode-preview",  bodyClass: null              },
  export:   { btnId: "mode-export",   bodyClass: "export-active"   },
  template: { btnId: "mode-template", bodyClass: "creator-active"  },
  texture:  { btnId: "mode-texture",  bodyClass: "texture-active"  },
  bundle:   { btnId: "mode-bundle",   bodyClass: "bundle-active"   },
  debug:    { btnId: "mode-debug",    bodyClass: "debug-active"    },
};

let currentMode = "preview";
const subscribers = new Set();

// Resolved at init time (not module load) — the Debug tab is hidden when
// !DEBUG (via the .debug-only class + body.debug-on, set AFTER imports finish),
// so an earlier read would miss the gating and land the user in an invisible
// tab. Computed style (not inline style.display) because the gating is in CSS.
function loadInitialMode() {
  const saved = settings.get(SETTING_KEY);
  if (typeof saved !== "string" || !(saved in MODES)) return "preview";
  const btn = document.getElementById(MODES[saved].btnId);
  if (btn && getComputedStyle(btn).display === "none") return "preview";
  return saved;
}

export function initModeTabs() {
  currentMode = loadInitialMode();
  for (const [mode, spec] of Object.entries(MODES)) {
    const btn = document.getElementById(spec.btnId);
    if (!btn) continue;
    btn.addEventListener("click", () => setMode(mode));
  }
  const spec = MODES[currentMode];
  if (spec?.bodyClass) document.body.classList.add(spec.bodyClass);
  syncTabState();
  // Notify so views needing first render in the default mode (= debug stage) can trigger without a click.
  for (const fn of subscribers) fn(currentMode);
}

export function getMode() { return currentMode; }

export function onModeChange(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function setMode(mode) {
  if (!(mode in MODES)) return;
  if (mode === currentMode) return;
  for (const spec of Object.values(MODES)) {
    if (spec.bodyClass) document.body.classList.remove(spec.bodyClass);
  }
  const target = MODES[mode];
  if (target.bodyClass) document.body.classList.add(target.bodyClass);
  currentMode = mode;
  settings.set(SETTING_KEY, mode);
  syncTabState();
  for (const fn of subscribers) fn(mode);
}

function syncTabState() {
  for (const [mode, spec] of Object.entries(MODES)) {
    const btn = document.getElementById(spec.btnId);
    if (!btn) continue;
    btn.classList.toggle("is-active", mode === currentMode);
    btn.setAttribute("aria-selected", mode === currentMode ? "true" : "false");
  }
}
