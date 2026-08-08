import { AdminSkeleton } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

export function MessagesSkeleton() {
  return createElement("div", {
    className: "admin-messages-route__loading-layout",
    children: [
      createElement("section", {
        className: "admin-messages-route__summary",
        children: Array.from({ length: 4 }, () => createElement("article", {
          className: "admin-messages-route__metric",
          children: AdminSkeleton({ label: "Loading message summary", count: 2 }),
        })),
      }),
      createElement("section", {
        className: "admin-messages-route__controls admin-messages-route__controls--loading",
        children: AdminSkeleton({ label: "Loading message filters", count: 3 }),
      }),
      createElement("section", {
        className: "admin-messages-route__thread-list",
        children: Array.from({ length: 3 }, () => createElement("article", {
          className: "admin-messages-route__thread",
          children: AdminSkeleton({ label: "Loading conversation", count: 5 }),
        })),
      }),
    ],
  });
}
