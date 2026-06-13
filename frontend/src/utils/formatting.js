window.Econovaria = window.Econovaria || {};
window.Econovaria.utils = window.Econovaria.utils || {};

function normalizeCardId(value) {
  return String(value ?? "")
    .trim()
    .replace(/\.0$/, "");
}

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const cleaned = String(value).replace(/[$,]/g, "").trim();
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function money(value) {
  const n = Number(value || 0);
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD"
  });
}

function sanitize(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function sum(rows, key) {
  return (rows || []).reduce((total, row) => total + Number(row[key] || 0), 0);
}

function labelize(value) {
  const labels = {
    timestamp: "Time",
    mode: "Activity",
    amount: "Amount",
    endingBalance: "Balance After",
    itemName: "Item",
    itemId: "Ticker / Item",
    status: "Status",
    currentPrice: "Price",
    changePct: "Change",
    assetType: "Type",
    sharesOwned: "Shares",
    avgBuyPrice: "Avg. Buy",
    marketValue: "Value",
    gainLoss: "Gain / Loss",
    targetPrice: "Target",
    rewardStatus: "Result",
    rewardAmount: "Reward",
    lastUpdated: "Updated",
    lastPurchased: "Last Bought"
  };

  return sanitize(labels[value] || String(value).replace(/([A-Z])/g, " $1").replaceAll("_", " ").trim());
}

function formatValue(key, value) {
  if (value === undefined || value === null || value === "") return "";

  if (/quantity/i.test(key)) {
    const n = toNumber(value);
    return sanitize(Number.isFinite(n) ? n.toLocaleString() : value);
  }

  if (/timestamp|date|updated|purchased/i.test(key)) {
    return sanitize(formatDateTime(value));
  }

  if (/changePct|accuracy/i.test(key)) {
    return sanitize(formatPercentLike(value));
  }

  if (/amount|balance|price|cost|spent|value|reward|target/i.test(key)) {
    return sanitize(money(value));
  }

  if (/gainLoss/i.test(key)) {
    const cls = Number(value) >= 0 ? "positive" : "negative";
    return `<span class="${cls}">${sanitize(money(value))}</span>`;
  }

  if (/status|active/i.test(key)) {
    const text = String(value);
    const cls = text.toLowerCase().includes("success") || text.toLowerCase().includes("active") || text.toLowerCase().includes("pending")
      ? "good"
      : "";
    return `<span class="badge ${cls}">${sanitize(value)}</span>`;
  }

  return sanitize(value);
}

function formatMiniValue(label, value) {
  if (/updated|date|last\s*bought|last\s*purchased|lastBought|lastPurchased/i.test(label)) {
    return formatDateTime(value);
  }
  return value ?? "";
}

function formatPercentLike(value) {
  if (value === undefined || value === null || value === "") return "—";

  const number = Number(String(value).replace("%", ""));
  if (!Number.isFinite(number)) return String(value);

  if (String(value).includes("%")) return `${number.toFixed(2)}%`;
  if (Math.abs(number) <= 1) return `${(number * 100).toFixed(2)}%`;
  return `${number.toFixed(2)}%`;
}

function formatDateTime(value) {
  if (!value) return "—";

  if (value instanceof Date) {
    return formatDateObject(value);
  }

  const text = String(value).trim();
  if (!text) return "—";

  const parsed = parseDateValue(text);
  if (!parsed) return text;

  return formatDateObject(new Date(parsed));
}

function parseDateValue(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();

  const text = String(value).trim();
  if (!text) return 0;

  const normalized = text
    .replace(/\./g, "-")
    .replace(" ", "T");

  const direct = Date.parse(normalized);
  if (!Number.isNaN(direct)) return direct;

  const fallback = Date.parse(text);
  if (!Number.isNaN(fallback)) return fallback;

  return 0;
}

function formatDateObject(date) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  } catch (_) {
    return date.toLocaleString();
  }
}

function cleanErrorMessage(message) {
  const text = String(message || "Something went wrong. Try again.");

  if (/unauthorized|secret|api|script|worker|backend|server|origin/i.test(text)) {
    return "The dashboard could not confirm your request. Please refresh and try again.";
  }

  return text;
}

Object.assign(window.Econovaria.utils, {
  normalizeCardId,
  toNumber,
  money,
  sanitize,
  sum,
  labelize,
  formatValue,
  formatMiniValue,
  formatPercentLike,
  formatDateTime,
  parseDateValue,
  formatDateObject,
  cleanErrorMessage
});
