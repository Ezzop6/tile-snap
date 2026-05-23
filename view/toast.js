const DEFAULT_DURATION_MS = 2400;

let containerEl = null;

function ensureContainer() {
  if (containerEl && document.body.contains(containerEl)) return containerEl;
  containerEl = document.createElement("div");
  containerEl.className = "toast-stack";
  document.body.appendChild(containerEl);
  return containerEl;
}

export function showToast(message, options = {}) {
  const root = ensureContainer();
  const el = document.createElement("div");
  el.className = `toast toast--${options.kind || "info"}`;
  // action: { label, onClick } adds a button — its click counts as a user
  // gesture, useful for fallback downloads that the browser blocked from
  // the auto-fire path.
  if (options.action) {
    const text = document.createElement("span");
    text.textContent = message;
    el.appendChild(text);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast__action";
    btn.textContent = options.action.label;
    btn.addEventListener("click", () => {
      options.action.onClick?.();
    });
    el.appendChild(btn);
  } else {
    el.textContent = message;
  }
  root.appendChild(el);

  // Defer one frame so the transition actually runs.
  requestAnimationFrame(() => el.classList.add("is-visible"));

  const duration = options.duration ?? DEFAULT_DURATION_MS;
  setTimeout(() => {
    el.classList.remove("is-visible");
    setTimeout(() => el.remove(), 300);
  }, duration);
}
