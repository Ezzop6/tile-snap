// TileSnap — Electron desktop wrapper.
//
// Why a custom `app://` protocol instead of loadFile(file://):
//   1. ES modules (main.js is `type="module"`) are blocked over file:// by
//      Chromium's CORS rules — a real origin is required.
//   2. localStorage needs a STABLE origin to persist across runs; file://
//      origins are fragile. `app://` gives one fixed origin.
//
// The dev index.html still references the jsdelivr CDN; we rewrite those 5
// script srcs to the local vendor/ copies on the fly when serving, so the
// packaged app is fully offline without forking index.html.

const { app, protocol, BrowserWindow, Menu, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");

// Root of the served app tree = the src/ subfolder. app.getAppPath() resolves
// to the project root in dev (`electron .`) AND to resources/app.asar when
// packaged (src/ is bundled inside) — Electron's asar-aware fs reads from
// either transparently, so appending "src" works for both.
let REPO_ROOT = "";

const CDN_TO_VENDOR = [
  ["https://cdn.jsdelivr.net/npm/split.js@1.6/dist/split.min.js", "vendor/split.min.js"],
  ["https://cdn.jsdelivr.net/npm/paper@0.12.18/dist/paper-core.min.js", "vendor/paper-core.min.js"],
  ["https://cdn.jsdelivr.net/npm/simplex-noise@2.4.0/simplex-noise.js", "vendor/simplex-noise.js"],
  ["https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/clipper.js", "vendor/clipper.js"],
  ["https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js", "vendor/jszip.min.js"],
];

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

// Register BEFORE app ready so the scheme gets a proper secure origin
// (standard = real origin/localStorage, secure = treated like https).
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

function rewriteIndexHtml(html) {
  let out = html;
  for (const [cdn, local] of CDN_TO_VENDOR) {
    out = out.split(cdn).join(local);
  }
  return out;
}

async function handleAppRequest(request) {
  const url = new URL(request.url);
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/" || rel === "") rel = "/index.html";

  const filePath = path.normalize(path.join(REPO_ROOT, rel));
  // Path-traversal guard: never serve outside the repo root.
  if (filePath !== REPO_ROOT && !filePath.startsWith(REPO_ROOT + path.sep)) {
    return new Response("Forbidden", { status: 403 });
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";

  try {
    if (ext === ".html") {
      const text = await fs.readFile(filePath, "utf8");
      return new Response(rewriteIndexHtml(text), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    const data = await fs.readFile(filePath);
    return new Response(data, { headers: { "content-type": mime } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

// --- Window state persistence ----------------------------------------------
// Remember the window's size/position/maximized state across runs (the default
// was a fixed 1440x900 every launch). Stored as JSON under userData.
const windowStateFile = () => path.join(app.getPath("userData"), "window-state.json");

function loadWindowState() {
  try {
    const s = JSON.parse(fsSync.readFileSync(windowStateFile(), "utf8"));
    if (s && typeof s === "object") return s;
  } catch {
    /* first run or corrupt → defaults */
  }
  return null;
}

function saveWindowState(win) {
  try {
    // getNormalBounds = the pre-maximize geometry, so restoring a maximized
    // window can reproduce both the maximized state AND a sensible un-maximize size.
    const b = win.getNormalBounds();
    const state = { x: b.x, y: b.y, width: b.width, height: b.height, isMaximized: win.isMaximized() };
    fsSync.writeFileSync(windowStateFile(), JSON.stringify(state));
  } catch (err) {
    console.error("[window-state] save failed:", err);
  }
}

// --- Application menu -------------------------------------------------------
// Electron's default menu ships dev affordances (reload, force-reload, toggle
// DevTools). Replace it with a minimal one carrying only items that genuinely
// work in this app — no dev items, no document-level undo/redo (the app has
// none; the roles would only undo text fields and imply a canvas-history
// feature that doesn't exist). App actions (New/Open/Save, mode switching)
// live in the in-app topbar + keyboard shortcuts, not here. DevTools stays
// reachable for debugging via the localStorage "tilesnap.debug" in-app UI.
function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    { role: "fileMenu" }, // just Quit on Win/Linux; Close on mac
    // Clipboard only — these act on the focused editable element, so they're
    // real + useful in the app's text inputs (project / pool names) and are
    // required on macOS for Cmd+C/V to work there. No undo/redo (see above).
    {
      label: "Edit",
      submenu: [
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const saved = loadWindowState();
  const win = new BrowserWindow({
    width: saved?.width ?? 1440,
    height: saved?.height ?? 900,
    x: saved?.x,           // undefined → Electron centers the window
    y: saved?.y,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#1a1a1a",
    // Window/taskbar icon (Linux + dev). The packaged launcher icon comes from
    // electron-builder's build.icon; this is the same src/icon.png at runtime.
    icon: path.join(REPO_ROOT, "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (saved?.isMaximized) win.maximize();

  // Surface renderer-side problems in the terminal (module load failures,
  // uncaught JS errors) — invisible otherwise without opening DevTools.
  win.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    if (level >= 2) console.log(`[renderer] ${message} (${sourceId}:${line})`);
  });
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(`[did-fail-load] ${code} ${desc} ${url}`);
  });
  win.webContents.on("did-finish-load", () => console.log("[did-finish-load] ok"));

  // External links open in the system browser, never inside the app window
  // (e.g. a future About → GitHub link). window.open / target=_blank:
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  // Direct navigations (a plain <a href>): allow in-app app:// links, hand
  // anything external to the OS browser.
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("app://")) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  win.on("close", () => saveWindowState(win));

  win.loadURL("app://local/index.html");
}

// Single-instance lock: a second launch would open a window sharing the same
// origin and race the first on localStorage / IndexedDB writes. Instead, focus
// the existing window and let the second instance exit.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    REPO_ROOT = path.join(app.getAppPath(), "src");
    protocol.handle("app", handleAppRequest);
    buildMenu();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
