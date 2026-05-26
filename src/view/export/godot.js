// Godot 4 TileSet export = PNG sheet (same as default PNG export) + .tres
// referencing it. Two sequential downloads; user drops both into their
// `res://` folder. No UID files — Godot re-derives them on import.

import { state } from "../../controller/state.js";
import { buildExportCanvas, canvasToBlob, downloadBlob } from "./png.js";
import { buildTilesetTres } from "./tresBuilder.js";
import { analyzeTerrainCoverage } from "./peeringBits.js";
import { showToast } from "../toast.js";

export async function runGodotExport() {
  const built = await buildExportCanvas();
  if (!built) return;

  const pngBlob = await canvasToBlob(built.canvas, "image/png");
  if (!pngBlob) {
    console.error("[godot] PNG generation failed");
    return;
  }

  const pngName = `${built.filename}.png`;
  const tresName = `${built.filename}.tres`;
  const atlasPath = `res://${pngName}`;

  const tres = buildTilesetTres({
    template: state.template,
    layout: built.layout,
    slotsWithVariants: built.slotsWithVariants,
    slotSize: built.slotSize,
    sourceLayout: built.sourceLayout,
    atlasPath,
  });
  const tresBlob = new Blob([tres], { type: "text/plain" });

  // Both blobs triggered back-to-back inside the same task so browsers
  // see them as one multi-download request (and apply transient
  // activation to both) rather than two separate gestures. setTimeout
  // delays push the second click past the gesture window in Firefox →
  // silent block. If a browser still drops one, the fallback toast
  // gives the user a manual second-click button.
  downloadBlob(pngBlob, pngName);
  downloadBlob(tresBlob, tresName);
  offerManualTresDownload(tresBlob, tresName);

  warnMissingInteriors();
}

// Browsers throttle multi-file downloads from a single user gesture —
// Firefox in particular silently drops the second file. Toast with an
// action button gives the user a fresh gesture to re-trigger the .tres
// download in case the auto-fire was suppressed. (PNG always saves —
// it's the first download in the burst.)
function offerManualTresDownload(tresBlob, tresName) {
  showToast(
    `If "${tresName}" didn't download, click here:`,
    {
      kind: "info",
      duration: 8000,
      action: {
        label: `Save ${tresName}`,
        onClick: () => downloadBlob(tresBlob, tresName),
      },
    },
  );
}

// Check template terrain coverage; warn when the template lacks the
// interior tile Godot's autotile painter needs to fill deep regions.
//   - T0 interior must come from the template itself — pool A bundle
//     emits plain untagged atlas tiles and doesn't help here.
//   - T1 interior can come from the template OR from a bundled pool B
//     (B entries are tagged terrain=1 + all peering bits=1).
function warnMissingInteriors() {
  const { hasT0Interior, hasT1Interior } = analyzeTerrainCoverage(state.template);
  if (!hasT0Interior) {
    showToast(
      "Template is missing a T0 interior tile — Godot autotile won't fill "
      + "deep Terrain 0 areas. Add an all-foreground slot to the template "
      + "(e.g. 3×3 with center on + all sides on, or 2×2 [[1,1],[1,1]]).",
      { kind: "error", duration: 6000 },
    );
  }
  if (!hasT1Interior && !state.exportIncludeSourceB) {
    showToast(
      "Template is missing a T1 interior tile and Pool B isn't bundled — "
      + "Godot autotile won't fill deep Terrain 1 areas. Enable “Bundle sources: Pool B” in Main to plug the gap.",
      { kind: "error", duration: 6000 },
    );
  }
}
