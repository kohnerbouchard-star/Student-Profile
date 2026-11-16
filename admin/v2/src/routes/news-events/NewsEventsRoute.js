import { AdminErrorState, AdminIcon, AdminPageFrame, AdminStaleState } from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";
import { resolvedContent } from "./NewsEventsPanels.js";

function loadingContent() {
  return createElement("div", {
    className: "admin-news-events__loading",
    attrs: { "aria-label": "Loading News & Events" },
    children: [
      createElement("div", { className: "admin-news-events__loading-summary", children: Array.from({ length: 5 }, () => createElement("span", { className: "admin-skeleton-block" })) }),
      createElement("div", { className: "admin-news-events__loading-panel admin-skeleton-block" }),
      createElement("div", { className: "admin-news-events__loading-table admin-skeleton-block" }),
    ],
  });
}

function refreshButton(onRefresh, disabled = false) {
  const button = createElement("button", {
    className: "admin-button admin-button--quiet",
    attrs: { type: "button", disabled },
    children: [AdminIcon({ name: "refresh", size: 16 }), disabled ? "Refreshing…" : "Refresh"],
  });
  button.addEventListener("click", () => onRefresh());
  return button;
}

export function NewsEventsRoute({
  state,
  filters,
  onFiltersChange = () => {},
  onRefresh = () => {},
  onRecover = () => Promise.resolve(false),
} = {}) {
  const status = state?.status || ADMIN_DATA_STATES.INITIAL_LOADING;
  let content;
  if (status === ADMIN_DATA_STATES.INITIAL_LOADING) {
    content = loadingContent();
  } else if (status === ADMIN_DATA_STATES.FAILED) {
    content = AdminErrorState({
      title: "News & Event Monitor could not be loaded",
      message: state.error?.userMessage || "The authoritative world-event service is unavailable.",
      requestId: state.error?.requestId,
      retryAfterSeconds: state.error?.retryAfterSeconds,
      retry: state.error?.retryable ? { label: "Retry monitor", onClick: onRefresh } : null,
    });
  } else {
    const resolved = resolvedContent(state.data || {}, filters, onFiltersChange, onRefresh, onRecover);
    content = status === ADMIN_DATA_STATES.STALE
      ? AdminStaleState({
        message: "Showing the most recently resolved News & Events data while the authoritative feeds reconnect.",
        retry: { label: "Refresh", onClick: onRefresh },
        content: resolved,
      })
      : resolved;
  }

  const frame = AdminPageFrame({
    eyebrow: "World",
    title: "News & Event Monitor",
    description: "Read campaign events and publication status, inspect upcoming checkpoints, and recover failed publication effects. Content authoring remains outside this read-only monitor.",
    actions: refreshButton(onRefresh, status === ADMIN_DATA_STATES.REFRESHING),
    content,
  });
  frame.element.classList.add("admin-news-events");
  frame.element.dataset.newsEventsState = status;
  return Object.freeze({ element: frame.element });
}
