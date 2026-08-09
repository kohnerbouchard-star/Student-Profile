import { AdminSkeleton } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

export function MarketplaceSkeleton() {
  return createElement("div", {
    className: "admin-marketplace-route__loading-layout",
    children: [
      createElement("section", {
        className: "admin-marketplace-route__summary",
        attrs: { "aria-label": "Loading Marketplace summary" },
        children: Array.from({ length: 4 }, () => AdminSkeleton({ label: "Loading Marketplace metric", count: 2 })),
      }),
      createElement("section", {
        className: "admin-marketplace-route__controls admin-marketplace-route__controls--loading",
        children: AdminSkeleton({ label: "Loading Marketplace filters", count: 3 }),
      }),
      createElement("section", {
        className: "admin-marketplace-route__panel admin-marketplace-route__panel--loading",
        children: AdminSkeleton({ label: "Loading Marketplace listings", count: 7 }),
      }),
    ],
  });
}
