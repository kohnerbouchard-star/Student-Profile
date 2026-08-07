import { AdminEmptyState } from "../../components/index.js";
import { createElement, createId } from "../../components/dom.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

function safeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  if (!text || UUID_IN_TEXT_PATTERN.test(text)) return fallback;
  return text.slice(0, 160);
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function currencyCode(value) {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z][A-Z0-9]{2,7}$/.test(code) ? code : "";
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "Not available";
  const absolute = Math.abs(value);
  const maximumFractionDigits = absolute > 0 && absolute < 1 ? 8 : 2;
  return value.toLocaleString("en-US", { maximumFractionDigits });
}

function formatAmount(value, code) {
  const amount = formatNumber(value);
  if (amount === "Not available") return amount;
  const currency = currencyCode(code);
  return currency ? `${amount} ${currency}` : `${amount} · currency unavailable`;
}

function observationTime(point, index) {
  const candidate = point?.time ?? point?.timestamp ?? point?.createdAt;
  const milliseconds = Date.parse(String(candidate || ""));
  return Number.isFinite(milliseconds)
    ? Object.freeze({ milliseconds, label: new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(milliseconds)) })
    : Object.freeze({ milliseconds: index, label: `Observation ${index + 1}` });
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(0, 500).map((point, index) => {
    const close = finiteNumber(point?.close ?? point?.price ?? point?.value);
    if (close === null) return null;
    const time = observationTime(point, index);
    return Object.freeze({
      close,
      volume: finiteNumber(point?.volume),
      time: time.milliseconds,
      timeLabel: time.label,
    });
  }).filter(Boolean);
}

function svgElement(tagName, attributes = {}, text = null) {
  const element = document.createElementNS(SVG_NAMESPACE, tagName);
  Object.entries(attributes).forEach(([name, value]) => {
    if (value !== null && value !== undefined) element.setAttribute(name, String(value));
  });
  if (text !== null) element.textContent = String(text);
  return element;
}

function chartPoint(index, value, count, low, span) {
  const left = 54;
  const right = 700;
  const top = 20;
  const bottom = 216;
  const x = count <= 1 ? (left + right) / 2 : left + (index / (count - 1)) * (right - left);
  const y = bottom - ((value - low) / span) * (bottom - top);
  return Object.freeze({ x, y });
}

function summaryMetric(label, value) {
  return createElement("div", {
    children: [
      createElement("dt", { text: label }),
      createElement("dd", { text: value }),
    ],
  });
}

/** Renders one authoritative price series. No synthetic range variants are created. */
export function MarketChart({ history = [], instrument = {}, currency = "" } = {}) {
  const points = normalizeHistory(history);
  if (points.length === 0) {
    const empty = AdminEmptyState({
      title: "Price history unavailable",
      message: "No authoritative price observations were returned for this instrument.",
      compact: true,
    });
    empty.classList.add("admin-market-chart__empty");
    return empty;
  }

  const identity = safeText(instrument.symbol || instrument.ticker || instrument.name, "selected instrument");
  const currencyIdentity = currencyCode(currency || instrument.currencyCode);
  const values = points.map((point) => point.close);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const latest = values.at(-1);
  const latestVolume = points.at(-1).volume;
  const rawSpan = high - low;
  const span = rawSpan > 0 ? rawSpan : Math.max(Math.abs(high) * 0.02, 1);
  const plotLow = rawSpan > 0 ? low : low - span / 2;
  const coordinates = points.map((point, index) => chartPoint(
    index,
    point.close,
    points.length,
    plotLow,
    span,
  ));
  const titleId = createId("admin-market-chart-title");
  const descriptionId = createId("admin-market-chart-description");
  const title = createElement("h3", {
    className: "admin-market-chart__title",
    text: "Authoritative price history",
    attrs: { id: titleId },
  });
  const description = points.length.toLocaleString("en-US") + " observations for " + identity + ". "
    + "Low " + formatAmount(low, currencyIdentity) + ". High "
    + formatAmount(high, currencyIdentity) + ". Latest "
    + formatAmount(latest, currencyIdentity) + ". Latest tick volume "
    + (latestVolume === null ? "unavailable" : formatNumber(latestVolume)) + ".";

  const svg = svgElement("svg", {
    class: "admin-market-chart__plot",
    viewBox: "0 0 720 250",
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
    "aria-labelledby": `${titleId} ${descriptionId}`,
    focusable: "false",
  });
  svg.append(svgElement("desc", { id: descriptionId }, description));

  for (let index = 0; index <= 4; index += 1) {
    const y = 20 + index * 49;
    svg.append(svgElement("line", {
      class: "admin-market-chart__grid-line",
      x1: 54,
      x2: 700,
      y1: y,
      y2: y,
      "aria-hidden": "true",
    }));
  }

  svg.append(
    svgElement("polyline", {
      class: "admin-market-chart__line",
      points: coordinates.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" "),
      fill: "none",
      "aria-hidden": "true",
    }),
    svgElement("circle", {
      class: "admin-market-chart__latest-point",
      cx: coordinates.at(-1).x.toFixed(2),
      cy: coordinates.at(-1).y.toFixed(2),
      r: 4,
      "aria-hidden": "true",
    }),
    svgElement("text", {
      class: "admin-market-chart__axis-label",
      x: 54,
      y: 242,
      "text-anchor": "start",
      "aria-hidden": "true",
    }, points[0].timeLabel),
    svgElement("text", {
      class: "admin-market-chart__axis-label",
      x: 700,
      y: 242,
      "text-anchor": "end",
      "aria-hidden": "true",
    }, points.at(-1).timeLabel),
  );

  const summary = createElement("dl", {
    className: "admin-market-chart__summary",
    children: [
      summaryMetric("Low", formatAmount(low, currencyIdentity)),
      summaryMetric("High", formatAmount(high, currencyIdentity)),
      summaryMetric("Latest", formatAmount(latest, currencyIdentity)),
      summaryMetric(
        "Latest tick volume",
        latestVolume === null ? "Not available" : formatNumber(latestVolume),
      ),
    ],
  });

  return createElement("figure", {
    className: "admin-market-chart",
    attrs: { "aria-labelledby": titleId },
    children: [title, svg, summary],
  });
}
