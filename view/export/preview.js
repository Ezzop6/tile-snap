import { state } from "../../controller/state.js";
import { xs, PREVIEW_MIN_PX } from "./_state.js";
import { buildSlotBlock } from "./tile.js";
import { buildCutTransformControl } from "../slotEditor/cutTransform.js";

export function renderPreview() {
  if (!xs.previewEl) return;
  const idx = state.selectedSlotIndex;
  const slot = (idx !== null && idx !== undefined)
    ? state.template?.slots.find((s) => s.index === idx)
    : null;
  if (!slot) {
    xs.previewEl.innerHTML = `<p class="placeholder">Click a slot to preview it.</p>`;
    const stepperRow = document.querySelector(".export-preview-header .stepper-row");
    if (stepperRow) stepperRow.style.display = "none";
    const maskRow = document.getElementById("export-preview-mask");
    if (maskRow) { maskRow.style.display = "none"; maskRow.innerHTML = ""; }
    xs.previewEl.closest(".panel-section")?.classList.remove("is-variant-preview");
    return;
  }
  // Clamp: variant count may have dropped or template changed.
  const maxV = state.getExportVariantCount(slot.index) - 1;
  if (xs.selectedVariantIdx > maxV) xs.selectedVariantIdx = 0;
  const isVariant = xs.selectedVariantIdx > 0;
  const canvas = buildSlotBlock(slot, isVariant, xs.selectedVariantIdx);

  // Fixed 250px target, scaled DOWN only when panel is too narrow.
  const cs = getComputedStyle(xs.previewEl);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const availW = Math.max(PREVIEW_MIN_PX, xs.previewEl.clientWidth - padX);
  const display = Math.max(PREVIEW_MIN_PX, Math.floor(Math.min(250, availW)));
  canvas.style.width  = `${display}px`;
  canvas.style.height = `${display}px`;
  canvas.classList.remove("is-selected");
  xs.previewEl.innerHTML = "";
  xs.previewEl.appendChild(canvas);

  // Rows 2 (steppers) + 3 (mask) are variant-only — V=0 mirrors the slot-editor
  // pin and is read-only, so collapse both rows entirely for the master tile.
  const stepperRow = document.querySelector(".export-preview-header .stepper-row");
  if (stepperRow) stepperRow.style.display = isVariant ? "" : "none";
  const maskRow = document.getElementById("export-preview-mask");
  if (maskRow) {
    maskRow.style.display = isVariant ? "" : "none";
    // (Re)build the per-variant mask transform — same widget + symmetry gating
    // as the slot-editor cut row, writing to this variant. Effective value
    // inherits the master when the variant has no explicit override.
    maskRow.innerHTML = "";
    if (isVariant) {
      maskRow.appendChild(buildCutTransformControl({
        pattern: slot.array,
        label:   "mask",
        read:  () => state.effectiveVariantCutTransform(slot.index, xs.selectedVariantIdx),
        write: (next) => state.setVariantCutTransform(slot.index, xs.selectedVariantIdx, next),
      }));
    }
  }
  xs.previewEl.closest(".panel-section")?.classList.toggle("is-variant-preview", isVariant);
  if (isVariant) {
    syncStepper("A", slot, isVariant);
    syncStepper("B", slot, isVariant);
    syncSeedStepper(slot, isVariant);
  }
}

function syncStepper(key, slot, isVariant) {
  // Variant focus: per-variant override (what steppers modify). Template focus:
  // slot-level override so the label reflects what V=0 will render with.
  const ov = isVariant
    ? state.getVariantPoolOverride(slot.index, xs.selectedVariantIdx)
    : state.getSlotPoolOverride(slot.index);
  const cur = ov[key];
  const label = document.getElementById(`export-preview-${key.toLowerCase()}-label`);
  if (label) label.textContent = cur == null ? `${key}-·` : `${key}-${cur}`;
  const disabled = !isVariant || state.pool(key).length === 0;
  for (const id of [`export-preview-${key.toLowerCase()}-prev`,
                    `export-preview-${key.toLowerCase()}-next`]) {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = disabled;
  }
}

function syncSeedStepper(slot, isVariant) {
  const label = document.getElementById("export-preview-seed-label");
  if (label) {
    if (!isVariant) {
      label.textContent = "s·";
    } else {
      const offset = state.getVariantSeedOffset(slot.index, xs.selectedVariantIdx);
      const sign = offset >= 0 ? "+" : "";
      label.textContent = `s${sign}${offset}`;
    }
  }
  if (xs.previewPrevBtn) xs.previewPrevBtn.disabled = !isVariant;
  if (xs.previewNextBtn) xs.previewNextBtn.disabled = !isVariant;
}

export function bumpSelectedVariantSeed(delta) {
  const idx = state.selectedSlotIndex;
  if (idx === null || idx === undefined) return;
  if (xs.selectedVariantIdx <= 0) return;
  state.adjustVariantSeedOffset(idx, xs.selectedVariantIdx, delta);
}

// Only touches the per-variant override; slotPoolOverride (V=0 preview pin) is untouched.
export function bumpPoolIndex(key, delta) {
  const idx = state.selectedSlotIndex;
  if (idx === null || idx === undefined) return;
  if (xs.selectedVariantIdx <= 0) return;
  const poolLen = state.pool(key).length;
  if (poolLen === 0) return;
  const ov = state.getVariantPoolOverride(idx, xs.selectedVariantIdx);
  const cur = ov[key] == null ? 0 : ov[key];
  const next = ((cur + delta) % poolLen + poolLen) % poolLen;
  if (next === cur && ov[key] != null) return;
  state.setVariantPoolOverride(idx, xs.selectedVariantIdx, key, next);
}
