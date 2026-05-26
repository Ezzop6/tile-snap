# Release build for TileSnap (opt-in deployment step).
# The dev workflow stays build-free — open src/index.html directly.
#
# All builds bake DEBUG off (debug UI hidden). You can still flip it on at
# runtime in any shipped build: localStorage["tilesnap.debug"]="1" + reload.
#
# Web build (→ dist/, vendor stays on CDN):
#   make build         minify + light obfuscation (distribution default)
#   make build-min     minify only (fastest runtime, no obfuscation)
#   make build-light   minify + light obfuscation
#   make build-heavy   minify + heavy obfuscation (expect perf cost)
#   make build-debug   minify only + DEBUG baked ON (debug UI visible)
#   make serve         build then serve dist/ at http://localhost:8000
#   make clean         remove dist/
#
# Desktop app build (Electron → release/, vendor bundled offline):
#   make app           build for the current host platform
#   make app-linux     AppImage
#   make app-win       Windows portable .exe (from Linux needs wine installed)
#   make app-mac       macOS dmg + zip (must run ON macOS — cannot cross-build)
#   make clean-app     remove release/

.PHONY: build build-min build-light build-heavy build-debug serve clean \
        app app-linux app-win app-mac clean-app

build: build-light

build-min:
	OBFUSCATE=none ./build.sh

build-light:
	OBFUSCATE=light ./build.sh

build-heavy:
	OBFUSCATE=heavy ./build.sh

build-debug:
	DEBUG_BUILD=true OBFUSCATE=none ./build.sh

serve: build
	@echo "serving dist/ at http://localhost:8000  (Ctrl+C to stop)"
	python3 -m http.server 8000 --directory dist

clean:
	rm -rf dist

# --- Desktop app (Electron) -------------------------------------------------
# Each platform target is independent. electron-builder + electron come from
# node_modules; the node_modules target installs them on demand (only when the
# directory is absent).

node_modules:
	npm install

app: node_modules
	npx electron-builder

app-linux: node_modules
	npx electron-builder --linux

app-win: node_modules
	npx electron-builder --win

app-mac: node_modules
	npx electron-builder --mac

clean-app:
	rm -rf release
