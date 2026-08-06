import { AdminIcon } from "./AdminIcon.js";
import { createElement, createId } from "./dom.js";

export function AdminErrorState({
  title = "Unable to load this view",
  message = "Try again. If the problem continues, contact an administrator.",
  requestId,
  retryAfterSeconds,
  retry,
  compact = false,
} = {}) {
  const titleId = createId("admin-error-title");
  const root = createElement("section", {
    className: "admin-state",
    dataset: { tone: "error", compact },
    attrs: { role: "alert", "aria-labelledby": titleId },
  });
  root.append(
    createElement("div", { className: "admin-state__icon", children: AdminIcon({ name: "error", size: 28 }) }),
    createElement("h3", { className: "admin-state__title", text: title, attrs: { id: titleId } }),
    createElement("p", { className: "admin-state__message", text: message }),
  );

  if (requestId) {
    root.append(createElement("p", {
      className: "admin-state__reference",
      text: `Reference: ${requestId}`,
    }));
  }

  if (Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0) {
    root.append(createElement("p", {
      className: "admin-state__reference",
      text: `Wait ${retryAfterSeconds} seconds before retrying.`,
    }));
  }

  if (retry?.onClick) {
    const button = createElement("button", {
      className: "admin-button",
      attrs: { type: "button" },
      children: [AdminIcon({ name: "refresh", size: 17 }), retry.label || "Try again"],
    });
    button.addEventListener("click", retry.onClick);
    root.append(button);
  }
  return root;
}
