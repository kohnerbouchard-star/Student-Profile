import { AdminIcon } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

export function titleCase(value, fallback = "Not available") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text
    .replace(/[_-]+/g, " ")
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function displayNumber(value) {
  return Number.isFinite(Number(value))
    ? Number(value).toLocaleString("en-US")
    : "—";
}

export function displayMinor(value) {
  return Number.isFinite(Number(value))
    ? Number(value).toLocaleString("en-US")
    : "—";
}

export function displayBasisPoints(value) {
  return Number.isFinite(Number(value))
    ? `${(Number(value) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`
    : "—";
}

export function displayTime(value) {
  const milliseconds = Date.parse(String(value || ""));
  if (!Number.isFinite(milliseconds)) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(milliseconds));
}

export function actionButton({
  label,
  icon = null,
  quiet = false,
  danger = false,
  disabled = false,
  disabledReason = "",
  onClick,
  action,
}) {
  const button = createElement("button", {
    className: `admin-button${quiet ? " admin-button--quiet" : ""}`,
    attrs: {
      type: "button",
      disabled,
      title: disabled ? (disabledReason || "This action is currently unavailable.") : null,
      "aria-label": disabled && disabledReason ? `${label}. ${disabledReason}` : label,
    },
    dataset: {
      tone: danger ? "danger" : null,
      worldAction: action || "",
    },
    children: [icon ? AdminIcon({ name: icon, size: 17 }) : null, label],
  });
  button.addEventListener("click", onClick);
  return button;
}

export function statusPill(value) {
  const normalized = String(value || "unknown").trim().toLowerCase();
  return createElement("span", {
    className: "admin-world-route__status",
    dataset: { status: normalized },
    text: titleCase(normalized),
  });
}

export function factGrid(entries) {
  return createElement("dl", {
    className: "admin-world-route__facts",
    children: entries.map(([label, value]) => createElement("div", {
      children: [
        createElement("dt", { text: label }),
        createElement("dd", { text: value || "—" }),
      ],
    })),
  });
}

export function sectionCard({ id = "", eyebrow, title, description = "", actions = [], children = [] }) {
  return createElement("section", {
    className: "admin-world-route__section",
    attrs: id ? { id } : {},
    children: [
      createElement("header", {
        className: "admin-world-route__section-header",
        children: [
          createElement("div", {
            className: "admin-world-route__section-copy",
            children: [
              createElement("small", { text: eyebrow }),
              createElement("h2", { text: title }),
              description ? createElement("p", { text: description }) : null,
            ],
          }),
          actions.length
            ? createElement("div", {
              className: "admin-world-route__section-actions",
              children: actions,
            })
            : null,
        ],
      }),
      ...children,
    ],
  });
}
