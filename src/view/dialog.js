// Modal confirm dialog with up to 3 buttons. Replaces native confirm() where
// we need more than OK/Cancel (e.g. "Save / Discard / Cancel" on dirty switch).
//
// Returns a Promise that resolves to the chosen button's value, or null if
// dismissed via Esc / backdrop / X.
//
// Markup is created lazily on first call; one dialog instance is reused.

let root = null;
let titleEl = null;
let messageEl = null;
let buttonsEl = null;
let activeResolve = null;

function ensureMounted() {
  if (root) return;
  root = document.createElement("div");
  root.className = "dialog";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.innerHTML = `
    <div class="dialog__backdrop"></div>
    <div class="dialog__box" role="document">
      <button class="dialog__close" type="button" aria-label="Close">✕</button>
      <h2 class="dialog__title"></h2>
      <p class="dialog__message"></p>
      <div class="dialog__buttons"></div>
    </div>
  `;
  document.body.appendChild(root);
  titleEl   = root.querySelector(".dialog__title");
  messageEl = root.querySelector(".dialog__message");
  buttonsEl = root.querySelector(".dialog__buttons");
  root.querySelector(".dialog__backdrop").addEventListener("click", () => resolve(null));
  root.querySelector(".dialog__close").addEventListener("click", () => resolve(null));
  // Capture phase + stopImmediatePropagation: Esc fired while a dialog is
  // open must NOT also reach the modal-level Esc handler underneath, which
  // would close the modal alongside the dialog.
  document.addEventListener("keydown", (e) => {
    if (!root.classList.contains("is-open")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      resolve(null);
    }
  }, true);
}

function resolve(value) {
  if (!activeResolve) return;
  const fn = activeResolve;
  activeResolve = null;
  root.classList.remove("is-open");
  // Keep buttons around for screen readers until animation/close completes,
  // but clear them on next call via showDialog.
  fn(value);
}

// Buttons: [{ label, value, variant?: "primary" | "danger" | "default" }]
// Returns Promise<value | null>.
export function showDialog({ title = "", message = "", buttons = [] } = {}) {
  ensureMounted();
  if (activeResolve) {
    // Cancel any in-flight dialog so the caller doesn't deadlock on a stale
    // promise. Rare in practice (one dialog at a time).
    resolve(null);
  }
  titleEl.textContent = title;
  messageEl.textContent = message;
  buttonsEl.innerHTML = "";
  for (const b of buttons) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dialog__btn";
    if (b.variant === "primary") btn.classList.add("dialog__btn--primary");
    if (b.variant === "danger")  btn.classList.add("dialog__btn--danger");
    btn.textContent = b.label;
    btn.addEventListener("click", () => resolve(b.value));
    buttonsEl.appendChild(btn);
  }
  root.classList.add("is-open");
  // Focus the first primary button if any, else the first button.
  const focusTarget = buttonsEl.querySelector(".dialog__btn--primary")
                   || buttonsEl.querySelector(".dialog__btn");
  if (focusTarget) focusTarget.focus();
  return new Promise((res) => { activeResolve = res; });
}

// Convenience helpers used by save/load flows.
export function confirmDiscardOrSave({ title = "Unsaved changes", message } = {}) {
  return showDialog({
    title,
    message: message || "Save changes before continuing?",
    buttons: [
      { label: "Save",    value: "save",    variant: "primary" },
      { label: "Discard", value: "discard", variant: "danger"  },
      { label: "Cancel",  value: "cancel" },
    ],
  });
}

export function confirmReplaceOrNew({ title = "Import project", message } = {}) {
  return showDialog({
    title,
    message: message || "Replace the current project with the imported one, or open it as a new entry?",
    buttons: [
      { label: "Replace current", value: "replace", variant: "primary" },
      { label: "Open as new",     value: "new" },
      { label: "Cancel",          value: "cancel" },
    ],
  });
}

// Generic destructive 2-button confirm — returns true on confirm, false on
// cancel/dismiss. The common case (Delete X / Reset Y) used across the app.
export async function confirmDestructive({ title, message, confirmLabel = "Delete" } = {}) {
  const choice = await showDialog({
    title:   title || "Are you sure?",
    message: message || "",
    buttons: [
      { label: confirmLabel, value: "confirm", variant: "danger" },
      { label: "Cancel",     value: "cancel" },
    ],
  });
  return choice === "confirm";
}
