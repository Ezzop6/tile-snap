// Terrain coverage matrix — N×N table of bundle-wide unique terrains.
// Tracks DIRECTED (poolA → poolB, contributed by one entry) and
// UNDIRECTED (unordered pair) coverage so each cell can distinguish
// "forward covered" vs "only reverse covers it" vs "missing entirely".
// Pure render — no module state, no event subscriptions.

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function computeTerrainCoverage(entries) {
  const terrains = new Set();
  const directed = new Set();   // "A|B" — ordered
  const undirected = new Set(); // "min|max"
  for (const entry of entries) {
    const a = entry.poolA.effective;
    const b = entry.poolB.effective;
    terrains.add(a);
    terrains.add(b);
    if (a === b) continue;
    directed.add(`${a}|${b}`);
    undirected.add(pairKey(a, b));
  }
  const list = [...terrains].sort();
  const total = list.length * (list.length - 1) / 2;
  const missing = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (!undirected.has(pairKey(list[i], list[j]))) {
        missing.push([list[i], list[j]]);
      }
    }
  }
  return { terrains: list, directed, undirected, missing, total };
}

export function renderCoverageMatrix(entries) {
  const { terrains, directed, undirected, missing, total } = computeTerrainCoverage(entries);
  if (terrains.length < 2) return null;

  const wrapper = document.createElement("div");
  wrapper.className = "bundle-coverage";

  const summary = document.createElement("div");
  summary.className = "bundle-coverage__summary";
  const coveredCount = total - missing.length;
  let txt = `Coverage: ${coveredCount} / ${total} pairs`;
  if (missing.length > 0) {
    txt += ` · missing: ${missing.map(([a, b]) => `${a} ↔ ${b}`).join(", ")}`;
  }
  summary.textContent = txt;
  wrapper.append(summary);

  const table = document.createElement("div");
  table.className = "bundle-coverage__table";
  // Row-header column auto-sized; coverage columns capped so cells stay
  // compact and the table doesn't overflow the stage on wide screens.
  table.style.gridTemplateColumns = `auto repeat(${terrains.length}, minmax(40px, 56px))`;

  // Top-left empty corner + diagonally-rotated column headers.
  // Label wrapped in a span so the cell stays square while the text rotates.
  const corner = document.createElement("div");
  corner.className = "bundle-coverage__cell bundle-coverage__cell--head bundle-coverage__cell--col-head";
  table.append(corner);
  for (const t of terrains) {
    const cell = document.createElement("div");
    cell.className = "bundle-coverage__cell bundle-coverage__cell--head bundle-coverage__cell--col-head";
    const label = document.createElement("span");
    label.className = "bundle-coverage__col-label";
    label.textContent = t;
    cell.append(label);
    table.append(cell);
  }

  // Rows: row header + N coverage cells. Cell (row=A, col=B) tracks the
  // DIRECTED pair "row's terrain has a project where pool A=row, pool B=col".
  // Forward + reverse contribute different cells, so the user sees both.
  for (let i = 0; i < terrains.length; i++) {
    const rowHead = document.createElement("div");
    rowHead.className = "bundle-coverage__cell bundle-coverage__cell--head bundle-coverage__cell--row-head";
    rowHead.textContent = terrains[i];
    table.append(rowHead);
    for (let j = 0; j < terrains.length; j++) {
      const cell = document.createElement("div");
      cell.className = "bundle-coverage__cell";
      if (i === j) {
        cell.classList.add("bundle-coverage__cell--diagonal");
        cell.textContent = "—";
      } else {
        const fwd = directed.has(`${terrains[i]}|${terrains[j]}`);
        const undir = undirected.has(pairKey(terrains[i], terrains[j]));
        if (fwd) {
          cell.classList.add("bundle-coverage__cell--covered");
          cell.textContent = "✓";
        } else if (undir) {
          // Reverse exists but this direction doesn't — partial coverage.
          cell.classList.add("bundle-coverage__cell--reverse-only");
          cell.textContent = "↺";
          cell.title = "Covered only by the reverse direction — add a project (or ↔ Add reverse) for this exact direction if you need it.";
        } else {
          cell.classList.add("bundle-coverage__cell--missing");
        }
      }
      table.append(cell);
    }
  }
  wrapper.append(table);
  return wrapper;
}
