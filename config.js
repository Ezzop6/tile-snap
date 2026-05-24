// App-wide config flags. Shared across modules — keep dependency-free
// (no imports from view/ or controller/) so anything can read it.

// Debug flag: shows the Debug mode tab + tracing controls, unlocks the
// "(not implemented)" cell shapes + terrain modes for in-progress testing.
//
// Resolved in two layers — EITHER turns it on:
//   1. BAKED default — the `false` below (edit freely for dev). The build can
//      override it via esbuild --define (build.sh: DEBUG_BUILD=true|false),
//      so you can ship a debug-on build on purpose. `typeof` guard keeps this
//      safe in dev where the define is absent.
//   2. RUNTIME override — set  localStorage["tilesnap.debug"] = "1"  and
//      reload. Survives obfuscation (stable string key, not a mangled name),
//      so a shipped/obfuscated build can be flipped into debug mode straight
//      from the DevTools console — no rebuild. Turn off: removeItem or set "0".
const DEBUG_BAKED = typeof __TILESNAP_DEBUG__ === "boolean" ? __TILESNAP_DEBUG__ : false;

export const DEBUG =
  DEBUG_BAKED ||
  (() => {
    try {
      return globalThis.localStorage?.getItem("tilesnap.debug") === "1";
    } catch {
      return false;
    }
  })();

// Tool version embedded into every saved project / template / export JSON.
// Schema is MVP / pre-1.0 — semver major stays at 0 while we iterate freely
// without compatibility shims (no migrations needed across 0.x bumps).
// Bump rules from 1.0 onward: MAJOR for breaking schema changes (consumers
// must migrate), MINOR for additive schema (new fields with defaults), PATCH
// for behaviour fixes that don't change the schema.
export const VERSION = "0.0.0";
