import { AdminSkeleton } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

function summarySkeleton() {
  const section = createElement("section", {
    className: "admin-market-route__summary",
    attrs: { "aria-label": "Loading Market summary" },
  });
  for (let index = 0; index < 4; index += 1) {
    section.append(createElement("article", {
      className: "admin-market-route__metric",
      children: AdminSkeleton({ label: "Loading Market metric", count: 2 }),
    }));
  }
  return section;
}

/** Shape-accurate initial loading view for financial Market Management. */
export function MarketSkeleton() {
  return createElement("div", {
    className: "admin-market-route__loading-layout",
    dataset: { marketSkeleton: "" },
    children: [
      summarySkeleton(),
      createElement("aside", {
        className: "admin-market-route__session-note admin-market-route__session-note--loading",
        attrs: { "aria-label": "Loading Market session contract" },
        children: AdminSkeleton({ label: "Loading Market contract note", count: 2 }),
      }),
      createElement("section", {
        className: "admin-market-route__catalog admin-market-route__catalog--loading",
        attrs: { "aria-label": "Loading listed instruments" },
        children: [
          createElement("div", {
            className: "admin-market-route__controls admin-market-route__controls--loading",
            children: AdminSkeleton({ label: "Loading Market filters", count: 5, shape: "row" }),
          }),
          AdminSkeleton({ label: "Loading Market instruments", count: 6, shape: "row" }),
        ],
      }),
      createElement("div", {
        className: "admin-market-route__activity-grid",
        attrs: { "aria-label": "Loading Market activity" },
        children: [
          createElement("section", {
            className: "admin-market-route__activity-panel",
            children: AdminSkeleton({ label: "Loading recent Market activity", count: 4 }),
          }),
          createElement("section", {
            className: "admin-market-route__activity-panel",
            children: AdminSkeleton({ label: "Loading Market events", count: 4 }),
          }),
        ],
      }),
    ],
  });
}
