// Public World read-value normalization. No ownership or transport decisions.
const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

export function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function safeText(value, maximum = 500) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const normalized = String(value ?? "").trim();
  if (!normalized || UUID_IN_TEXT_PATTERN.test(normalized)) return "";
  return normalized.slice(0, maximum);
}

export function safeToken(value, maximum = 160) {
  return safeText(value, maximum);
}

export function safeInteger(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : fallback;
}

export function safeBoolean(value) {
  return value === true;
}

export function safeTimestamp(value) {
  const normalized = safeText(value, 80);
  return normalized && Number.isFinite(Date.parse(normalized)) ? normalized : "";
}

export function safePublicId(value, pattern) {
  const token = String(value || "").trim().toLowerCase();
  return pattern.test(token) ? token : "";
}

export function safeCurrency(value) {
  const code = safeText(value, 12).toUpperCase();
  return /^[A-Z0-9][A-Z0-9._-]{1,11}$/.test(code) ? code : "";
}

export function safeStringArray(value, maximum = 50) {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(
    value.slice(0, maximum).map((item) => safeText(item, 160)).filter(Boolean),
  );
}
