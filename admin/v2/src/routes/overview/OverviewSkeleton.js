import { AdminSkeleton } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

function skeletonPanel(label, rows = 3) {
  return createElement("section", {
    className: "admin-overview-route__panel",
    attrs: { "aria-label": label },
    children: [
      createElement("header", {
        className: "admin-overview-route__panel-head",
        children: AdminSkeleton({ label: `Loading ${label} heading`, count: 1 }),
      }),
      AdminSkeleton({ label: `Loading ${label}`, count: rows, shape: "row" }),
    ],
  });
}

/** Shape-accurate initial loading view for the Overview route. */
export function OverviewSkeleton() {
  const metrics = createElement("div", {
    className: "admin-overview-route__metrics",
    attrs: { "aria-label": "Loading Overview metrics" },
  });
  for (let index = 0; index < 4; index += 1) {
    metrics.append(createElement("div", {
      className: "admin-overview-route__metric",
      children: AdminSkeleton({ label: "Loading metric", count: 2 }),
    }));
  }

  return createElement("div", {
    className: "admin-overview-route admin-overview-route__loading-layout",
    dataset: { overviewSkeleton: "" },
    children: [
      createElement("section", {
        className: "admin-overview__hero",
        attrs: { "aria-label": "Loading current game" },
        children: AdminSkeleton({ label: "Loading current game", count: 2, shape: "panel" }),
      }),
      metrics,
      skeletonPanel("attendance", 3),
      skeletonPanel("leaderboard", 5),
      skeletonPanel("contracts", 3),
      skeletonPanel("notifications", 3),
    ],
  });
}
