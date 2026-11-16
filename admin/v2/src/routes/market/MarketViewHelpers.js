import { AdminIcon } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const PUBLIC_SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,15}$/;

export function safeText(value, fallback = "", maximum = 500) {
  const text = String(value ?? "").trim();
  if (!text || UUID_IN_TEXT_PATTERN.test(text)) return fallback;
  return text.slice(0, maximum);
}

export function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function displayNumber(value, { sign = false, integer = false } = {}) {
  const number = finiteNumber(value);
  if (number === null) return "Not available";
  const absolute = Math.abs(number);
  const maximumFractionDigits = integer ? 0 : absolute > 0 && absolute < 1 ? 8 : 2;
  const formatted = number.toLocaleString("en-US", { maximumFractionDigits });
  return sign && number > 0 ? `+${formatted}` : formatted;
}

export function titleCase(value, fallback = "Not available") {
  const text = safeText(value, "", 160);
  return text
    ? text.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : fallback;
}

export function filterKey(value) {
  return safeText(value, "", 160)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function publicRowKey(instrument, index) {
  const symbol = String(instrument?.symbol || instrument?.rowKey || "").trim().toUpperCase();
  return PUBLIC_SYMBOL_PATTERN.test(symbol) ? symbol : `market-instrument-${index + 1}`;
}

export function marketButton({ label, icon, quiet = false, action, disabled = false, onClick }) {
  const button = createElement("button", {
    className: `admin-button${quiet ? " admin-button--quiet" : ""}`,
    attrs: { type: "button", disabled },
    dataset: { marketAction: action },
    children: [icon ? AdminIcon({ name: icon, size: 17 }) : null, label],
  });
  button.addEventListener("click", onClick);
  return button;
}
