# Release build for TileSnap (opt-in deployment step).
# The dev workflow stays build-free — open index.html directly.
#
# All builds bake DEBUG off (debug UI hidden). You can still flip it on at
# runtime in any shipped build: localStorage["tilesnap.debug"]="1" + reload.
#
# Targets:
#   make build         minify + light obfuscation (distribution default)
#   make build-min     minify only (fastest runtime, no obfuscation)
#   make build-light   minify + light obfuscation
#   make build-heavy   minify + heavy obfuscation (expect perf cost)
#   make build-debug   minify only + DEBUG baked ON (debug UI visible)
#   make serve         build then serve dist/ at http://localhost:8000
#   make clean         remove dist/

.PHONY: build build-min build-light build-heavy build-debug serve clean

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
