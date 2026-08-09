import { AdminSkeleton } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

export function PlayersSkeleton() {
  return createElement("div", {
    className: "admin-players-route__skeleton",
    attrs: { "aria-label": "Loading Players" },
    children: [
      createElement("section", {
        className: "admin-players-route__summary",
        children: Array.from({ length: 4 }, () => AdminSkeleton({ count: 1, shape: "card" })),
      }),
      createElement("section", {
        className: "admin-players-route__controls",
        children: Array.from({ length: 3 }, () => AdminSkeleton({ count: 1, shape: "field" })),
      }),
      AdminSkeleton({ count: 6, shape: "row", label: "Loading Player roster" }),
    ],
  });
}
