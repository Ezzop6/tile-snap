import { applyTextureTransform } from "./textureTransform/index.js";

// Stage-B per-tile composition pipeline (ctx-mutation phase). Currently
// just textureTransform (D4 flip/rotate around slot centre). Bitmap-level
// preprocessors (autoTileable etc.) hook in differently — they transform
// the source canvas BEFORE drawImage, not the ctx state.
export function applyTextureOpsPre(ctx, slot, poolKey, origin, viewSize) {
  applyTextureTransform(ctx, slot, poolKey, origin, viewSize);
}

// Reserved for future post-draw effects (e.g. smartBlend on the cut edge).
// No-op today.
export function applyTextureOpsPost(/* ctx, slot, poolKey, origin, viewSize, cutPath */) {}
