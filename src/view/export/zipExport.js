// Single-project ZIP: PNG atlas + project JSON (self-contained, same shape
// as the standalone Export JSON) + .tres for Godot. Everything that belongs
// to the project in one archive, ready to drop into res:// or re-import
// elsewhere via the JSON.

import { state } from "../../controller/state.js";
import { buildProjectExportPayload } from "../../controller/exportBundle.js";
import { buildExportCanvas, canvasToBlob, downloadBlob } from "./png.js";
import { buildTilesetTres } from "./tresBuilder.js";
import { showToast } from "../toast.js";

export async function runZipExport() {
  if (!window.JSZip) {
    showToast("Export ZIP failed: JSZip library not loaded", { kind: "error" });
    return;
  }
  try {
    const built = await buildExportCanvas();
    if (!built) return;
    const pngBlob = await canvasToBlob(built.canvas, "image/png");
    if (!pngBlob) {
      showToast("Export ZIP failed: PNG generation returned null", { kind: "error" });
      return;
    }

    const baseName  = built.filename || state.projectName || "untitled";
    const pngName   = `${baseName}.png`;
    const tresName  = `${baseName}.tres`;
    const jsonName  = `${baseName}.tilesetproj.json`;
    const zipName   = `${baseName}.zip`;

    // .tres references the PNG by relative path inside the ZIP — same name
    // as the bundled PNG so a Godot import preserves the link.
    const tres = buildTilesetTres({
      template:          state.template,
      layout:            built.layout,
      slotsWithVariants: built.slotsWithVariants,
      slotSize:          built.slotSize,
      sourceLayout:      built.sourceLayout,
      atlasPath:         `res://${pngName}`,
    });

    const payload = buildProjectExportPayload();
    const json    = JSON.stringify(payload, null, 2);

    const zip = new window.JSZip();
    zip.file(pngName,  pngBlob);
    zip.file(tresName, tres);
    zip.file(jsonName, json);
    const zipBlob = await zip.generateAsync({ type: "blob" });

    downloadBlob(zipBlob, zipName);
  } catch (err) {
    console.error("[zipExport] failed:", err);
    showToast(`Export ZIP failed: ${err.message || err}`, { kind: "error" });
  }
}
