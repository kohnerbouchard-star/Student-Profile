import { AdminSkeleton } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

function summarySkeleton() {
  const summary = createElement("section", {
    className: "admin-store-route__summary",
    attrs: { "aria-label": "Loading Store summary" },
  });
  for (let index = 0; index < 3; index += 1) {
    summary.append(createElement("article", {
      className: "admin-store-route__metric",
      children: AdminSkeleton({ label: "Loading Store metric", count: 2 }),
    }));
  }
  return summary;
}

/** Shape-accurate initial loading view for Store Management. */
export function StoreSkeleton() {
  return createElement("div", {
    className: "admin-store-route admin-store-route__loading-layout",
    dataset: { storeSkeleton: "" },
    children: [
      summarySkeleton(),
      createElement("section", {
        className: "admin-store-route__controls admin-store-route__controls--loading",
        attrs: { "aria-label": "Loading Store controls" },
        children: AdminSkeleton({ label: "Loading Store controls", count: 3, shape: "row" }),
      }),
      createElement("section", {
        className: "admin-store-route__catalog admin-store-route__catalog--loading",
        attrs: { "aria-label": "Loading Store items" },
        children: AdminSkeleton({ label: "Loading Store items", count: 6, shape: "row" }),
      }),
    ],
  });
}
