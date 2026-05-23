// Single bundle-entry card: project + template metadata, pool thumbs,
// stats, and an icon-button action box. Reverse entries get a left-edge
// accent stripe + the "(reversed)" name suffix; the rest of the card
// stays readable instead of italic-dimmed.

import { bundled, bundledIndex, isInBundle, persistBundle, renderAll, currentActiveProjectId } from "./state.js";
import { loadProjectById } from "../projectBar.js";
import { setMode } from "../modeTabs.js";

// Groups reverse entries directly under their forward originals so the
// user sees a project + its mirror as a vertically adjacent pair, no
// matter the order they were added.
export function sortedEntries(entries) {
  const firstSeen = new Map();
  entries.forEach((e, idx) => {
    if (!firstSeen.has(e.projectId)) firstSeen.set(e.projectId, idx);
  });
  return [...entries].sort((a, b) => {
    const oa = firstSeen.get(a.projectId);
    const ob = firstSeen.get(b.projectId);
    if (oa !== ob) return oa - ob;
    return Number(a.reversed) - Number(b.reversed); // forward before reverse
  });
}

export function buildEntryCard(entry) {
  const {
    projectId,
    reversed,
    projectName,
    poolA,
    poolB,
    layout,
    templateName,
    slotCount,
    variantTotal,
    includeA,
    includeB,
    templateValid,
    missingTemplateId,
    resolution,
    resolutionMismatch,
    resolutionForced,
  } = entry;

  const card = document.createElement("div");
  card.className =
    "bundle-card" + (reversed ? " bundle-card--reversed" : "") + (!templateValid || resolutionMismatch ? " bundle-card--invalid" : "");
  if (!templateValid) {
    card.title = `Template "${missingTemplateId || "?"}" is missing — bundle export is blocked until you reload + re-save the project with a valid template.`;
  } else if (resolutionMismatch) {
    card.title = `Export resolution ${resolution} px differs from the other bundled projects.`;
  }

  card.append(
    buildProjectSection(
      projectName,
      templateName,
      layout,
      reversed,
      templateValid,
      missingTemplateId,
      resolution,
      resolutionMismatch,
      resolutionForced,
    ),
  );
  card.append(buildPoolsSection(poolA, poolB));
  card.append(buildOpenSection(projectId));
  card.append(buildStatsSection(slotCount, variantTotal, includeA, includeB));
  card.append(buildActionsSection(projectId, reversed));

  return card;
}

// Inline "Open" — loads the project AND flips to Preview mode in one click.
// Disabled when the project is already active. Lives between pools + stats
// so it sits adjacent to the project-identity columns, not mixed with the
// right-edge ↔/× actions box (which is bundle-list-level, not project-level).
function buildOpenSection(projectId) {
  const sec = document.createElement("div");
  sec.className = "bundle-card__section bundle-card__section--open";
  const isActive = projectId === currentActiveProjectId();
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn--sm bundle-card__open-btn";
  btn.textContent = isActive ? "↗ Active" : "↗ Open";
  btn.title = isActive ? "This project is already active" : "Load this project and switch to Preview mode";
  btn.disabled = isActive;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      await loadProjectById(projectId);
      setMode("preview");
    } finally {
      // renderAll() in projectBar/loadProjectById path will rebuild this
      // card on project:loaded, so we don't need to re-enable manually —
      // the freshly-built card picks up the new active state.
    }
  });
  sec.append(btn);
  return sec;
}

function buildProjectSection(
  projectName,
  templateName,
  layout,
  reversed,
  templateValid,
  missingTemplateId,
  resolution,
  resolutionMismatch,
  resolutionForced,
) {
  const sec = document.createElement("div");
  sec.className = "bundle-card__section bundle-card__section--project";

  const name = document.createElement("div");
  name.className = "bundle-card__name";
  name.textContent = projectName + (reversed ? " (reversed)" : "");
  sec.append(name);

  const tmpl = document.createElement("div");
  tmpl.className = "bundle-card__meta";
  if (templateValid) {
    // Single meta line mirroring the project modal so users see the same
    // identifying summary in both surfaces.
    tmpl.textContent = `${templateName} · ${layout.patternDims} · ${layout.gridKind} · ${layout.terrainMode}`;
  } else {
    tmpl.classList.add("bundle-card__meta--error");
    tmpl.textContent = `⚠ Missing template "${missingTemplateId || "?"}" — reload + re-save the project to fix`;
  }
  sec.append(tmpl);

  // Resolution as info; on a bundle mismatch it switches to the same ⚠ error
  // style as the missing-template line.
  const res = document.createElement("div");
  res.className = "bundle-card__meta";
  if (resolutionMismatch) {
    res.classList.add("bundle-card__meta--error");
    res.textContent = `⚠ ${resolution} px — differs from other projects; enable the Resolution override or match resolutions`;
  } else {
    res.textContent = `${resolution} px${resolutionForced ? " (bundle override)" : ""}`;
  }
  sec.append(res);

  return sec;
}

function buildPoolsSection(poolA, poolB) {
  const sec = document.createElement("div");
  sec.className = "bundle-card__section bundle-card__section--pools";

  sec.append(buildPoolBlock(poolA));
  const arrow = document.createElement("span");
  arrow.className = "bundle-card__arrow";
  arrow.textContent = "↔";
  sec.append(arrow);
  sec.append(buildPoolBlock(poolB));

  return sec;
}

function buildPoolBlock(pool) {
  const block = document.createElement("div");
  block.className = "bundle-card__pool";

  if (pool.thumbUrl) {
    const img = document.createElement("img");
    img.className = "bundle-matrix__thumb";
    img.src = pool.thumbUrl;
    img.alt = "";
    img.title = pool.effective;
    block.append(img);
  } else {
    const placeholder = document.createElement("span");
    placeholder.className = "bundle-matrix__thumb bundle-matrix__thumb--empty";
    placeholder.title = "Pool has no master tile";
    block.append(placeholder);
  }

  const name = document.createElement("span");
  name.className = "bundle-matrix__name" + (pool.fallback ? " bundle-matrix__name--fallback" : "");
  name.textContent = pool.effective;
  block.append(name);

  return block;
}

function buildStatsSection(slotCount, variantTotal, includeA, includeB) {
  const sec = document.createElement("div");
  sec.className = "bundle-card__section bundle-card__section--stats";

  const tiles = document.createElement("div");
  tiles.className = "bundle-card__stat";
  const extras = Math.max(0, variantTotal - slotCount);
  tiles.innerHTML =
    `<strong>${slotCount}</strong> slots` +
    (extras > 0 ? ` <span class="bundle-matrix__sub">+ ${extras} variants</span>` : ` <span class="bundle-matrix__sub">no variants</span>`);
  sec.append(tiles);

  const srcRow = document.createElement("div");
  srcRow.className = "bundle-card__stat bundle-card__stat--sources";
  const srcLabel = document.createElement("span");
  srcLabel.className = "bundle-matrix__sub";
  srcLabel.textContent = "bundle";
  srcRow.append(srcLabel);
  for (const [letter, on] of [
    ["A", includeA],
    ["B", includeB],
  ]) {
    const badge = document.createElement("span");
    badge.className = "bundle-matrix__src-badge" + (on ? " is-on" : "");
    badge.textContent = letter;
    badge.title = on ? `Pool ${letter} bundled with the export` : `Pool ${letter} NOT bundled`;
    srcRow.append(badge);
  }
  sec.append(srcRow);

  return sec;
}

function buildActionsSection(projectId, reversed) {
  const sec = document.createElement("div");
  sec.className = "bundle-card__section bundle-card__section--actions";

  // Single vertical box holding icon-only buttons (no labels — title
  // attributes carry the description). Hidden reverse button still
  // reserves space so the card height matches across forward / reverse.
  const box = document.createElement("div");
  box.className = "bundle-card__action-box";

  if (!reversed && !isInBundle(projectId, true)) {
    const addRev = document.createElement("button");
    addRev.type = "button";
    addRev.className = "bundle-card__icon-btn";
    addRev.textContent = "↔";
    addRev.title = "Add a virtual entry that exports this project with pools A ↔ B swapped.";
    addRev.addEventListener("click", () => {
      bundled.push({ projectId, reversed: true });
      persistBundle();
      renderAll();
    });
    box.append(addRev);
  }

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "bundle-card__icon-btn bundle-card__icon-btn--danger";
  remove.textContent = "×";
  remove.title = reversed ? "Remove this reverse entry" : "Remove this project from the bundle";
  remove.addEventListener("click", () => {
    const idx = bundledIndex(projectId, reversed);
    if (idx >= 0) bundled.splice(idx, 1);
    persistBundle();
    renderAll();
  });
  box.append(remove);

  sec.append(box);
  return sec;
}
