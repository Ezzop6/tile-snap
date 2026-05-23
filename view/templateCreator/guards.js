import { state } from "../../controller/state.js";
import { cloneTemplateAsUser } from "../../templates/index.js";
import { confirmDestructive } from "../dialog.js";
import { sync } from "./refs.js";
import { syncToolbarInputs, syncCreatorDeleteButton } from "./toolbar.js";

// Guards every mutation entry point. Returns Promise<false> if user cancels.
// Builtin → confirm → in-memory copy promoted to state.template.
// async because the dialog component is modal/asynchronous; callers must
// await (or accept that the first builtin-mutation click of a session
// triggers the confirm and any rapid follow-up gestures will be ignored
// while the dialog is open — that's an acceptable trade for not blocking
// the UI with a native confirm()).
export async function ensureEditable() {
  const t = state.template;
  if (!t) return false;
  if (t.source !== "builtin") return true;
  const ok = await confirmDestructive({
    title:        "Edit built-in template",
    message:      `"${t.name}" is a built-in template (read-only). Create an editable copy and continue?`,
    confirmLabel: "Create copy",
  });
  if (!ok) return false;
  const copy = cloneTemplateAsUser(t);
  sync.suppressNextRebuild = true;
  state.replaceTemplate(copy);
  sync.lastRenderedRef = copy;
  state.markTemplateDirty();
  syncToolbarInputs();
  syncCreatorDeleteButton();
  return true;
}

// Generic in-place mutation helper: caller mutates state.template, then this
// emits the change + marks dirty without triggering our own grid rebuild.
export function commitInPlaceEdit() {
  state.markTemplateDirty();
  syncToolbarInputs();
  sync.suppressNextRebuild = true;
  state.notifyTemplateChanged();
}
