// Is a pattern cell "on" (filled)? Scalar → truthy; array (triangle/pinwheel
// half-cell values) → any wedge on. Single source of truth for this check
// across the build pipeline, renderers, export, and editors.
export function cellOn(v) {
  if (Array.isArray(v)) return v.some((x) => x);
  return !!v;
}
