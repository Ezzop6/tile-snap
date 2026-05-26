import { state } from "../../controller/state.js";

// Per-slot A/B pool variant override section. Independent of canvas /
// handle interaction — sits as its own row in the slot editor.
export function buildPoolOverrideRow(slot) {
  const wrap = document.createElement("div");
  wrap.className = "slot-override";
  for (const key of ["A", "B"]) wrap.appendChild(buildPoolOverrideSelect(slot, key));
  return wrap;
}

function buildPoolOverrideSelect(slot, key) {
  const row = document.createElement("label");
  row.className = "slot-override__row";
  row.dataset.pool = key;
  const label = document.createElement("span");
  label.className = "slot-override__label";
  label.textContent = key;
  row.appendChild(label);
  const sel = document.createElement("select");
  sel.className = "slot-override__select";
  const opts = [{ value: "", label: "master" }];
  const pool = state.pool(key);
  for (let i = 1; i < pool.length; i++) opts.push({ value: String(i), label: `variant ${i}` });
  if (pool.length <= 1) {
    sel.disabled = true;
    if (pool.length === 0) opts[0].label = "— pool empty —";
  }
  for (const o of opts) {
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    sel.appendChild(opt);
  }
  const cur = state.getSlotPoolOverride(slot.index)[key];
  sel.value = cur == null ? "" : String(cur);
  sel.addEventListener("change", () => {
    const v = sel.value === "" ? null : parseInt(sel.value, 10);
    state.setSlotPoolOverride(slot.index, key, v);
  });
  row.appendChild(sel);
  return row;
}
