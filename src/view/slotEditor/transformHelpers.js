// Shared D4 transform helpers used by both cutTransform and textureTransform
// UI rows. Encoding {rotate: 0..3, flipH: bool} matches the pipeline ops
// (flipH applied FIRST, then rotate).

// Group composition: op ∘ prev (apply op AFTER prev). Reflections are
// orientation-reversing, so rotation passes through with flipped sign
// when op.flipH is true.
export function composeD4(prev, op) {
  const sign = op.flipH ? -1 : 1;
  return {
    rotate: (((op.rotate + prev.rotate * sign) % 4) + 4) % 4,
    flipH: prev.flipH !== op.flipH,
  };
}

// Smallest k ∈ {1,2,3} such that rotating current by k×90° lands on an
// allowed state. Returns 0 if no other rotation in the coset is allowed
// (= cycle button has nowhere to go → caller should disable it).
export function nextRotateDelta(current, isAllowed) {
  for (let k = 1; k <= 3; k++) {
    const candidate = composeD4(current, { rotate: k, flipH: false });
    if (isAllowed(candidate)) return k;
  }
  return 0;
}
