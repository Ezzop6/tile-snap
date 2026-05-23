# Release build for the Tileset Generator (opt-in deployment step).
# The dev workflow stays build-free — open index.html directly.
#
# Targets:
#   make build         minify + light obfuscation (distribution default)
#   make build-min     minify only (fastest runtime, no obfuscation)
#   make build-light   minify + light obfuscation
#   make build-heavy   minify + heavy obfuscation (expect perf cost)
#   make serve         build then serve dist/ at http://localhost:8000
#   make clean         remove dist/

.PHONY: build build-min build-light build-heavy serve clean

build: build-light

build-min:
	OBFUSCATE=none ./build.sh

build-light:
	OBFUSCATE=light ./build.sh

build-heavy:
	OBFUSCATE=heavy ./build.sh

serve: build
	@echo "serving dist/ at http://localhost:8000  (Ctrl+C to stop)"
	python3 -m http.server 8000 --directory dist

clean:
	rm -rf dist
