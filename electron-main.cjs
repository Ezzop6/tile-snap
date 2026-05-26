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

const { app, protocol, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");

// Root of the served app tree = the src/ subfolder. app.getAppPath() resolves
// to the project root in dev (`electron .`) AND to resources/app.asar when
// packaged (src/ is bundled inside) — Electron's asar-aware fs reads from
// either transparently, so appending "src" works for both.
let REPO_ROOT = "";

const CDN_TO_VENDOR = [
  ["https://cdn.jsdelivr.net/npm/split.js@1.6/dist/split.min.js", "vendor/split.min.js"],
  ["https://cdn.jsdelivr.net/npm/paper@0.12.18/dist/paper-full.min.js", "vendor/paper-full.min.js"],
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

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: "#1a1a1a",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Surface renderer-side problems in the terminal (module load failures,
  // uncaught JS errors) — invisible otherwise without opening DevTools.
  win.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    if (level >= 2) console.log(`[renderer] ${message} (${sourceId}:${line})`);
  });
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(`[did-fail-load] ${code} ${desc} ${url}`);
  });
  win.webContents.on("did-finish-load", () => console.log("[did-finish-load] ok"));

  win.loadURL("app://local/index.html");
}

app.whenReady().then(() => {
  REPO_ROOT = path.join(app.getAppPath(), "src");
  protocol.handle("app", handleAppRequest);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
