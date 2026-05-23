// Cell value = array of length 1 + N: index 0 = centre, 1..N = wedges CW from north.

export const CARDINAL_OPTIONS = [4, 8, 16, 32];
export const DEFAULT_CARDINAL = 4;

const CENTER_FRACTION = 0.4;
const VIEWBOX = 100;

export const TRIANGLE = {
  id:    "triangle",
  label: "Triangle (pinwheel) — not implemented",
  disabled: true,

  defaultValue(draft) {
    return makeArray(cardinalsOf(draft), 0);
  },

  fullValue(draft) {
    return makeArray(cardinalsOf(draft), 1);
  },

  slotDims(/* patternN, draft */) {
    return { rows: 1, cols: 1 };
  },

  // Returns "c" for centre, or wedge index 0..N-1 (CW from north).
  hitTest(el, e, draft) {
    const w = el.clientWidth  || 1;
    const h = el.clientHeight || 1;
    const rx = e.offsetX - w / 2;
    const ry = e.offsetY - h / 2;
    const cr = Math.min(w, h) * (CENTER_FRACTION / 2);
    if (Math.abs(rx) <= cr && Math.abs(ry) <= cr) return "c";
    return wedgeIndexFor(rx, ry, cardinalsOf(draft));
  },

  // Immutable update so callers can diff cheaply against `cur`.
  nextValue(cur, paintMode, region, draft) {
    const N = cardinalsOf(draft);
    const arr = ensureArray(cur, N);
    const idx = (region === "c") ? 0 : (typeof region === "number" ? region + 1 : -1);
    if (idx < 0 || idx >= arr.length) return arr;
    const bit = paintMode === 1 ? 1 : 0;
    if (arr[idx] === bit) return arr;
    const next = arr.slice();
    next[idx] = bit;
    return next;
  },

  // SVG divider overlay keeps structure visible on empty cells (gradients vanish at all-off).
  applyVisual(el, value, draft) {
    const N = cardinalsOf(draft);
    const arr = ensureArray(value, N);
    el.classList.remove("creator-grid__cell--on");
    el.style.background = backgroundFor(arr, N);
    ensureDividerOverlay(el, N);
  },

  valueEquals(a, b) {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
      return true;
    }
    return a === b;
  },

  renderParams(host, draft, ctx) {
    host.innerHTML = `
      <label class="curve-panel__field" title="Number of cardinal triangles around the centre square. Each step halves the wedge angle (= finer angular detail).">
        <span class="curve-panel__label">Cardinal</span>
        <select class="curve-panel__input" id="creator-cardinal-select">
          ${CARDINAL_OPTIONS.map((n) =>
            `<option value="${n}">${n}</option>`).join("")}
        </select>
      </label>
    `;
    const sel = host.querySelector("#creator-cardinal-select");
    sel.value = String(cardinalsOf(draft));
    sel.addEventListener("change", async () => {
      const n = normalizeCardinal(sel.value);
      if (cardinalsOf(draft) === n) return;
      // Destructive: a stale wedge value from a different N would be silently corrupt.
      if (ctx.hasContent()) {
        if (!(await ctx.confirm(`Changing Cardinal resets every cell. Continue?`))) {
          sel.value = String(cardinalsOf(draft));
          return;
        }
      } else if (!(await ctx.ensureEditable())) {
        sel.value = String(cardinalsOf(draft));
        return;
      }
      // After ensureEditable, state.template may be a fresh copy.
      const t = ctx.getTemplate();
      t.triangleCardinals = n;
      for (const slot of t.slots) {
        slot.array = [[makeArray(n, 0)]];
      }
      ctx.onChange();
    });
  },
};

export function normalizeCardinal(v) {
  const n = Number(v);
  return CARDINAL_OPTIONS.includes(n) ? n : DEFAULT_CARDINAL;
}

function cardinalsOf(draft) {
  return normalizeCardinal(draft?.triangleCardinals);
}

function makeArray(cardinals, fill) {
  const out = new Array(cardinals + 1);
  for (let i = 0; i < out.length; i++) out[i] = fill;
  return out;
}

// Accepts legacy bit-packed numeric values from earlier impl (bit 0 = centre, bits 1.. = wedges).
function ensureArray(value, cardinals) {
  if (Array.isArray(value)) {
    if (value.length === cardinals + 1) return value;
    const out = makeArray(cardinals, 0);
    for (let i = 0; i < Math.min(value.length, out.length); i++) out[i] = value[i] ? 1 : 0;
    return out;
  }
  if (typeof value === "number" && value > 0) {
    const out = makeArray(cardinals, 0);
    for (let i = 0; i < out.length; i++) {
      if (value & (1 << i)) out[i] = 1;
    }
    return out;
  }
  return makeArray(cardinals, 0);
}

function wedgeIndexFor(rx, ry, cardinals) {
  // atan2(rx, -ry): 0 at north, pi/2 east, pi south, -pi/2 west (screen y is down).
  let theta = Math.atan2(rx, -ry);
  if (theta < 0) theta += Math.PI * 2;
  const deg = theta * 180 / Math.PI;
  const wedgeWidth = 360 / cardinals;
  // Wedge 0 centred at north; shift by half a wedge so bucket math indexes from 0.
  const shifted = (deg + wedgeWidth / 2) % 360;
  return Math.floor(shifted / wedgeWidth);
}

function backgroundFor(arr, cardinals) {
  const allOff = arr.every((x) => !x);
  if (allOff) return "";
  const on  = "var(--color-accent)";
  const off = "var(--color-bg)";
  const center = arr[0] ? on : off;
  const wedgeWidth = 360 / cardinals;
  const offsetDeg  = -wedgeWidth / 2;
  const stops = [];
  for (let i = 0; i < cardinals; i++) {
    const col = arr[i + 1] ? on : off;
    const end = (i + 1) * wedgeWidth;
    stops.push(`${col} 0deg ${end}deg`);
  }
  const cf = `${(CENTER_FRACTION * 100).toFixed(0)}%`;
  return `linear-gradient(${center}, ${center}) center / ${cf} ${cf} no-repeat,
          conic-gradient(from ${offsetDeg}deg, ${stops.join(", ")})`;
}

// Idempotent per cardinal count; rebuilds when cardinals changes.
function ensureDividerOverlay(el, cardinals) {
  const existing = el.querySelector(".creator-grid__cell-divider");
  if (existing && existing.dataset.cardinals === String(cardinals)) return;
  if (existing) existing.remove();

  const SVG = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "creator-grid__cell-divider");
  svg.setAttribute("viewBox", `0 0 ${VIEWBOX} ${VIEWBOX}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.dataset.cardinals = String(cardinals);

  const half = VIEWBOX / 2;
  const centerHalf = (VIEWBOX * CENTER_FRACTION) / 2;
  const wedgeWidth = 360 / cardinals;

  for (let i = 0; i < cardinals; i++) {
    const angleDeg = wedgeWidth / 2 + i * wedgeWidth;
    const θ  = angleDeg * Math.PI / 180;
    const dx = Math.sin(θ);
    const dy = -Math.cos(θ);
    const tStart = rayToBox(dx, dy, centerHalf);
    const tEnd   = rayToBox(dx, dy, half);
    const line = document.createElementNS(SVG, "line");
    line.setAttribute("x1", (half + tStart * dx).toFixed(2));
    line.setAttribute("y1", (half + tStart * dy).toFixed(2));
    line.setAttribute("x2", (half + tEnd * dx).toFixed(2));
    line.setAttribute("y2", (half + tEnd * dy).toFixed(2));
    svg.appendChild(line);
  }
  const cMin = half - centerHalf;
  const cSize = centerHalf * 2;
  const rect = document.createElementNS(SVG, "rect");
  rect.setAttribute("x", cMin.toFixed(2));
  rect.setAttribute("y", cMin.toFixed(2));
  rect.setAttribute("width",  cSize.toFixed(2));
  rect.setAttribute("height", cSize.toFixed(2));
  svg.appendChild(rect);

  el.appendChild(svg);
}

function rayToBox(dx, dy, halfExtent) {
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx === 0 && absDy === 0) return 0;
  return halfExtent / Math.max(absDx, absDy);
}
