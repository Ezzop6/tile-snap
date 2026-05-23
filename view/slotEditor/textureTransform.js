import { state } from "../../controller/state.js";
import { composeD4, nextRotateDelta } from "./transformHelpers.js";

// Per-slot, per-pool TEXTURE transform. Pool A (FG, clipped by cut) and
// pool B (BG) have independent transforms — one slot, two textures.
// No symmetry gating (user freedom). Pipeline reads via
// state.getSlotTextureTransform(idx, poolKey) in slotComposite.

const FLIP_BUTTONS = [
  { label: "|", tooltip: "Mirror across vertical axis",   op: { rotate: 0, flipH: true } },
  { label: "—", tooltip: "Mirror across horizontal axis", op: { rotate: 2, flipH: true } },
];

export function buildTextureTransformRow(slot) {
  const wrap = document.createElement("div");
  wrap.className = "texture-transform";
  wrap.appendChild(buildPoolGroup(slot, "A"));
  wrap.appendChild(buildPoolGroup(slot, "B"));
  return wrap;
}

function buildPoolGroup(slot, poolKey) {
  const row = document.createElement("div");
  row.className = "texture-transform__row";
  row.dataset.pool = poolKey;

  const label = document.createElement("span");
  label.className = "texture-transform__label";
  label.textContent = poolKey;
  row.appendChild(label);

  const grid = document.createElement("div");
  grid.className = "texture-transform__btns";
  row.appendChild(grid);

  const cur = readTransform(slot, poolKey);
  const delta = nextRotateDelta(cur, () => true);

  const rotBtn = document.createElement("button");
  rotBtn.type = "button";
  rotBtn.className = "texture-transform__btn texture-transform__btn--cycle";
  rotBtn.title = `Rotate pool ${poolKey} texture 90° clockwise`;
  rotBtn.textContent = "↻";
  rotBtn.addEventListener("click", () => apply(slot, poolKey, { rotate: delta, flipH: false }));
  grid.appendChild(rotBtn);

  for (const b of FLIP_BUTTONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "texture-transform__btn";
    btn.title = `Pool ${poolKey}: ${b.tooltip}`;
    btn.textContent = b.label;
    btn.addEventListener("click", () => apply(slot, poolKey, b.op));
    grid.appendChild(btn);
  }

  return row;
}

function readTransform(slot, poolKey) {
  if (slot?.index == null) return { rotate: 0, flipH: false };
  const t = state.getSlotTextureTransform(slot.index, poolKey);
  return {
    rotate: (((t?.rotate | 0) % 4) + 4) % 4,
    flipH: !!t?.flipH,
  };
}

function apply(slot, poolKey, op) {
  if (slot?.index == null) return;
  const next = composeD4(readTransform(slot, poolKey), op);
  state.setSlotTextureTransform(slot.index, poolKey, next);
}
