#!/usr/bin/env bash
# Release build for TileSnap.
#
# OPT-IN deployment step only — the dev workflow stays build-free (open
# index.html directly, no compilation to run or iterate). This script bundles
# + minifies the app into dist/ for deployment. Vendor libs (Split / paper /
# simplex-noise / clipper-lib / JSZip) keep their CDN <script> tags untouched.
#
# Tooling (node + npm/npx required) is fetched on demand via npx and cached
# in ~/.npm — nothing is installed into the repo, no package.json.
#
# Usage:  OBFUSCATE=none|light|heavy [DEBUG_BUILD=false] [OUTDIR=dist] ./build.sh
# Output: dist/index.html + dist/app.<hash>.js + dist/app.<hash>.css
#
# DEBUG_BUILD bakes config.js#DEBUG (via esbuild --define). Default false = a
# shipped build with debug UI off; it can still be flipped on at runtime with
# localStorage["tilesnap.debug"]="1" + reload (survives obfuscation). Set
# DEBUG_BUILD=true to bake a debug-on build on purpose.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

OBFUSCATE="${OBFUSCATE:-none}"
OUTDIR="${OUTDIR:-dist}"
DEBUG_BUILD="${DEBUG_BUILD:-false}"
case "$DEBUG_BUILD" in
  true|false) ;;
  *) echo "✗ DEBUG_BUILD must be 'true' or 'false' (got '$DEBUG_BUILD')" >&2; exit 1 ;;
esac
ESBUILD="esbuild@0.25.12"
OBFUSCATOR="javascript-obfuscator@4.2.2"
HTMLMIN="html-minifier-terser@7.2.0"

TMP="$(mktemp -d)"
ENTRY_CSS="$ROOT/.build-entry.css"
trap 'rm -rf "$TMP" "$ENTRY_CSS"' EXIT

echo "▶ build: OBFUSCATE=$OBFUSCATE  DEBUG_BUILD=$DEBUG_BUILD  OUTDIR=$OUTDIR"

# --- 1. Bundle + minify JS. Format stays ESM because main.js uses top-level
#        await (state.loadInputsLibrary); index.html keeps <script type=module>.
echo "  · bundling JS (esbuild)"
npx --yes "$ESBUILD" main.js \
  --bundle \
  --format=esm \
  --target=es2022 \
  --minify \
  --legal-comments=none \
  "--define:__TILESNAP_DEBUG__=$DEBUG_BUILD" \
  --outfile="$TMP/app.js"

# --- 2. Optional obfuscation pass over the bundled JS.
#        rename-globals stays OFF: vendor libs are free global reads (Split,
#        paper, SimplexNoise, ClipperLib, JSZip) and must not be touched.
#        sourceType=module is forced via config (the bundle has no import/
#        export, so auto-detect would pick "script" and choke on the
#        top-level await); CLI flags below override everything else.
printf '{ "sourceType": "module" }\n' > "$TMP/obf.config.json"
case "$OBFUSCATE" in
  none)
    echo "  · obfuscation: skipped"
    ;;
  light)
    echo "  · obfuscation: light"
    npx --yes "$OBFUSCATOR" "$TMP/app.js" --output "$TMP/app.js" \
      --config "$TMP/obf.config.json" \
      --compact true \
      --identifier-names-generator mangled \
      --rename-globals false \
      --string-array true \
      --string-array-threshold 0.75 \
      --string-array-encoding base64 \
      --control-flow-flattening false \
      --dead-code-injection false \
      --self-defending false \
      --debug-protection false
    ;;
  heavy)
    echo "  · obfuscation: heavy (expect a runtime perf cost on render loops)"
    npx --yes "$OBFUSCATOR" "$TMP/app.js" --output "$TMP/app.js" \
      --config "$TMP/obf.config.json" \
      --compact true \
      --identifier-names-generator hexadecimal \
      --rename-globals false \
      --string-array true \
      --string-array-threshold 1 \
      --string-array-encoding rc4 \
      --string-array-rotate true \
      --string-array-shuffle true \
      --split-strings true \
      --split-strings-chunk-length 8 \
      --control-flow-flattening true \
      --control-flow-flattening-threshold 0.75 \
      --dead-code-injection true \
      --dead-code-injection-threshold 0.4 \
      --transform-object-keys true \
      --self-defending true \
      --debug-protection false
    ;;
  *)
    echo "✗ unknown OBFUSCATE='$OBFUSCATE' (use none|light|heavy)" >&2
    exit 1
    ;;
esac

# --- 3. Bundle + minify CSS. tokens.css is <link>ed separately from main.css
#        (main.css does not @import it), so a tiny entry pulls both in order.
echo "  · bundling CSS (esbuild)"
printf '@import "styles/tokens.css";\n@import "styles/main.css";\n' > "$ENTRY_CSS"
npx --yes "$ESBUILD" "$ENTRY_CSS" \
  --bundle \
  --minify \
  --outfile="$TMP/app.css"

# --- 4. Content-hash filenames for cache-busting.
JS_HASH="$(sha256sum "$TMP/app.js"  | cut -c1-8)"
CSS_HASH="$(sha256sum "$TMP/app.css" | cut -c1-8)"
JS_NAME="app.$JS_HASH.js"
CSS_NAME="app.$CSS_HASH.css"

# --- 5. Assemble dist/.
rm -rf "$OUTDIR"
mkdir -p "$OUTDIR"
cp "$TMP/app.js"  "$OUTDIR/$JS_NAME"
cp "$TMP/app.css" "$OUTDIR/$CSS_NAME"

# Rewrite index.html: drop the two dev CSS <link>s in favour of one hashed
# bundle, repoint the module script at the hashed JS. Vendor CDN <script>s
# are left exactly as-is.
sed \
  -e '\#href="styles/tokens.css"#d' \
  -e "s#href=\"styles/main.css\"#href=\"$CSS_NAME\"#" \
  -e "s#src=\"main.js\"#src=\"$JS_NAME\"#" \
  index.html > "$TMP/index.html"

# Minify the HTML itself — sed only rewrites tags, so without this step every
# source comment (vendor notes, layout hints) ships verbatim. Conservative
# whitespace collapse keeps a single space so inline-element layout is safe.
echo "  · minifying HTML (html-minifier-terser)"
npx --yes "$HTMLMIN" \
  --remove-comments \
  --collapse-whitespace \
  --conservative-collapse \
  --minify-css true \
  --minify-js true \
  -o "$OUTDIR/index.html" \
  "$TMP/index.html"

# --- 5b. Ship the first-run demo project. projectBar fetches it on first run
#         (empty storage) and imports it; it must sit next to index.html.
if [ -f demo.tilesetproj.json ]; then
  echo "  · copying demo project"
  cp demo.tilesetproj.json "$OUTDIR/"
fi

# --- 6. Report.
echo "✔ done → $OUTDIR/"
printf '  %-22s %s\n' "$JS_NAME"  "$(du -h "$OUTDIR/$JS_NAME"  | cut -f1)"
printf '  %-22s %s\n' "$CSS_NAME" "$(du -h "$OUTDIR/$CSS_NAME" | cut -f1)"
if [ -f "$OUTDIR/demo.tilesetproj.json" ]; then
  printf '  %-22s %s\n' "demo.tilesetproj.json" "$(du -h "$OUTDIR/demo.tilesetproj.json" | cut -f1)"
fi
