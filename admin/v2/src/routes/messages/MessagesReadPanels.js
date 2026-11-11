import { createElement } from "../../components/dom.js";

export function titleCase(value, fallback = "Not available") {
  const normalized = String(value || "").trim();
  return normalized
    ? normalized.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : fallback;
}

export function displayTime(value) {
  const parsed = Date.parse(String(value || ""));
  if (!Number.isFinite(parsed)) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(parsed));
}

function metric(label, value, detail) {
  return createElement("article", {
    className: "admin-messages-route__metric",
    children: [
      createElement("span", { text: label }),
      createElement("output", { text: Number(value || 0).toLocaleString() }),
      createElement("small", { text: detail }),
    ],
  });
}

export function summary(model) {
  return createElement("section", {
    className: "admin-messages-route__summary",
    attrs: { "aria-label": "Messages moderation summary" },
    children: [
      metric("Returned", model.summary.returned, "Current page"),
      metric("Active", model.summary.active, "Open conversations"),
      metric("Restricted", model.summary.restricted, "Disabled or closed"),
      metric("Hidden messages", model.summary.hiddenMessages, "Moderated on this page"),
    ],
  });
}

export function statusBadge(status) {
  return createElement("span", {
    className: "admin-messages-route__status",
    dataset: { status: status || "unknown" },
    text: titleCase(status),
  });
}
