import { AdminIcon } from "./AdminIcon.js";
import { appendContent, createElement, createId } from "./dom.js";

export function AdminEmptyState({
  title = "Nothing here yet",
  message = "There is no data to display.",
  action,
  compact = false,
} = {}) {
  const titleId = createId("admin-empty-title");
  const root = createElement("section", {
    className: "admin-state",
    dataset: { tone: "empty", compact },
    attrs: { "aria-labelledby": titleId },
  });
  const heading = createElement("h3", {
    className: "admin-state__title",
    text: title,
    attrs: { id: titleId },
  });
  root.append(
    createElement("div", { className: "admin-state__icon", children: AdminIcon({ name: "empty", size: 28 }) }),
    heading,
    createElement("p", { className: "admin-state__message", text: message }),
  );

  if (action?.label && action.onClick) {
    const button = createElement("button", {
      className: "admin-button",
      text: action.label,
      attrs: { type: "button" },
    });
    button.addEventListener("click", action.onClick);
    appendContent(root, button);
  }
  return root;
}
