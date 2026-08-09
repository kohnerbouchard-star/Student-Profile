import { AdminSkeleton } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

function summarySkeleton() {
  const summary = createElement("section", {
    className: "admin-crafting-route__summary",
    attrs: { "aria-label": "Loading Crafting summary" },
  });
  for (let index = 0; index < 5; index += 1) {
    summary.append(createElement("article", {
      className: "admin-crafting-route__metric",
      children: AdminSkeleton({ label: "Loading Crafting metric", count: 2 }),
    }));
  }
  return summary;
}

/** Shape-accurate loading state for Crafting supervision. */
export function CraftingSkeleton() {
  return createElement("div", {
    className: "admin-crafting-route__loading-layout",
    dataset: { craftingSkeleton: "" },
    children: [
      summarySkeleton(),
      createElement("section", {
        className: "admin-crafting-route__boundary admin-crafting-route__boundary--loading",
        attrs: { "aria-label": "Loading Crafting boundary" },
        children: AdminSkeleton({ label: "Loading Crafting contract boundary", count: 2, shape: "row" }),
      }),
      createElement("section", {
        className: "admin-crafting-route__controls admin-crafting-route__controls--loading",
        attrs: { "aria-label": "Loading Crafting filters" },
        children: AdminSkeleton({ label: "Loading Crafting filters", count: 2, shape: "row" }),
      }),
      createElement("section", {
        className: "admin-crafting-route__panel admin-crafting-route__panel--loading",
        attrs: { "aria-label": "Loading Crafting records" },
        children: AdminSkeleton({ label: "Loading Crafting records", count: 7, shape: "row" }),
      }),
    ],
  });
}
