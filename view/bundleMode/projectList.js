// Right-panel project picker. Saved projects = checkbox rows. Toggling the
// checkbox adds / removes the project from the in-memory bundle list.
// "Open" used to live here but moved onto each bundle card (= ↗ Open
// button between pools + stats) so the action is adjacent to the project
// it targets and switches straight to Preview.

import { projects as projectStorage } from "../../controller/storage.js";
import {
  bundled, dom, persistBundle, isInBundle, projectInBundle,
  currentActiveProjectId, renderAll,
} from "./state.js";

export function renderProjectList() {
  const listEl = dom.listEl;
  if (!listEl) return;
  listEl.innerHTML = "";
  const projects = projectStorage.list();
  if (projects.length === 0) {
    const empty = document.createElement("p");
    empty.className = "placeholder";
    empty.textContent = "No saved projects.";
    listEl.append(empty);
    return;
  }
  const activeId = currentActiveProjectId();
  for (const proj of projects) {
    listEl.append(buildProjectRow(proj, activeId));
  }
}

function buildProjectRow(proj, activeId) {
  const row = document.createElement("label");
  row.className = "bundle-project";

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = projectInBundle(proj.id);
  cb.addEventListener("change", () => {
    if (cb.checked) {
      if (!isInBundle(proj.id, false)) bundled.push({ projectId: proj.id, reversed: false });
    } else {
      // Uncheck removes every entry (forward + any reverses) of this project.
      for (let i = bundled.length - 1; i >= 0; i--) {
        if (bundled[i].projectId === proj.id) bundled.splice(i, 1);
      }
    }
    persistBundle();
    renderAll();
  });
  row.append(cb);

  const name = document.createElement("span");
  name.className = "bundle-project__name";
  name.textContent = proj.name || "untitled";
  row.append(name);

  if (proj.id === activeId) {
    const tag = document.createElement("span");
    tag.className = "bundle-project__active";
    tag.textContent = "(active)";
    row.append(tag);
  }

  return row;
}
