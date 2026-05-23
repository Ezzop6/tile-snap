// Export the active project as a self-contained JSON file. Same blob shape
// as the modal's per-row Export JSON (= buildProjectExportPayload) so
// re-import via drag-drop / modal Import resolves identically.

import { state } from "../../controller/state.js";
import { buildProjectExportPayload } from "../../controller/exportBundle.js";
import { downloadBlob } from "./png.js";
import { showToast } from "../toast.js";

export function runJsonExport() {
  try {
    const payload = buildProjectExportPayload();
    const json    = JSON.stringify(payload, null, 2);
    const blob    = new Blob([json], { type: "application/json" });
    const name    = state.projectName || "untitled";
    downloadBlob(blob, `${name}.tilesetproj.json`);
  } catch (err) {
    console.error("[jsonExport] failed:", err);
    showToast(`Export JSON failed: ${err.message || err}`, { kind: "error" });
  }
}
