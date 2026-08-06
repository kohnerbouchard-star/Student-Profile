import { AdminEmptyState, AdminErrorState } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

function text(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}
/** Presents Overview notification data in the shell-owned notification drawer. */
export function OverviewNotifications({ data, onRetry } = {}) {
  const result = data?.panels?.notifications;
  if (result?.status === "rejected") {
    return AdminErrorState({
      title: "Notifications are unavailable",
      message: result.reason?.userMessage,
      requestId: result.reason?.requestId,
      retryAfterSeconds: result.reason?.retryAfterSeconds,
      compact: true,
      retry: result.reason?.retryable ? { label: "Retry Overview", onClick: onRetry } : null,
    });
  }

  const notices = data?.model?.notifications;
  if (!Array.isArray(notices) || notices.length === 0) {
    return AdminEmptyState({
      title: "No administrator notifications",
      message: "There are no notifications in the current administrator scope.",
      compact: true,
    });
  }

  const list = createElement("div", { className: "admin-u-stack" });
  notices.forEach((notice) => {
    list.append(createElement("article", {
      className: "admin-overview-route__notice",
      children: [
        createElement("strong", { text: text(notice.title || notice.label, "Administrator notice") }),
        notice.message || notice.description
          ? createElement("p", { text: notice.message || notice.description })
          : null,
        notice.createdAt ? createElement("small", { text: notice.createdAt }) : null,
      ],
    }));
  });
  return list;
}
