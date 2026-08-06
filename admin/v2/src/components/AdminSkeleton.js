import { createElement } from "./dom.js";

export function AdminSkeleton({
  label = "Loading content",
  count = 1,
  shape = "line",
  className = "",
} = {}) {
  const root = createElement("div", {
    className: `admin-skeleton-set${className ? ` ${className}` : ""}`,
    attrs: { role: "status", "aria-live": "polite", "aria-label": label },
  });
  root.append(createElement("span", { className: "admin-u-visually-hidden", text: label }));

  for (let index = 0; index < Math.max(1, count); index += 1) {
    root.append(createElement("span", {
      className: "admin-skeleton",
      dataset: { shape },
      attrs: { "aria-hidden": "true" },
    }));
  }
  return root;
}
