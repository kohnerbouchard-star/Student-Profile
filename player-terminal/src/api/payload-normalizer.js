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
const PUBLIC_LOCATION_ID = /^loc_[a-z0-9_]+$/;
const PUBLIC_QUOTE_ID = /^trq_[0-9a-f]{32}$/;
const PUBLIC_JOURNEY_ID = /^trj_[0-9a-f]{32}$/;
const COUNTRY_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const TOKEN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const TRAVEL_MODES = new Set(["land", "sea", "air", "meridian"]);

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

function requirePattern(value, pattern, endpointKey, field) {
  const clean = normalizeString(field, value, endpointKey).toLowerCase();
  if (!pattern.test(clean)) throw invalidPayload(endpointKey, field);
  return clean;
}

function normalizeArrivalAnswers(raw, endpointKey) {
  if (!Array.isArray(raw) || raw.length < 6 || raw.length > 8) {
    throw invalidPayload(endpointKey, "answers");
  }
  const questionIds = new Set();
  return raw.map((answer) => {
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
      throw invalidPayload(endpointKey, "answers");
    }
    const questionId = requirePattern(answer.questionId, TOKEN, endpointKey, "questionId");
    const optionId = requirePattern(answer.optionId, TOKEN, endpointKey, "optionId");
    if (questionIds.has(questionId)) throw invalidPayload(endpointKey, "answers");
    questionIds.add(questionId);
    return Object.freeze({ questionId, optionId });
  });
}

export function normalizeWritePayload(endpointKey, raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw invalidPayload(endpointKey, "request");
  if (endpointKey === "arrivalClass") {
    return { answers: normalizeArrivalAnswers(raw.answers, endpointKey) };
  }
  if (endpointKey === "travelQuote") {
    const allowedModes = Array.isArray(raw.allowedModes)
      ? [...new Set(raw.allowedModes.map((mode) => String(mode).trim().toLowerCase()))]
      : [];
    if (!allowedModes.length || allowedModes.length > 4 || allowedModes.some((mode) => !TRAVEL_MODES.has(mode))) {
      throw invalidPayload(endpointKey, "allowedModes");
    }
    return {
      toLocationId: requirePattern(raw.toLocationId, PUBLIC_LOCATION_ID, endpointKey, "toLocationId"),
      allowedModes
    };
  }
  if (endpointKey === "travelExecute") {
    return { quoteId: requirePattern(raw.quoteId, PUBLIC_QUOTE_ID, endpointKey, "quoteId") };
  }
  if (endpointKey === "travelComplete") {
    return { journeyId: requirePattern(raw.journeyId, PUBLIC_JOURNEY_ID, endpointKey, "journeyId") };
  }
  if (endpointKey === "residencyRequest") {
    const expectedRevision = Number(raw.expectedRevision);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw invalidPayload(endpointKey, "expectedRevision");
    }
    return {
      countryId: requirePattern(raw.countryId, COUNTRY_ID, endpointKey, "countryId"),
      expectedRevision
    };
  }
  if (endpointKey === "storyDeliveryState") {
    const action = normalizeString("action", raw.action, endpointKey).toLowerCase();
    if (!new Set(["seen", "dismissed", "acknowledged"]).has(action)) {
      throw invalidPayload(endpointKey, "action");
    }
    return { action };
  }
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
