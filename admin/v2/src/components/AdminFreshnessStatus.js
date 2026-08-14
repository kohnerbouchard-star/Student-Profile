import { AdminIcon } from "./AdminIcon.js";
import { createElement } from "./dom.js";
import { formatAdminDateTime, formatAdminRelativeTime } from "../core/date-time.js";

export function AdminFreshnessStatus({ state, onRefresh = null } = {}) {
  const status = String(state?.status || "initial-loading");
  const updatedAt = state?.updatedAt || null;
  const stale = status === "stale";
  const refreshing = status === "refreshing" || status === "initial-loading";
  const root = createElement("div", {
    className: "admin-freshness",
    dataset: { state: stale ? "stale" : refreshing ? "refreshing" : "ready" },
    attrs: { role: "status", "aria-live": "polite" },
  });
  root.append(AdminIcon({
    name: stale ? "stale" : refreshing ? "refresh" : "success",
    size: 15,
  }));
  const copy = createElement("span", {
    text: refreshing
      ? "Refreshing data…"
      : stale
        ? `Showing last confirmed data${updatedAt ? ` · ${formatAdminRelativeTime(updatedAt)}` : ""}`
        : updatedAt
          ? `Updated ${formatAdminRelativeTime(updatedAt)}`
          : "Current data",
    attrs: updatedAt ? { title: formatAdminDateTime(updatedAt) } : {},
  });
  root.append(copy);
  if (typeof onRefresh === "function" && !refreshing) {
    const refresh = createElement("button", {
      className: "admin-freshness__refresh",
      attrs: { type: "button" },
      text: stale ? "Retry" : "Refresh",
    });
    refresh.addEventListener("click", onRefresh);
    root.append(refresh);
  }
  return root;
}
