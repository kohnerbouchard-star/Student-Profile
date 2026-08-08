import { AdminSkeleton } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

export function ContractsSkeleton() {
  return createElement("div", {
    className: "admin-contracts-route__skeleton",
    attrs: { "aria-label": "Loading Contracts Management" },
    children: [
      createElement("section", {
        className: "admin-contracts-route__summary",
        children: [0, 1, 2, 3].map(() => createElement("article", {
          className: "admin-contracts-route__metric",
          children: [
            AdminSkeleton({ width: "42%", height: 12 }),
            AdminSkeleton({ width: "28%", height: 30 }),
            AdminSkeleton({ width: "60%", height: 11 }),
          ],
        })),
      }),
      createElement("section", {
        className: "admin-contracts-route__loading-table",
        children: [
          AdminSkeleton({ width: "100%", height: 48 }),
          AdminSkeleton({ width: "100%", height: 72 }),
          AdminSkeleton({ width: "100%", height: 72 }),
          AdminSkeleton({ width: "100%", height: 72 }),
        ],
      }),
    ],
  });
}
