# Third-Party Licenses — TileSnap

TileSnap ships in two forms, which redistribute third-party code differently:

- **Web build** (`make build` → `dist/`): loads the runtime libraries below
  **from a CDN (jsdelivr)** at runtime. It does **not** bundle or redistribute
  their source. The table is here for attribution.
- **Desktop build** (Electron, `make app-*` → `release/`): **bundles** the
  runtime libraries (copied into `src/vendor/`) **and** the Electron runtime
  (which embeds Chromium). This form **does redistribute** their code, so the
  full upstream notices travel with it (see "Bundled in the desktop build").

All third-party components are permissive and cleared for commercial use.

## Runtime libraries

| Library | Version | License (SPDX) | Copyright | Reference |
|---|---|---|---|---|
| Split.js | 1.6.5 | MIT | © 2020 Nathan Cahill | https://www.npmjs.com/package/split.js · https://github.com/nathancahill/split |
| Paper.js | 0.12.18 | MIT | © 2011–2020 Jürg Lehni & Jonathan Puckey | https://www.npmjs.com/package/paper · https://github.com/paperjs/paper.js |
| simplex-noise | 2.4.0 | MIT | © 2018 Jonas Wagner | https://www.npmjs.com/package/simplex-noise · https://github.com/jwagner/simplex-noise.js |
| clipper-lib | 6.4.2 | BSL-1.0 (Boost) | © 2010–2017 Angus Johnson | https://www.npmjs.com/package/clipper-lib · https://www.boost.org/LICENSE_1_0.txt |
| JSZip | 3.10.1 | MIT OR GPL-3.0-or-later | © Stuart Knightley & contributors | https://www.npmjs.com/package/jszip · https://github.com/Stuk/jszip |

### JSZip license election
JSZip is dual-licensed. **TileSnap elects to use JSZip under the MIT license.**
The GPL-3.0 option is not exercised and imposes no copyleft obligation here.

## Bundled in the desktop build

The desktop build redistributes copies of the above, so each library's full
notice ships with it. The complete license texts are bundled at:

```
src/vendor/licenses/
├── split.js-LICENSE.txt
├── paper-LICENSE.txt
├── simplex-noise-LICENSE.txt
├── jszip-LICENSE.txt          (full dual MIT/GPLv3 text; MIT elected)
└── clipper-lib-LICENSE.txt    (Boost Software License 1.0)
```

(MIT, BSD-2-Clause and Boost all require retaining the copyright + permission
notice in distributed copies — these files satisfy that for the runtime libs.)

### Electron runtime (desktop build only)

| Component | License (SPDX) | Notes |
|---|---|---|
| Electron | MIT | © GitHub Inc. and Electron contributors. https://github.com/electron/electron |
| Chromium (embedded in Electron) | BSD-3-Clause + many third-party | Notices in `LICENSES.chromium.html` (Node, V8, ffmpeg, ICU, …) |

`electron-builder` includes Electron's own license and the Chromium notices in
the packaged output (typically `LICENSE.electron.txt` + `LICENSES.chromium.html`
alongside the application). Verify these files are present in `release/` before
publishing.

## Build-time tools (NOT shipped)

These run only during the builds (via `npx` for the web build, from
`node_modules` for the desktop build) and never appear in the distributed
product, so they impose no obligations on it. Listed for completeness.

| Tool | Version | License (SPDX) |
|---|---|---|
| esbuild | 0.25.12 | MIT |
| javascript-obfuscator | 4.2.2 | BSD-2-Clause |
| html-minifier-terser | 7.2.0 | MIT |
| electron-builder | 25.x | MIT |

---

_This file is an attribution summary, not legal advice. Before commercial
release, confirm the exact copyright lines against each upstream `LICENSE`, and
confirm Electron's `LICENSE.electron.txt` + `LICENSES.chromium.html` actually
ship inside `release/`._
