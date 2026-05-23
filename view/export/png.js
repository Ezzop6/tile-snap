// Two render passes onto an offscreen canvas: V=0 (template row) honours
// slotPoolOverride; V>=1 builds per-variant slotOverrides and re-renders the
// whole template, then crops contributing slots into the variant cells.
// Smooth mode renders at 2x internally so bilinear downsample bakes AA into PNG.

import { state } from "../../controller/state.js";
import { renderTemplate } from "../render2/index.js";
import { computeLayout, variantCellInGroup, computeSourceLayout } from "./layout.js";
import { buildVariantOverride, applyPoolTextureOps } from "./tile.js";

export async function runExport() {
  const built = await buildExportCanvas();
  if (!built) return;
  const blob = await canvasToBlob(built.canvas, "image/png");
  if (!blob) {
    // eslint-disable-next-line no-console
    console.error("[exportPanel] canvas.toBlob returned null");
    return;
  }
  downloadBlob(blob, `${built.filename}.png`);
}

// Renders the full export sheet (master template + packed variants) to an
// offscreen canvas without downloading. Returned `layout` matches the canvas
// grid 1:1 so callers (e.g. Godot .tres builder) can map each PNG cell back
// to its source slot + variant index.
export async function buildExportCanvas() {
  if (!state.template) return null;

  const slotSize = state.nativeSlotSize;
  const filename = sanitizeFilename(state.projectName) || "tileset";
  const t = state.template;
  const isSmooth = state.renderMode === "smooth";

  const renderScale = isSmooth ? 2 : 1;
  const internalSlot = slotSize * renderScale;

  // Sort order must match renderLayout() so on-screen preview maps 1:1 to PNG.
  const slotsWithVariants = t.slots
    .filter((s) => state.getExportVariantCount(s.index) > 1)
    .sort((a, b) => (a.row - b.row) || (a.col - b.col));

  const layout = computeLayout(t, slotsWithVariants);
  const outCols = layout.outCols;
  const outRows = layout.outRows;

  // Source-tile rows are appended BELOW the atlas. A and B opt in
  // independently; layout helper handles skipping disabled pools.
  const sourceLayout = computeSourceLayout(
    outCols, outRows,
    state.exportIncludeSourceA, state.exportIncludeSourceB,
  );

  const out = document.createElement("canvas");
  out.width  = outCols * slotSize;
  out.height = (outRows + sourceLayout.totalRows) * slotSize;
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = isSmooth;
  if (isSmooth) ctx.imageSmoothingQuality = "high";

  // Honour the "Islands" toggle: when off, the editor previews show clean
  // cuts without noise — PNG export should match that. Variants' own noise
  // overrides get masked out via renderTemplate's freezeNoise branch.
  const freezeNoise = !state.exportShowIslands;

  const preview0 = document.createElement("canvas");
  renderTemplate(preview0, {
    slotSize: internalSlot,
    slotGap: 0,
    showCurveDebug: false,
    showSelectionFrame: false,
    freezeNoise,
    includeNoise: true, // PNG export bypasses both gates — always full quality.
    includeWave: true,
    dpr: 1,
    pxScale: renderScale,
    transparentBg: true,
    ignoreSlotPoolOverride: false,
  });
  for (const slot of t.slots) {
    ctx.drawImage(
      preview0,
      slot.col * internalSlot, slot.row * internalSlot, internalSlot, internalSlot,
      slot.col * slotSize,     slot.row * slotSize,     slotSize,     slotSize,
    );
  }

  // Wasteful (re-renders the whole template per V); one-shot export, fine.
  const maxVariants = slotsWithVariants.reduce(
    (m, s) => Math.max(m, state.getExportVariantCount(s.index)), 1);
  for (let V = 1; V < maxVariants; V++) {
    const slotOverrides = new Map();
    const activeSlots = [];
    for (const slot of slotsWithVariants) {
      const count = state.getExportVariantCount(slot.index);
      if (V >= count) continue;
      const ov = buildVariantOverride(slot.index, V);
      if (ov) slotOverrides.set(slot.index, ov);
      activeSlots.push(slot);
    }
    if (activeSlots.length === 0) continue;

    const previewV = document.createElement("canvas");
    renderTemplate(previewV, {
      slotSize: internalSlot,
      slotGap: 0,
      showCurveDebug: false,
      showSelectionFrame: false,
      freezeNoise,
      includeNoise: true, // Variants also bypass the gates — full quality export.
      includeWave: true,
      dpr: 1,
      pxScale: renderScale,
      slotOverrides,
      transparentBg: true,
      ignoreSlotPoolOverride: true,
    });

    for (const slot of activeSlots) {
      const groupIdx = slotsWithVariants.indexOf(slot);
      const g = layout.groups[groupIdx];
      const srcX = slot.col * internalSlot;
      const srcY = slot.row * internalSlot;
      const { col: dstCol, row: dstRow } = variantCellInGroup(g, V - 1);
      ctx.drawImage(
        previewV,
        srcX, srcY, internalSlot, internalSlot,
        dstCol * slotSize, dstRow * slotSize, slotSize, slotSize,
      );
    }
  }

  // After atlas + variants are blitted, paint source tiles in their reserved
  // rows. Run each bundled bitmap through the active pool's texture-ops
  // chain so the .png matches what the user sees in the layout preview.
  for (const entry of sourceLayout.entries) {
    if (!entry.tile?.canvas) continue;
    const processed = applyPoolTextureOps(entry.tile.canvas, entry.key);
    ctx.drawImage(
      processed,
      0, 0, processed.width, processed.height,
      entry.col * slotSize, entry.row * slotSize, slotSize, slotSize,
    );
  }

  return { canvas: out, filename, slotSize, layout, slotsWithVariants, sourceLayout };
}


export { canvasToBlob, downloadBlob };

function canvasToBlob(canvas, type) {
  return new Promise((resolve) => canvas.toBlob(resolve, type));
}

function downloadBlob(blob, filename) {
  // Firefox needs the anchor in document.body to honour `download`; otherwise
  // clicks navigate to the blob URL and reload the page. Defer revoke so the
  // blob is still readable while the save dialog is open.
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}

function sanitizeFilename(s) {
  return String(s || "").trim().replace(/[\\/:*?"<>|]+/g, "_");
}
