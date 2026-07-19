import { ApiRequestError } from "./errors.js";

const NUMBER_RULES = Object.freeze({
  amount: Object.freeze({ min: 0.01, max: 1_000_000_000_000 }),
  durationHours: Object.freeze({ min: 1, max: 8760 }),
  limitPrice: Object.freeze({ min: 0.000001, max: 1_000_000_000_000 }),
  price: Object.freeze({ min: 0.000001, max: 1_000_000_000_000 }),
  quantity: Object.freeze({ min: 1, max: 1_000_000 }),
  unitPrice: Object.freeze({ min: 0.000001, max: 1_000_000_000_000 })
});
const MAX_TEXT = 4000;
const IDENTIFIER_KEY = /(?:Id|Ids)$/;

function invalidPayload(endpointKey, field) {
  return new ApiRequestError(`Enter a valid value for ${field}.`, {
    code: "INVALID_REQUEST",
    endpointKey
  });
}

function normalizeString(key, value, endpointKey) {
  const clean = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (IDENTIFIER_KEY.test(key) && clean.length > 160) throw invalidPayload(endpointKey, key);
  if (key === "submissionUrl" && clean) {
    try {
      const url = new URL(clean);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("unsupported protocol");
      return url.href.slice(0, 2048);
    } catch {
      throw invalidPayload(endpointKey, key);
    }
  }
  return clean.slice(0, IDENTIFIER_KEY.test(key) ? 160 : MAX_TEXT);
}

export function normalizeWritePayload(endpointKey, raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw invalidPayload(endpointKey, "request");
  if (endpointKey === "contractAccept") return {};
  if (endpointKey === "contractSubmit") {
    const payload = {};
    if (raw.submissionUrl !== undefined && raw.submissionUrl !== null && raw.submissionUrl !== "") {
      payload.submissionUrl = normalizeString("submissionUrl", raw.submissionUrl, endpointKey);
    }
    if (raw.note !== undefined && raw.note !== null && raw.note !== "") {
      payload.note = normalizeString("note", raw.note, endpointKey);
    }
    return payload;
  }
  const payload = {};

  for (const [key, value] of Object.entries(raw).slice(0, 80)) {
    if (value === undefined || value === null || value === "") continue;
    const rule = NUMBER_RULES[key];
    if (rule) {
      const number = Number(value);
      if (!Number.isFinite(number) || number < rule.min || number > rule.max) throw invalidPayload(endpointKey, key);
      payload[key] = number;
      continue;
    }
    if (Array.isArray(value)) {
      payload[key] = value.slice(0, 500).map((item) => normalizeString(key, item, endpointKey)).filter(Boolean);
      continue;
    }
    if (typeof value === "string") payload[key] = normalizeString(key, value, endpointKey);
    else if (typeof value === "boolean") payload[key] = value;
  }

  if (endpointKey === "marketOrder") payload.timeInForce = "GTC";
  return payload;
}
