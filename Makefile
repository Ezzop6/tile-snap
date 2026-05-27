# Release builds for TileSnap. The dev workflow stays build-free — open
# src/index.html (served over a real origin: `npm start`, or `make serve`).
#
# All outputs land under release/<target>/:
#   release/web      web build (static site; vendor stays on CDN)
#   release/linux    Linux AppImage
#   release/win      Windows portable .exe
#   release/mac      macOS dmg + zip
#
# All builds bake DEBUG off (debug UI hidden). Flip it on at runtime in any
# shipped build: localStorage["tilesnap.debug"]="1" + reload.
#
# Versioning: package.json#version is the single source of truth. `version-sync`
# stamps it into src/config.js (the value baked into saved/exported project
# JSON) and runs automatically before every build — so bumping package.json
# (or `npm version x.y.z`) is enough; don't hand-edit config.js's VERSION.
#
# Web build (→ release/web, vendor stays on CDN):
#   make build         minify + light obfuscation (distribution default)
#   make build-min     minify only (fastest runtime, no obfuscation)
#   make build-light   minify + light obfuscation
#   make build-heavy   minify + heavy obfuscation (expect perf cost)
#   make build-debug   minify only + DEBUG baked ON (debug UI visible)
#   make serve         build then serve release/web at http://localhost:8000
#   make clean         remove release/web
#
# Desktop app build (Electron → release/<platform>, vendor bundled offline):
#   make app           build for the current host platform
#   make app-linux     AppImage          → release/linux
#   make app-win       Windows portable  → release/win  (from Linux needs wine)
#   make app-mac       macOS dmg + zip   → release/mac  (must run ON macOS)
#   make clean-app     remove release/{linux,win,mac}

.PHONY: build build-min build-light build-heavy build-debug serve clean \
        version-sync app app-linux app-win app-mac clean-app

WEB_OUT := release/web

# Single source of truth = package.json#version → stamp into src/config.js.
# Runs before every build so the embedded tool version can't drift from the
# binary version. No-op rewrite when they already match.
version-sync:
	@v=$$(node -p "require('./package.json').version"); \
	sed -i.bak -E 's/(export const VERSION = )"[^"]*"/\1"'"$$v"'"/' src/config.js && rm -f src/config.js.bak; \
	echo "  · src/config.js VERSION synced to $$v (from package.json)"

build: build-light

build-min: version-sync
	OBFUSCATE=none OUTDIR=$(WEB_OUT) ./build.sh

build-light: version-sync
	OBFUSCATE=light OUTDIR=$(WEB_OUT) ./build.sh

build-heavy: version-sync
	OBFUSCATE=heavy OUTDIR=$(WEB_OUT) ./build.sh

build-debug: version-sync
	DEBUG_BUILD=true OBFUSCATE=none OUTDIR=$(WEB_OUT) ./build.sh

serve: build
	@echo "serving $(WEB_OUT)/ at http://localhost:8000  (Ctrl+C to stop)"
	python3 -m http.server 8000 --directory $(WEB_OUT)

clean:
	rm -rf $(WEB_OUT)

# --- Desktop app (Electron) -------------------------------------------------
# Each platform target is independent. electron-builder + electron come from
# node_modules; the node_modules target installs them on demand (only when the
# directory is absent). -c.directories.output overrides package.json's default
# so each platform lands in its own release/<platform>/ subfolder.

node_modules:
	npm install

app: node_modules version-sync
	@case "$$(uname -s)" in \
	  Linux)  npx electron-builder --linux -c.directories.output=release/linux ;; \
	  Darwin) npx electron-builder --mac   -c.directories.output=release/mac ;; \
	  *)      npx electron-builder         -c.directories.output=release/host ;; \
	esac

app-linux: node_modules version-sync
	npx electron-builder --linux -c.directories.output=release/linux

app-win: node_modules version-sync
	npx electron-builder --win -c.directories.output=release/win

app-mac: node_modules version-sync
	npx electron-builder --mac -c.directories.output=release/mac

clean-app:
	rm -rf release/linux release/win release/mac release/host
