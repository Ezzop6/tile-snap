// `a`/`b` are cell values from cellAt(): -1 = OOB outside slot.
export function classifyRole(a, b) {
  if (a === -1 || b === -1) {
    return (a === 1 || b === 1) ? "closure" : "internal";
  }
  if (a !== b) return "cut";
  return "internal";
}
