// Returns `baseName` if it isn't in `taken`, else `baseName (N)` with the
// smallest free N≥2. Shared by findFreeProjectName + findFreeTemplateName —
// each builds its own `taken` Set, this owns the " (N)" suffix logic.
export function firstFreeName(baseName, taken) {
  const base = String(baseName ?? "untitled").trim() || "untitled";
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}
