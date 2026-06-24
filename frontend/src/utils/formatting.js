window.Econovaria = window.Econovaria || {};
window.Econovaria.utils = window.Econovaria.utils || {};

function normalizeCardId(value) {
  return String(value ?? "")
    .trim()
    .replace(/\.0$/, "");
}

function isBlankDisplayValue(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function isFiniteDisplayNumber(value) {
  if (isBlankDisplayValue(value)) return false;
  const cleaned = String(value).replace(/[$,%]/g, "").trim();
  return Number.isFinite(Number(cleaned));
}

function cleanDisplayNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) return null;

  const cleaned = String(value).replace(/[$,%]/g, "").trim();
  const number = Number(cleaned);

  return Number.isFinite(number) ? number : null;
}

function isCountDisplayKey(key) {
  return /quantity|qty|sharesOwned|shares/i.test(String(key || ""));
}

function formatCountDisplayValue(value) {
  const number = cleanDisplayNumber(value);

  if (number === null) {
    return sanitize(value ?? "—");
  }

  return sanitize(number.toLocaleString());
}

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const cleaned = String(value).replace(/[$,]/g, "").trim();
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function money(value) {
  if (!isFiniteDisplayNumber(value)) return "—";

  const n = Number(String(value).replace(/[$,]/g, "").trim());

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
    lastPurchased: "Last Bought",
    priceDisplay: "Price",
    amountDisplay: "Amount"
  };

  return sanitize(labels[value] || String(value).replace(/([A-Z])/g, " $1").replaceAll("_", " ").trim());
}

function formatValue(key, value) {
  if (value === undefined || value === null || value === "") {
    if (/rewardStatus|status/i.test(key)) {
      return '<span class="badge warn">Pending</span>';
    }

    return "—";
  }

  if (/rewardStatus/i.test(key)) {
    const text = String(value).trim() || "Pending";
    const lower = text.toLowerCase();
    const cls = lower.includes("pending") || lower.includes("unchecked") || lower.includes("not checked")
      ? "warn"
      : lower.includes("success") || lower.includes("paid") || lower.includes("reward") || lower.includes("complete")
        ? "good"
        : lower.includes("denied") || lower.includes("failed")
          ? "bad"
          : "";

    return `<span class="badge ${cls}">${sanitize(text)}</span>`;
  }

  if (/priceDisplay|amountDisplay/i.test(key)) {
    return String(value || "—");
  }

  if (isCountDisplayKey(key)) {
    return formatCountDisplayValue(value);
  }

  if (/timestamp|date|updated|purchased/i.test(key)) {
    return sanitize(formatDateTime(value));
  }

  if (/changePct|accuracy/i.test(key)) {
    return sanitize(formatPercentLike(value));
  }

  if (/rewardAmount/i.test(key)) {
    if (!isFiniteDisplayNumber(value)) return "—";
    return sanitize(money(value));
  }

  if (/amount|balance|price|cost|spent|value|target/i.test(key)) {
    if (!isFiniteDisplayNumber(value)) return "—";
    return sanitize(money(value));
  }

  if (/gainLoss/i.test(key)) {
    if (!isFiniteDisplayNumber(value)) return "—";
    const cls = Number(value) >= 0 ? "positive" : "negative";
    return `<span class="${cls}">${sanitize(money(value))}</span>`;
  }

  if (/status|active/i.test(key)) {
    const text = String(value).trim() || "Pending";
    const lower = text.toLowerCase();
    const cls = lower.includes("success") || lower.includes("active") || lower.includes("complete")
      ? "good"
      : lower.includes("pending")
        ? "warn"
        : lower.includes("denied") || lower.includes("failed")
          ? "bad"
          : "";

    return `<span class="badge ${cls}">${sanitize(text)}</span>`;
  }

  return sanitize(value);
}

function formatMiniValue(label, value) {
  if (isCountDisplayKey(label)) {
    return formatCountDisplayValue(value);
  }

  if (/updated|date|last\s*bought|last\s*purchased|lastBought|lastPurchased/i.test(label)) {
    return sanitize(formatDateTime(value));
  }

  return sanitize(value ?? "");
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

function formatDateObject(date, timeZone) {
  try {
    const options = {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    };

    if (timeZone) {
      options.timeZone = timeZone;
    }

    return new Intl.DateTimeFormat(undefined, options).format(date);
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
  isBlankDisplayValue,
  isFiniteDisplayNumber,
  cleanDisplayNumber,
  isCountDisplayKey,
  formatCountDisplayValue,
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
