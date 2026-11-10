import { AdminIcon } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

export function titleCase(value, fallback = "Not available") {
  const text = String(value || "").trim();
  return text
    ? text.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : fallback;
}

export function displayNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString("en-US") : "—";
}

export function displayDecimal(value) {
  return Number.isFinite(Number(value))
    ? Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })
    : "—";
}

export function displayDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "—"
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function displaySeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3_600)}h`;
}

export function routeButton({
  label,
  icon,
  quiet = false,
  tone = "",
  onClick,
  disabled = false,
  action = "",
}) {
  const button = createElement("button", {
    className: `admin-button${quiet ? " admin-button--quiet" : ""}`,
    attrs: { type: "button", disabled },
    dataset: { tone, craftingAction: action },
    children: [icon ? AdminIcon({ name: icon, size: 17 }) : null, label],
  });
  button.addEventListener("click", onClick);
  return button;
}

export function statusBadge(value) {
  return createElement("span", {
    className: "admin-crafting-route__status",
    dataset: { status: value || "unknown" },
    text: titleCase(value),
  });
}

export function numericInputValue(value, fallback = "") {
  return value === null || value === undefined ? fallback : value;
}
