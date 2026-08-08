import { AdminSkeleton } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

export function LogsSkeleton() {
  return createElement("div", {
    className: "admin-logs-route__loading-layout",
    attrs: { "aria-label": "Loading audit logs" },
    children: [
      createElement("section", {
        className: "admin-logs-route__summary",
        children: Array.from({ length: 4 }, () => AdminSkeleton({ count: 3, shape: "line" })),
      }),
      createElement("section", {
        className: "admin-logs-route__panel admin-logs-route__panel--loading",
        children: [
          AdminSkeleton({ count: 5, shape: "line" }),
          AdminSkeleton({ count: 8, shape: "row" }),
        ],
      }),
    ],
  });
}
