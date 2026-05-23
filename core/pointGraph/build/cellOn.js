// Array form covers triangle/pinwheel half-cell values.
export function cellOn(v) {
  if (Array.isArray(v)) return v.some((x) => x);
  return !!v;
}
