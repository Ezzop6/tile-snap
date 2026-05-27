// "About" modal — app identity, version, copyright, third-party attribution.
// Opened from the topbar ⓘ button in every mode. Surfaces the open-source
// notices in-app: the bundled full license texts (src/vendor/licenses/) travel
// with the desktop build, and each component links to its upstream below.
//
// COMPONENTS mirrors THIRD-PARTY-LICENSES.md (the canonical source) — keep the
// two in sync when a dependency version / copyright changes. Kept as inline
// data (not fetched) so the modal renders identically in the web build, which
// does NOT ship vendor/ files (vendor stays on CDN there).
//
// Reuses the .dialog visual classes (dialog.css) but owns its own root + Esc
// handler — separate from view/dialog.js, whose listener keys off its own root
// and therefore ignores this one.

import { VERSION } from "../config.js";

const ITCH_URL = "https://ezzop6.itch.io/tilesnap";

// Same about.js ships in both builds. The desktop (Electron) build serves over
// the custom app:// protocol; the web build over http(s). The two redistribute
// dependencies differently (desktop bundles them + Electron/Chromium; web loads
// them from a CDN), so the closing note below adapts to the running build.
const IS_DESKTOP = location.protocol === "app:";

const LIC_NOTE = IS_DESKTOP
  ? `Full license texts are bundled with this build (<code>vendor/licenses/</code>)
     and reproduced at the upstream links above. This build also embeds
     <strong>Electron</strong> (MIT) with <strong>Chromium</strong> (BSD-3-Clause
     + others) and <strong>FFmpeg</strong> (LGPL-2.1+, dynamically linked) — see
     <code>LICENSES.chromium.html</code> shipped alongside the application.`
  : `These libraries are loaded from the jsdelivr CDN at runtime — this web
     version does not redistribute them. Full license texts are at the upstream
     links above.`;

const COMPONENTS = [
  { name: "Split.js",      version: "1.6.5",   license: "MIT",       copyright: "© 2020 Nathan Cahill",                       url: "https://github.com/nathancahill/split" },
  { name: "Paper.js",      version: "0.12.18", license: "MIT",       copyright: "© 2011–2020 Jürg Lehni & Jonathan Puckey",    url: "https://github.com/paperjs/paper.js" },
  { name: "simplex-noise", version: "2.4.0",   license: "MIT",       copyright: "© 2018 Jonas Wagner · alea © 2010 J. Baagøe", url: "https://github.com/jwagner/simplex-noise.js" },
  { name: "clipper-lib",   version: "6.4.2",   license: "Boost 1.0", copyright: "© 2010–2017 Angus Johnson",                   url: "https://www.npmjs.com/package/clipper-lib" },
  { name: "JSZip",         version: "3.10.1",  license: "MIT",       copyright: "© 2009–2016 Stuart Knightley et al.",         url: "https://github.com/Stuk/jszip" },
];

let root = null;

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function componentRow(c) {
  return `<li class="about__lic">
    <a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.name)}</a>
    <span class="about__lic-ver">${esc(c.version)}</span>
    <span class="about__lic-meta">${esc(c.license)} · ${esc(c.copyright)}</span>
  </li>`;
}

function ensureMounted() {
  if (root) return;
  root = document.createElement("div");
  root.className = "dialog";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "About TileSnap");
  root.innerHTML = `
    <div class="dialog__backdrop"></div>
    <div class="dialog__box dialog__box--about" role="document">
      <button class="dialog__close" type="button" aria-label="Close">✕</button>
      <h2 class="dialog__title">TileSnap</h2>
      <div class="about__body">
        <p class="about__version">Version ${esc(VERSION)}</p>
        <p class="about__tagline">Vector tileset generator for Godot.</p>
        <p class="about__copyright">© 2026 ezzop6 — all rights reserved.</p>
        <p class="about__links">
          <a href="${esc(ITCH_URL)}" target="_blank" rel="noopener noreferrer">itch.io page ↗</a>
        </p>
        <details class="about__licenses">
          <summary>Open-source components</summary>
          <ul class="about__lic-list">${COMPONENTS.map(componentRow).join("")}</ul>
          <p class="about__lic-note">${LIC_NOTE}</p>
        </details>
      </div>
      <div class="dialog__buttons">
        <button class="dialog__btn dialog__btn--primary" type="button" data-about-close>Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);
  root.querySelector(".dialog__backdrop").addEventListener("click", close);
  root.querySelector(".dialog__close").addEventListener("click", close);
  root.querySelector("[data-about-close]").addEventListener("click", close);
  // Capture phase + stopImmediatePropagation so Esc closes only this modal and
  // doesn't also reach a mode-level Esc handler underneath.
  document.addEventListener("keydown", onKeydown, true);
}

function onKeydown(e) {
  if (!root || !root.classList.contains("is-open")) return;
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopImmediatePropagation();
    close();
  }
}

function open() {
  ensureMounted();
  root.classList.add("is-open");
  root.querySelector("[data-about-close]")?.focus();
}

function close() {
  if (root) root.classList.remove("is-open");
}

export function openAbout() { open(); }

export function initAbout() {
  document.getElementById("about-toggle")?.addEventListener("click", open);
}
