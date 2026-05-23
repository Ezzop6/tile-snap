import { state } from "../../controller/state.js";
import { REFERENCE_SLOT_SIZE } from "./buildSlotGraph.js";
import { withSlotTransform } from "./viewTransform.js";
import { buildCutPath } from "./cutFill.js";
import { applyTextureOpsPre, applyTextureOpsPost } from "./textureOps/pipeline.js";
import { timed } from "../../core/trace.js";
import { TEXTURE_OPS } from "./textureOps/registry.js";

const _centerRGBCache = new WeakMap();

export function drawSlotComposite(ctx, slot, graph, origin, viewSize, opts = {}) {
  const mode = opts.mode ?? state.renderMode ?? "smooth";
  const snap = mode === "pixel";
  const sourceARef = opts.sourceARef ?? resolvePoolRef(slot, "A");
  const sourceBRef = opts.sourceBRef ?? resolvePoolRef(slot, "B");

  withSlotTransform(ctx, origin, viewSize, () => {
    ctx.save();
    ctx.imageSmoothingEnabled = !snap;

    // BG color fill stays in untransformed REF (pad for transparent pixels).
    // The texture bitmap drawImage is texture-transformed; clip path
    // (when present, FG layer) is registered BEFORE the transform so the
    // cut boundary stays anchored regardless of texture flip/rotate.
    if (sourceBRef) {
      const tile = resolveTile(sourceBRef);
      if (tile) {
        const bg = sampleCenterRGB(tile.canvas);
        if (bg) {
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, REFERENCE_SLOT_SIZE, REFERENCE_SLOT_SIZE);
        }
        const bmp = sourceBitmap(tile.canvas, "B");
        ctx.save();
        applyTextureOpsPre(ctx, slot, "B", { x: 0, y: 0 }, REFERENCE_SLOT_SIZE);
        ctx.drawImage(bmp, 0, 0, REFERENCE_SLOT_SIZE, REFERENCE_SLOT_SIZE);
        ctx.restore();
      }
    }

    if (sourceARef) {
      const tileA = resolveTile(sourceARef);
      const clip  = buildCutPath(graph, { snap, viewSize });
      if (tileA && clip) {
        const bmp = sourceBitmap(tileA.canvas, "A");
        ctx.save();
        ctx.clip(clip, "evenodd");
        ctx.save();
        applyTextureOpsPre(ctx, slot, "A", { x: 0, y: 0 }, REFERENCE_SLOT_SIZE);
        ctx.drawImage(bmp, 0, 0, REFERENCE_SLOT_SIZE, REFERENCE_SLOT_SIZE);
        ctx.restore();
        applyTextureOpsPost(ctx, slot, "A", { x: 0, y: 0 }, REFERENCE_SLOT_SIZE, clip);
        ctx.restore();
      }
    }
    ctx.restore();
  });
}

function resolvePoolRef(slot, key) {
  const ov = state.getSlotPoolOverride(slot.index);
  if (ov?.[key] != null) {
    const ref = state.poolAt(key, ov[key]);
    if (ref) return ref;
  }
  return state.master(key);
}

// Bitmap-level preprocessors chained for the active pool. Each is cached
// per its own params; identity ops short-circuit to the input canvas.
// Registry-driven bitmap preprocessor chain. Order = TEXTURE_OPS array
// order. Ops short-circuit on identity params internally.
function sourceBitmap(srcCanvas, poolKey) {
  let bmp = srcCanvas;
  for (const op of TEXTURE_OPS) {
    const params = state.getGlobalTextureOp(poolKey, op.name);
    if (params) bmp = timed(`tex:${op.name}`, () => op.apply(bmp, poolKey, params));
  }
  return bmp;
}

function resolveTile(ref) {
  const input = state.inputs.find((inp) => inp.id === ref.inputId);
  if (!input) return null;
  return input.tiles.find((t) => t.row === ref.tileRow && t.col === ref.tileCol) || null;
}

function sampleCenterRGB(tcanvas) {
  if (!tcanvas || !tcanvas.width || !tcanvas.height) return null;
  const cached = _centerRGBCache.get(tcanvas);
  if (cached) return cached;
  const cx = tcanvas.width  >> 1;
  const cy = tcanvas.height >> 1;
  const d  = tcanvas.getContext("2d").getImageData(cx, cy, 1, 1).data;
  const rgb = `rgb(${d[0]},${d[1]},${d[2]})`;
  _centerRGBCache.set(tcanvas, rgb);
  return rgb;
}
