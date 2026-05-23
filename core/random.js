export function mulberry32(seed) {
  let a = (seed | 0) || 1;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// offset added to projectSeed (not just mixed) so a +1 step lands on a wholly
// different simplex slice rather than just nudging the mix.
export function variantRng(projectSeed, slotIndex, variantIdx, offset = 0) {
  const mixed = ((projectSeed + offset) * 1000003) ^ (slotIndex * 1009) ^ (variantIdx * 31);
  return mulberry32(mixed);
}
