import { AdminIcon } from "./AdminIcon.js";
import { appendContent, createElement } from "./dom.js";

export function AdminStaleState({
  message = "Showing the latest saved data while we reconnect.",
  retry,
  content,
} = {}) {
  const root = createElement("section", {
    className: "admin-stale-state",
    attrs: { "aria-live": "polite", "aria-label": "Data may be out of date" },
  });
  const banner = createElement("div", {
    className: "admin-stale-state__banner",
    children: [
      AdminIcon({ name: "stale", size: 18 }),
      createElement("span", { text: message }),
    ],
  });

  if (retry?.onClick) {
    const button = createElement("button", {
      className: "admin-button admin-button--quiet",
      text: retry.label || "Refresh",
      attrs: { type: "button" },
    });
    button.addEventListener("click", retry.onClick);
    banner.append(button);
  }

  root.append(banner);
  if (content) {
    const contentContainer = createElement("div", { className: "admin-stale-state__content" });
    appendContent(contentContainer, content);
    root.append(contentContainer);
  }
  return root;
}
