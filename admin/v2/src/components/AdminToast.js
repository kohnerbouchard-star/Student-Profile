import { AdminIcon } from "./AdminIcon.js";
import { appendContent, createElement, createId } from "./dom.js";

const TOAST_ICONS = Object.freeze({
  info: "info",
  success: "success",
  warning: "warning",
  error: "error",
});

export function AdminToast({ container = document.body, label = "Notifications" } = {}) {
  const region = createElement("section", {
    className: "admin-toast-region",
    dataset: { adminV2Layer: "toast" },
    attrs: { "aria-label": label, "aria-live": "polite", "aria-relevant": "additions" },
  });
  container.append(region);
  const active = new Map();

  function dismiss(id, reason = "dismissed") {
    const entry = active.get(id);
    if (!entry) return;
    active.delete(id);
    window.clearTimeout(entry.timeoutId);
    entry.element.dataset.leaving = "true";
    entry.element.addEventListener("animationend", () => entry.element.remove(), { once: true });
    window.setTimeout(() => entry.element.remove(), 220);
    entry.onDismiss?.(reason);
  }

  function push({
    id = createId("admin-toast"),
    tone = "info",
    title,
    message,
    duration = 5000,
    action,
    onDismiss,
  } = {}) {
    if (active.has(id)) dismiss(id, "replaced");

    const toast = createElement("article", {
      className: "admin-toast",
      dataset: { tone },
      attrs: { role: tone === "error" ? "alert" : "status", "aria-atomic": "true" },
    });
    const copy = createElement("div", { className: "admin-toast__copy" });
    if (title) copy.append(createElement("strong", { className: "admin-toast__title", text: title }));
    if (message) copy.append(createElement("p", { className: "admin-toast__message", text: message }));

    const actions = createElement("div", { className: "admin-toast__actions" });
    if (action?.label && action.onClick) {
      const actionButton = createElement("button", {
        className: "admin-button admin-button--quiet",
        attrs: { type: "button" },
        text: action.label,
      });
      actionButton.addEventListener("click", () => action.onClick({ id, dismiss: () => dismiss(id, "action") }));
      actions.append(actionButton);
    }

    const closeButton = createElement("button", {
      className: "admin-icon-button",
      attrs: { type: "button", "aria-label": "Dismiss notification" },
      children: AdminIcon({ name: "close", size: 18 }),
    });
    closeButton.addEventListener("click", () => dismiss(id));
    actions.append(closeButton);
    toast.append(
      createElement("div", {
        className: "admin-toast__icon",
        children: AdminIcon({ name: TOAST_ICONS[tone] || "info", size: 20 }),
      }),
      copy,
      actions,
    );
    appendContent(region, toast);

    const timeoutId = duration > 0
      ? window.setTimeout(() => dismiss(id, "timeout"), duration)
      : null;
    active.set(id, { element: toast, timeoutId, onDismiss });
    return id;
  }

  function destroy() {
    [...active.keys()].forEach((id) => dismiss(id, "destroyed"));
    region.remove();
  }

  return { element: region, push, dismiss, destroy };
}
