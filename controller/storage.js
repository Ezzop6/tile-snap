// save() lets QuotaExceededError bubble up so callers decide how to surface it (toast, dialog).

import { firstFreeName } from "../core/freeName.js";

const NS = "tilesetgen.v1";

const KEY_PROJECT_MANIFEST  = `${NS}.project-manifest`;
const KEY_PROJECT           = (id) => `${NS}.project.${id}`;
const KEY_TEMPLATE_MANIFEST = `${NS}.template-manifest`;
const KEY_TEMPLATE          = (id) => `${NS}.template.${id}`;
const KEY_SETTING           = (key) => `${NS}.setting.${key}`;
const KEY_IMAGE             = (hash) => `${NS}.image.${hash}`;
const IMAGE_PREFIX          = `${NS}.image.`;
const KEY_INPUTS_LIBRARY    = `${NS}.inputs-library`;

const LEGACY_PROJECT_KEY = "tileset.project";

function genId(prefix) {
  const ts = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 1e8).toString(36);
  return `${prefix}-${ts}-${rand}`;
}

function readJSON(key) {
  const s = localStorage.getItem(key);
  if (s == null) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function readManifest(key) {
  const m = readJSON(key);
  return Array.isArray(m) ? m : [];
}

let migrationChecked = false;

function ensureProjectMigration() {
  if (migrationChecked) return;
  migrationChecked = true;
  if (localStorage.getItem(KEY_PROJECT_MANIFEST) != null) return;
  const legacy = localStorage.getItem(LEGACY_PROJECT_KEY);
  if (legacy) {
    let data = null;
    try { data = JSON.parse(legacy); } catch { /* ignore corrupt */ }
    if (data && typeof data === "object") {
      const id = genId("proj");
      const name = (data.projectName && String(data.projectName).trim()) || "untitled";
      writeJSON(KEY_PROJECT(id), { name, lastModified: Date.now(), data });
      writeJSON(KEY_PROJECT_MANIFEST, [id]);
      writeJSON(KEY_SETTING("lastProjectId"), id);
      localStorage.removeItem(LEGACY_PROJECT_KEY);
      return;
    }
  }
  writeJSON(KEY_PROJECT_MANIFEST, []);
}

// Returns baseName if free; otherwise `${baseName} (N)` with smallest N≥2.
// Convention: New + Duplicate both append " (N)" to keep names visually
// distinct even though storage IDs are unique anyway.
export function findFreeProjectName(baseName) {
  return firstFreeName(baseName, new Set(projects.list().map((p) => p.name)));
}

export const projects = {
  list() {
    ensureProjectMigration();
    const ids = readManifest(KEY_PROJECT_MANIFEST);
    const out = [];
    for (const id of ids) {
      const e = readJSON(KEY_PROJECT(id));
      if (!e) continue;
      out.push({
        id,
        name: e.name || "untitled",
        lastModified: e.lastModified || 0,
      });
    }
    out.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
    return out;
  },

  load(id) {
    const e = readJSON(KEY_PROJECT(id));
    if (!e) return null;
    // Self-heal: older entries may have entry.name updated by a rename
    // while data.projectName lagged behind (pre-fix bug). Force the
    // canonical value from the entry's metadata.
    if (e.data && typeof e.data === "object" && e.name) {
      e.data.projectName = e.name;
    }
    return e.data;
  },

  meta(id) {
    const e = readJSON(KEY_PROJECT(id));
    if (!e) return null;
    return { id, name: e.name || "untitled", lastModified: e.lastModified || 0 };
  },

  // Pass `name` to update the entry's display name, or omit to keep it.
  save(id, data, name) {
    ensureProjectMigration();
    const ids = readManifest(KEY_PROJECT_MANIFEST);
    const existing = readJSON(KEY_PROJECT(id));
    const finalName = (name && String(name).trim())
      || existing?.name
      || "untitled";
    writeJSON(KEY_PROJECT(id), {
      name: finalName,
      lastModified: Date.now(),
      data,
    });
    if (!ids.includes(id)) {
      ids.push(id);
      writeJSON(KEY_PROJECT_MANIFEST, ids);
    }
  },

  create(name, data) {
    const id = genId("proj");
    this.save(id, data, name);
    return id;
  },

  delete(id) {
    localStorage.removeItem(KEY_PROJECT(id));
    const ids = readManifest(KEY_PROJECT_MANIFEST).filter((x) => x !== id);
    writeJSON(KEY_PROJECT_MANIFEST, ids);
  },

  rename(id, newName) {
    const e = readJSON(KEY_PROJECT(id));
    if (!e) return;
    const finalName = String(newName ?? "").trim() || "untitled";
    e.name = finalName;
    // Also sync the name INSIDE the data blob so the next deserialize
    // sees the same value as the picker — otherwise the displayed name
    // diverges from `data.projectName` until the user saves again.
    if (e.data && typeof e.data === "object") {
      e.data.projectName = finalName;
    }
    e.lastModified = Date.now();
    writeJSON(KEY_PROJECT(id), e);
  },
};

export const templates = {
  list() {
    const ids = readManifest(KEY_TEMPLATE_MANIFEST);
    const out = [];
    for (const id of ids) {
      const e = readJSON(KEY_TEMPLATE(id));
      if (!e) continue;
      out.push({ id, name: e.name || "untitled", source: "user" });
    }
    return out;
  },

  load(id) {
    const e = readJSON(KEY_TEMPLATE(id));
    return e ? e.data : null;
  },

  save(id, data, name) {
    const ids = readManifest(KEY_TEMPLATE_MANIFEST);
    const existing = readJSON(KEY_TEMPLATE(id));
    const finalName = (name && String(name).trim())
      || existing?.name
      || "untitled";
    writeJSON(KEY_TEMPLATE(id), { name: finalName, data });
    if (!ids.includes(id)) {
      ids.push(id);
      writeJSON(KEY_TEMPLATE_MANIFEST, ids);
    }
  },

  create(name, data) {
    const id = genId("tmpl");
    this.save(id, data, name);
    return id;
  },

  // Opaque id for an in-memory template not yet persisted (clone / import /
  // duplicate). Save happens later via save(); the id is generated up front
  // so state.template has a stable, name-independent key from the start.
  newId() {
    return genId("tmpl");
  },

  delete(id) {
    localStorage.removeItem(KEY_TEMPLATE(id));
    const ids = readManifest(KEY_TEMPLATE_MANIFEST).filter((x) => x !== id);
    writeJSON(KEY_TEMPLATE_MANIFEST, ids);
  },

  rename(id, newName) {
    const e = readJSON(KEY_TEMPLATE(id));
    if (!e) return;
    e.name = String(newName ?? "").trim() || "untitled";
    writeJSON(KEY_TEMPLATE(id), e);
  },
};

// Content-addressed image store. Keys are short SHA-256 prefixes (16 hex
// chars) of the dataURL. Multiple projects can reference the same image
// without duplication. Collisions are theoretically possible (~1 in 10^16)
// but treated as errors — `put` throws if a different value already exists
// at the hash so we never silently overwrite real user data.
export const images = {
  get(hash) {
    return localStorage.getItem(KEY_IMAGE(hash));
  },

  has(hash) {
    return localStorage.getItem(KEY_IMAGE(hash)) != null;
  },

  put(hash, dataURL) {
    if (!hash || typeof dataURL !== "string") return;
    const existing = localStorage.getItem(KEY_IMAGE(hash));
    if (existing != null && existing !== dataURL) {
      throw new Error(
        `image hash collision at ${hash} — existing ${existing.length}B differs from new ${dataURL.length}B`,
      );
    }
    if (existing == null) localStorage.setItem(KEY_IMAGE(hash), dataURL);
  },

  delete(hash) {
    localStorage.removeItem(KEY_IMAGE(hash));
  },

  list() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(IMAGE_PREFIX)) {
        out.push(k.slice(IMAGE_PREFIX.length));
      }
    }
    return out;
  },
};

// Global input library: input metadata persists across projects. Image
// binaries already live in content-addressed `images` storage; the library
// just holds the named-reference {id, name, tileSize, hash} entries so
// every project can see every uploaded source. Each project then stores
// only pool refs (inputId, tileCol, tileRow) — not the metadata itself.
export const inputsLibrary = {
  list() {
    ensureInputsLibraryMigration();
    const m = readJSON(KEY_INPUTS_LIBRARY);
    return Array.isArray(m) ? m : [];
  },
  get(id) {
    return this.list().find((i) => i.id === id) || null;
  },
  put(entry) {
    if (!entry?.id || !entry?.hash) return;
    const all = this.list();
    const idx = all.findIndex((i) => i.id === entry.id);
    const clean = {
      id:       String(entry.id),
      name:     String(entry.name ?? ""),
      tileSize: Number(entry.tileSize) || 0,
      hash:     String(entry.hash),
    };
    if (idx >= 0) all[idx] = clean;
    else          all.push(clean);
    writeJSON(KEY_INPUTS_LIBRARY, all);
  },
  remove(id) {
    const all = this.list().filter((i) => i.id !== id);
    writeJSON(KEY_INPUTS_LIBRARY, all);
  },
};

let inputsLibraryMigrationChecked = false;
// Seeds the library by scanning every project blob's legacy `inputs` array.
// Idempotent — only runs the first time we look at the library key.
function ensureInputsLibraryMigration() {
  if (inputsLibraryMigrationChecked) return;
  inputsLibraryMigrationChecked = true;
  if (localStorage.getItem(KEY_INPUTS_LIBRARY) != null) return;
  const merged = new Map();
  const ids = readManifest(KEY_PROJECT_MANIFEST);
  for (const projId of ids) {
    const entry = readJSON(KEY_PROJECT(projId));
    const proj = entry?.data;
    if (!Array.isArray(proj?.inputs)) continue;
    for (const inp of proj.inputs) {
      if (!inp?.id || !inp?.hash) continue;
      const existing = merged.get(inp.id);
      // First-seen wins on id collision so existing pool refs stay valid.
      if (existing && existing.hash !== inp.hash) continue;
      merged.set(inp.id, {
        id:       inp.id,
        name:     inp.name ?? "",
        tileSize: inp.tileSize ?? 0,
        hash:     inp.hash,
      });
    }
  }
  writeJSON(KEY_INPUTS_LIBRARY, [...merged.values()]);
}

// Walks every saved project's pool refs and returns the set of inputIds
// referenced anywhere. inputsLibrary entries with ids NOT in this set are
// considered "unused" — no saved project will fail to load if we drop them.
function collectReferencedInputIds() {
  const used = new Set();
  const ids = readManifest(KEY_PROJECT_MANIFEST);
  for (const projId of ids) {
    const entry = readJSON(KEY_PROJECT(projId));
    const data = entry?.data;
    for (const key of ["A", "B"]) {
      const refs = Array.isArray(data?.pools?.[key]) ? data.pools[key] : [];
      for (const r of refs) if (r?.inputId) used.add(r.inputId);
    }
  }
  return used;
}

// inputsLibrary entries with no project reference. UI surfaces this list to
// the user before deletion so they can decide whether to keep upload history.
export function findUnusedInputs() {
  const used = collectReferencedInputIds();
  return inputsLibrary.list().filter((inp) => !used.has(inp.id));
}

// Image binaries that no inputsLibrary entry references — created e.g. when
// inputs are removed without binary cleanup, or by aborted imports. Safe to
// delete unconditionally.
export function findOrphanImageHashes() {
  const referenced = new Set();
  for (const inp of inputsLibrary.list()) {
    if (typeof inp.hash === "string") referenced.add(inp.hash);
  }
  return images.list().filter((h) => !referenced.has(h));
}

// Deletes the orphan binaries (caller already cleaned library entries
// upstream via state.removeInput so removed-input hashes are now orphans).
// Returns count + freed byte estimate.
export function cleanOrphanImageBinaries() {
  const orphans = findOrphanImageHashes();
  let freed = 0;
  for (const h of orphans) {
    const k = KEY_IMAGE(h);
    const v = localStorage.getItem(k);
    if (v != null) freed += (k.length + v.length) * 2;
    localStorage.removeItem(k);
  }
  return { count: orphans.length, freedBytes: freed };
}

// Distinct, non-empty pool (terrain) names the user has used across every
// saved project — drives autocomplete suggestions when naming pools so the
// same terrain vocabulary ("grass", "dirt", …) is reusable across projects.
export function collectPoolNames() {
  const names = new Set();
  const ids = readManifest(KEY_PROJECT_MANIFEST);
  for (const id of ids) {
    const pn = readJSON(KEY_PROJECT(id))?.data?.poolNames;
    if (!pn || typeof pn !== "object") continue;
    for (const k of ["A", "B"]) {
      const v = (pn[k] || "").trim();
      if (v) names.add(v);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

// Effective export tile resolution for a SAVED project blob: its explicit
// exportResolution, else the largest source tileSize (= the "auto" value).
// Shared by bundle export (pre-flight resolution check) + bundle matrix cards.
export function projectExportResolution(data) {
  const r = data?.exportResolution;
  if (Number.isFinite(r) && r > 0) return Math.round(r);
  let max = 0;
  for (const key of ["A", "B"]) {
    const refs = Array.isArray(data?.pools?.[key]) ? data.pools[key] : [];
    for (const ref of refs) {
      const inp = ref?.inputId ? inputsLibrary.get(ref.inputId) : null;
      if (inp && inp.tileSize > max) max = inp.tileSize;
    }
  }
  return max || 64;
}

export const settings = {
  get(key, defaultValue = null) {
    const v = readJSON(KEY_SETTING(key));
    return v === null ? defaultValue : v;
  },
  set(key, value) {
    writeJSON(KEY_SETTING(key), value);
  },
  remove(key) {
    localStorage.removeItem(KEY_SETTING(key));
  },
};

// Approximate UTF-16 byte usage of the tileset-generator namespace (for quota UI).
export function storageUsageBytes() {
  let chars = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(NS)) continue;
    chars += k.length + (localStorage.getItem(k) || "").length;
  }
  return chars * 2;
}
