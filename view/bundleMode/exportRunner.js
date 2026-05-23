// Export button handler — orchestrates buildBundleZip + a transient
// progress overlay over the bundle stage. AbortController lets the user
// cancel between projects; the `exporting` flag in state.js gates the
// matrix re-render listeners so we don't flicker mid-export.

import { state } from "../../controller/state.js";
import { buildBundleZip } from "../export/bundleExport.js";
import { showToast } from "../toast.js";
import {
  bundled, dom, setExporting, isActive, renderAll,
} from "./state.js";
import { findInvalidEntries } from "./matrix.js";

export async function onExportClick() {
  if (bundled.length === 0) {
    showToast("Add at least one project to the bundle", { kind: "info" });
    return;
  }
  // Pre-flight: refuse to build a bundle when any entry's saved blob
  // points at a deleted template. Otherwise the export would silently
  // render with whatever fallback state.deserialize lands on (= a wrong
  // template) and the user would only notice after opening the .tres
  // in Godot. Defensive: user knew what they were deleting; force them
  // to re-save the project with a valid template before bundling.
  const invalid = findInvalidEntries();
  if (invalid.length > 0) {
    const names = invalid.slice(0, 3).map((e) => `"${e.projectName}"`).join(", ");
    const more  = invalid.length > 3 ? ` (+${invalid.length - 3} more)` : "";
    showToast(
      `Bundle export blocked — ${invalid.length} project${invalid.length === 1 ? "" : "s"} reference${invalid.length === 1 ? "s" : ""} a missing template: ${names}${more}. Load each highlighted project and re-save with a valid template.`,
      { kind: "error", duration: 8000 },
    );
    return;
  }
  const bundleName = (dom.nameInput?.value || "").trim() || "bundle";
  const btn = document.getElementById("bundle-export");
  if (btn) { btn.disabled = true; btn.textContent = "Building…"; }
  const controller = new AbortController();
  const progress = openExportProgress({
    total: bundled.length,
    onAbort: () => controller.abort(),
  });
  setExporting(true);
  try {
    const entries = bundled.map((e) => ({ projectId: e.projectId, reversed: e.reversed }));
    const { zip, filename } = await buildBundleZip({
      entries,
      bundleName,
      atlasPathPrefix: state.bundleAtlasPath,
      signal: controller.signal,
      onProgress: (info) => progress.update(info),
    });
    progress.update({ stage: "zipping" });
    const blob = await zip.generateAsync({ type: "blob" });
    triggerDownload(blob, filename);
    showToast(`Exported ${filename}`, { kind: "info" });
  } catch (err) {
    if (controller.signal.aborted) {
      showToast("Bundle export aborted", { kind: "info" });
    } else {
      console.error("[bundleMode] export failed:", err);
      showToast(`Bundle export failed: ${err.message ?? err}`, { kind: "error" });
    }
  } finally {
    setExporting(false);
    progress.close();
    if (btn) { btn.disabled = false; btn.textContent = "Export bundle (ZIP)"; }
    // Catch up on whatever state shifts we suppressed during the run.
    if (isActive()) renderAll();
  }
}

// Builds a transient overlay over the bundle stage with per-project
// status, a progress bar, and an abort button. Returns an `update` /
// `close` API so the export driver can drive it without owning DOM.
function openExportProgress({ total, onAbort }) {
  const overlay = document.createElement("div");
  overlay.className = "bundle-progress";

  const card = document.createElement("div");
  card.className = "bundle-progress__card";

  const title = document.createElement("div");
  title.className = "bundle-progress__title";
  title.textContent = "Building bundle…";
  card.append(title);

  const status = document.createElement("div");
  status.className = "bundle-progress__status";
  status.textContent = `Starting (0 / ${total})`;
  card.append(status);

  const barWrap = document.createElement("div");
  barWrap.className = "bundle-progress__bar";
  const bar = document.createElement("div");
  bar.className = "bundle-progress__bar-fill";
  barWrap.append(bar);
  card.append(barWrap);

  const abortBtn = document.createElement("button");
  abortBtn.type = "button";
  abortBtn.className = "btn";
  abortBtn.textContent = "Abort";
  abortBtn.addEventListener("click", () => {
    abortBtn.disabled = true;
    abortBtn.textContent = "Aborting…";
    onAbort?.();
  });
  card.append(abortBtn);

  overlay.append(card);
  dom.matrixEl?.append(overlay);

  return {
    update({ index, total: t, projectName, stage }) {
      if (stage === "zipping") {
        status.textContent = `Packing ZIP…`;
        bar.style.width = "100%";
        abortBtn.disabled = true;
        return;
      }
      const i = (index ?? 0) + 1;
      const denom = t ?? total;
      status.textContent = projectName
        ? `Rendering "${projectName}" (${i} / ${denom})`
        : `Rendering (${i} / ${denom})`;
      bar.style.width = `${Math.round(((index ?? 0) / Math.max(1, denom)) * 100)}%`;
    },
    close() { overlay.remove(); },
  };
}

// Defer the revoke so the browser has time to start downloading the blob.
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 60_000);
}
