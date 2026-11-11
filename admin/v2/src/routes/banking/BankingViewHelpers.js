import { AdminIcon } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

export function titleCase(value, fallback = "Not available") {
  const text = String(value || "").trim();
  return text
    ? text.replace(/[_-]+/g, " ").replace(/\b\p{L}/gu, (letter) => letter.toUpperCase())
    : fallback;
}

export function displayNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString(undefined) : "—";
}

export function displayAmount(value, currencyCode, { signed = false } = {}) {
  if (!Number.isFinite(Number(value))) return "—";
  const number = Number(value);
  const amount = Math.abs(number).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const sign = signed ? (number > 0 ? "+" : number < 0 ? "−" : "") : (number < 0 ? "−" : "");
  const code = String(currencyCode || "").trim().toUpperCase();
  return `${sign}${amount}${code ? ` ${code}` : ""}`;
}

export function displayDate(value) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function button({ label, icon, quiet = false, onClick, disabled = false, disabledReason = "", action }) {
  const element = createElement("button", {
    className: `admin-button${quiet ? " admin-button--quiet" : ""}`,
    attrs: { type: "button", disabled, title: disabled && disabledReason ? disabledReason : null },
    dataset: { bankingAction: action },
    children: [icon ? AdminIcon({ name: icon, size: 17 }) : null, label],
  });
  element.addEventListener("click", onClick);
  return element;
}

export function capabilityNote() {
  return createElement("aside", {
    className: "admin-banking-route__contract-note",
    attrs: { "aria-label": "Banking teacher note" },
    children: [
      AdminIcon({ name: "info", size: 18 }),
      createElement("p", {
        text: "Checking and Savings transfers appear here after students complete them. Teacher corrections change an existing balance only and are recorded in Activity History.",
      }),
    ],
  });
}
