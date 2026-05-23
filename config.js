// App-wide config flags. Shared across modules — keep dependency-free
// (no imports from view/ or controller/) so anything can read it.

// Debug build: enables the legacy Map tab, unlocks the "(not implemented)"
// cell shapes + terrain modes for in-progress testing. Off in normal use.
export const DEBUG = true;

// Tool version embedded into every saved project / template / export JSON.
// Schema is MVP / pre-1.0 — semver major stays at 0 while we iterate freely
// without compatibility shims (no migrations needed across 0.x bumps).
// Bump rules from 1.0 onward: MAJOR for breaking schema changes (consumers
// must migrate), MINOR for additive schema (new fields with defaults), PATCH
// for behaviour fixes that don't change the schema.
export const VERSION = "0.0.0";
