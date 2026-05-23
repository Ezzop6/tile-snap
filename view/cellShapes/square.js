import { DEBUG } from "../../config.js";

export const MIN_PATTERN = 2;
export const MAX_PATTERN = 7;

// Even parity = dual-grid convention; odd = classic single-grid.
export function defaultConnectedSaddle(rows, cols) {
  return (rows % 2 === 0) || (cols % 2 === 0);
}

export function defaultGridKind(rows, cols) {
  return ((rows % 2 === 0) || (cols % 2 === 0)) ? "dual" : "single";
}

export const SQUARE = {
  id:    "square",
  label: "Square (binary)",

  defaultValue(/* draft */) { return 0; },

  fullValue(/* draft */) { return 1; },

  slotDims(patternN /* , draft */) {
    const n = Math.max(1, Math.floor(patternN) || 1);
    return { rows: n, cols: n };
  },

  hitTest(/* el, e, draft */) { return "*"; },

  nextValue(_cur, paintMode /* , regionId, draft */) {
    return paintMode === 1 ? 1 : 0;
  },

  // Strip leftover triangle SVG overlay so cells re-used across cellShape switches don't carry stale dividers.
  applyVisual(el, value /* , draft */) {
    el.style.background = "";
    el.classList.toggle("creator-grid__cell--on", !!value);
    const divider = el.querySelector(".creator-grid__cell-divider");
    if (divider) divider.remove();
  },

  valueEquals(a, b) { return a === b; },

  // Decorative SVG drawn on top of the slot block: for square + Connected
  // saddle, draws a short line through each 4-cut saddle along its EMPTY
  // diagonal so the user sees where the saddle bridges the chains.
  //   - axis labels the empty-corner diagonal (= bridge direction).
  //   - line length = 2 * cellSize * saddleBridgeOffset, matching how far
  //     each bridge corner is pre-shifted along its outward normal:
  //     slider 0 = invisible point, slider 1 = full bridge segment.
  // Called from templateCreator/slotBlock.js after the cells are placed,
  // and re-called from interaction.js after a paint that may have flipped
  // saddle topology.
  renderOverlay(block, slot, cellSize, rows, cols, template) {
    if (!template?.connectedSaddle) return;
    const SLOT_GRID_GAP = 2;
    const isOn = (v) => Array.isArray(v) ? v.some((x) => x) : !!v;
    const saddles = [];
    for (let r = 1; r < rows; r++) {
      for (let c = 1; c < cols; c++) {
        const nw = isOn(slot.array[r - 1][c - 1]);
        const ne = isOn(slot.array[r - 1][c]);
        const sw = isOn(slot.array[r]    [c - 1]);
        const se = isOn(slot.array[r]    [c]);
        if (nw && se && !ne && !sw)      saddles.push({ r, c, axis: "nesw" });
        else if (ne && sw && !nw && !se) saddles.push({ r, c, axis: "nwse" });
      }
    }
    if (!saddles.length) return;

    const offset = Math.max(0, Math.min(1,
      typeof template.saddleBridgeOffset === "number"
        ? template.saddleBridgeOffset : 0.25));
    if (offset <= 0) return; // bridges coincident → nothing to draw

    const STEP = cellSize + SLOT_GRID_GAP;
    const saddlePos = (R, C) => ({
      x: C * STEP - SLOT_GRID_GAP / 2,
      y: R * STEP - SLOT_GRID_GAP / 2,
    });
    const w = cols * cellSize + (cols - 1) * SLOT_GRID_GAP;
    const h = rows * cellSize + (rows - 1) * SLOT_GRID_GAP;

    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class",  "creator-slot-block__bridges");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const half = Math.SQRT1_2;
    for (const s of saddles) {
      const p     = saddlePos(s.r, s.c);
      const reach = cellSize * offset;
      const nx = s.axis === "nesw" ?  half : -half;
      const ny = -half;
      const dx = reach * nx;
      const dy = reach * ny;
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", (p.x - dx).toFixed(2));
      line.setAttribute("y1", (p.y - dy).toFixed(2));
      line.setAttribute("x2", (p.x + dx).toFixed(2));
      line.setAttribute("y2", (p.y + dy).toFixed(2));
      svg.appendChild(line);
    }
    block.appendChild(svg);
  },

  renderParams(host, draft, ctx) {
    host.innerHTML = `
      <label class="curve-panel__field" title="Pattern grid resolution per tile (NxN). Even N defaults to dual-grid; odd to single. Independent of saddle mode.">
        <span class="curve-panel__label">Pattern</span>
        <input class="curve-panel__value curve-panel__value--editable" id="creator-pattern-input" type="number"
               min="${MIN_PATTERN}" max="${MAX_PATTERN}" step="1">
      </label>
      <label class="curve-panel__field" title="Pipeline kind: single = slot edge IS tile boundary (wang/blob). Dual = slot edges overlap with neighbours via shifted half-cell rendering. Drives lock rules + slot-edge semantics, orthogonal to Connected saddle.">
        <span class="curve-panel__label">Grid kind</span>
        <select class="curve-panel__input curve-panel__input--narrow" id="creator-grid-kind">
          <option value="single">Single</option>
          <option value="dual">Dual</option>
        </select>
      </label>
      <label class="curve-panel__field curve-panel__field--saddle" title="ON: 4-cut saddle bridges through centre (= 2 chains instead of 4). OFF: classic split. Orthogonal to Grid kind. The slider sets the pre-shift fraction of cellSize each bridge corner gets toward its empty diagonal — 0 = bridges coincident (X-cross visual), 0.25 = legacy dual default, 1 = bridges at the empty cell corners.">
        <span class="curve-panel__label">Connected saddle</span>
        <input type="checkbox" id="creator-connected-saddle">
        <input class="curve-panel__slider" id="creator-saddle-offset" type="range" min="0" max="100" step="1" value="25">
        <input class="curve-panel__value curve-panel__value--editable" id="creator-saddle-offset-value" type="number" min="0" max="100" step="1" value="25">
      </label>
      <label class="curve-panel__field" title="Godot TileSet terrain match mode. Sides = only edge cells matter (wang-edges); Corners = only corner cells (typical dual grid); Corners and sides = both (blob-47 family). Picked per template — the .tres export emits only the bits relevant to the chosen mode.">
        <span class="curve-panel__label">Terrain mode</span>
        <select class="curve-panel__input curve-panel__input--narrow" id="creator-terrain-mode">
          <option value="corners-and-sides">Corners and sides</option>
          <option value="corners">Corners</option>
          <option value="sides"${DEBUG ? "" : " disabled"}>Sides${DEBUG ? "" : " (not implemented)"}</option>
        </select>
      </label>
    `;
    // Pattern dim = slot.array dim (per-slot content), NOT template.cols/rows
    // (which are LAYOUT dims).
    const curN = () => {
      const a = draft.slots?.[0]?.array;
      return Math.max(a?.length ?? 3, a?.[0]?.length ?? 3);
    };
    // After ctx.ensureEditable() the active template may have been swapped
    // (builtin → copy). Re-read via ctx.getTemplate() before any mutation.
    const live = () => ctx.getTemplate();

    const input = host.querySelector("#creator-pattern-input");
    input.value = String(curN());
    input.addEventListener("change", async () => {
      const raw = parseInt(input.value, 10);
      const n   = Math.max(MIN_PATTERN, Math.min(MAX_PATTERN, isFinite(raw) ? raw : MIN_PATTERN));
      if (n === curN()) return;
      // ctx.confirm runs ensureEditable + asks; ctx.ensureEditable for the
      // no-content branch where no destructive warning is needed.
      if (ctx.hasContent()) {
        if (!(await ctx.confirm("Changing Pattern resets every slot. Continue?"))) {
          input.value = String(curN());
          return;
        }
      } else if (!(await ctx.ensureEditable())) {
        input.value = String(curN());
        return;
      }
      const t = live();
      t.gridKind        = defaultGridKind(n, n);
      t.connectedSaddle = defaultConnectedSaddle(n, n);
      for (const slot of t.slots) {
        slot.array = ctx.makeEmptyArray(n, n, 0);
      }
      kindSel.value  = t.gridKind;
      saddle.checked = t.connectedSaddle;
      syncOffsetEnabled();
      ctx.onChange();
    });

    const kindSel = host.querySelector("#creator-grid-kind");
    kindSel.value = draft.gridKind === "dual" ? "dual" : "single";
    kindSel.addEventListener("change", async () => {
      const intended = kindSel.value === "dual" ? "dual" : "single";
      if (!(await ctx.ensureEditable())) {
        kindSel.value = live().gridKind === "dual" ? "dual" : "single";
        return;
      }
      live().gridKind = intended;
      ctx.onChange();
    });

    const saddle = host.querySelector("#creator-connected-saddle");
    saddle.checked = draft.connectedSaddle === true;
    saddle.addEventListener("change", async () => {
      const intended = !!saddle.checked;
      if (!(await ctx.ensureEditable())) {
        saddle.checked = live().connectedSaddle === true;
        return;
      }
      live().connectedSaddle = intended;
      syncOffsetEnabled();
      ctx.onChange();
    });

    // saddleBridgeOffset is a per-template fraction (0..1) of cellSize.
    // Slider only matters when connectedSaddle is on; we disable but don't hide.
    const offsetSlider = host.querySelector("#creator-saddle-offset");
    const offsetValue  = host.querySelector("#creator-saddle-offset-value");
    const curOffset = (typeof draft.saddleBridgeOffset === "number")
      ? draft.saddleBridgeOffset : 0.25;
    offsetSlider.value = String(Math.round(curOffset * 100));
    offsetValue.value  = String(Math.round(curOffset * 100));
    const writeOffset = async (uiVal) => {
      const ui = Math.max(0, Math.min(100, Number(uiVal) || 0));
      const intended = ui / 100;
      if (!(await ctx.ensureEditable())) {
        const back = Math.round(((live()?.saddleBridgeOffset ?? 0.25) * 100));
        offsetSlider.value = String(back);
        offsetValue.value  = String(back);
        return;
      }
      offsetSlider.value = String(ui);
      offsetValue.value  = String(ui);
      live().saddleBridgeOffset = intended;
      ctx.onChange();
    };
    offsetSlider.addEventListener("input",  () => writeOffset(offsetSlider.value));
    offsetValue.addEventListener("change",  () => writeOffset(offsetValue.value));
    const syncOffsetEnabled = () => {
      const on = saddle.checked;
      offsetSlider.disabled = !on;
      offsetValue.disabled  = !on;
    };
    syncOffsetEnabled();

    const terrainSel = host.querySelector("#creator-terrain-mode");
    const TERRAIN_MODES = ["corners-and-sides", "corners", "sides"];
    const curMode = TERRAIN_MODES.includes(draft.terrainMode)
      ? draft.terrainMode : "corners-and-sides";
    terrainSel.value = curMode;
    terrainSel.addEventListener("change", async () => {
      const intended = TERRAIN_MODES.includes(terrainSel.value)
        ? terrainSel.value : "corners-and-sides";
      if (!(await ctx.ensureEditable())) {
        terrainSel.value = live().terrainMode || "corners-and-sides";
        return;
      }
      live().terrainMode = intended;
      ctx.onChange();
    });
  },
};
