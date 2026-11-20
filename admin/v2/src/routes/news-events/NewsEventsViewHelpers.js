import { createElement } from "../../components/dom.js";

const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

export function safeText(value, fallback = "", maximum = 1_000) {
  const result = String(value ?? "").trim();
  if (!result || UUID_IN_TEXT_PATTERN.test(result)) return fallback;
  return result.slice(0, maximum);
}

export function titleCase(value, fallback = "Not available") {
  const text = safeText(value, "", 160);
  return text
    ? text.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : fallback;
}

export function formatTime(value, fallback = "Not available") {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return fallback;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export function number(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString() : "0";
}

export function statusBadge(value) {
  const status = ["active", "upcoming", "past", "failed", "paused"].includes(String(value))
    ? String(value)
    : "unknown";
  return createElement("span", {
    className: "admin-news-events__status",
    dataset: { status },
    text: titleCase(status),
  });
}

export function typeBadge(value) {
  const kind = value === "news" ? "news" : "event";
  return createElement("span", {
    className: "admin-news-events__type",
    dataset: { type: kind },
    text: kind === "news" ? "News publication" : "World event",
  });
}
