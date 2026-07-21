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
const PUBLIC_THREAD_ID = /^thr_[0-9a-f]{32}$/;
const PUBLIC_PLAYER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function messageText(value, endpointKey) {
  const text = normalizeString("body", value, endpointKey);
  if (!text) throw invalidPayload(endpointKey, "body");
  return text;
}

export function normalizeWritePayload(endpointKey, raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw invalidPayload(endpointKey, "request");
  if (endpointKey === "storyDeliveryState") {
    const action = normalizeString("action", raw.action, endpointKey).toLowerCase();
    if (!new Set(["seen", "dismissed", "acknowledged"]).has(action)) {
      throw invalidPayload(endpointKey, "action");
    }
    return { action };
  }
  if (endpointKey === "messageSend") {
    return { body: messageText(raw.body, endpointKey) };
  }
  if (endpointKey === "messageRead") {
    const threadId = normalizeString("threadId", raw.threadId, endpointKey).toLowerCase();
    if (!PUBLIC_THREAD_ID.test(threadId)) throw invalidPayload(endpointKey, "threadId");
    return { threadId };
  }
  if (endpointKey === "messageThreadCreate") {
    const recipientPlayerId = normalizeString("recipientPlayerId", raw.recipientPlayerId, endpointKey);
    const title = normalizeString("title", raw.title, endpointKey);
    if (!PUBLIC_PLAYER_ID.test(recipientPlayerId) || UUID.test(recipientPlayerId)) {
      throw invalidPayload(endpointKey, "recipientPlayerId");
    }
    if (!title || title.length > 160) throw invalidPayload(endpointKey, "title");
    return { recipientPlayerId, title, body: messageText(raw.body, endpointKey) };
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
