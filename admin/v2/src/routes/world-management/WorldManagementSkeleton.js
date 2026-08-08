import { AdminSkeleton } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

function summarySkeleton() {
  const summary = createElement("section", {
    className: "admin-world-route__summary",
    attrs: { "aria-label": "Loading World summary" },
  });
  for (let index = 0; index < 4; index += 1) {
    summary.append(createElement("article", {
      className: "admin-world-route__metric",
      children: AdminSkeleton({ label: "Loading World metric", count: 2 }),
    }));
  }
  return summary;
}

/** Shape-accurate initial loading view for World Management. */
export function WorldManagementSkeleton() {
  return createElement("div", {
    className: "admin-world-route__loading-layout",
    dataset: { worldManagementSkeleton: "" },
    children: [
      summarySkeleton(),
      createElement("section", {
        className: "admin-world-route__section",
        attrs: { "aria-label": "Loading World configuration" },
        children: AdminSkeleton({ label: "Loading World configuration", count: 4, shape: "row" }),
      }),
      createElement("section", {
        className: "admin-world-route__section",
        attrs: { "aria-label": "Loading World tables" },
        children: AdminSkeleton({ label: "Loading World tables", count: 7, shape: "row" }),
      }),
    ],
  });
}
