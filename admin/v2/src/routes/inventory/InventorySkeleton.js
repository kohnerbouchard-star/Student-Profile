import { AdminSkeleton } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

export function InventorySkeleton() {
  return createElement("div", {
    className: "admin-inventory-route__loading-layout",
    children: [
      AdminSkeleton({ label: "Loading inventory summary", count: 3, shape: "block" }),
      AdminSkeleton({ label: "Loading inventory contract boundary", count: 2, shape: "line" }),
      AdminSkeleton({ label: "Loading inventory filters", count: 2, shape: "block" }),
      AdminSkeleton({ label: "Loading inventory redemption records", count: 6, shape: "row" }),
    ],
  });
}
