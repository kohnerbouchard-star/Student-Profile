import { ApiRequestError } from "../../api/errors.js";

const PUBLIC_KEYS = Object.freeze({
  account: /^bac_[0-9a-f]{32}$/u,
  bankTransaction: /^btx_[0-9a-f]{32}$/u,
  business: /^biz_[0-9a-f]{32}$/u,
  businessQuote: /^bsq_[0-9a-f]{32}$/u,
  businessReceipt: /^bsr_[0-9a-f]{32}$/u,
  fixing: /^fxf_[0-9a-f]{32}$/u,
  fundingQuote: /^pfq_[0-9a-f]{32}$/u,
  fundingReceipt: /^pfr_[0-9a-f]{32}$/u,
  order: /^fxo_[0-9a-f]{32}$/u,
  quote: /^fxq_[0-9a-f]{32}$/u,
  receipt: /^fxr_[0-9a-f]{32}$/u,
});
const CURRENCY_CODE = /^[A-Z0-9_]{3,16}$/u;
const COUNTRY_CODE = /^[A-Z][A-Z0-9_]{2,31}$/u;
const DECIMAL = /^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/u;
const ITEM_KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const SAFE_TOKEN = /^[a-z][a-z0-9_]{0,63}$/u;
const FUNDING_TOKEN = /^[a-z0-9][a-z0-9._:-]{0,119}$/u;
const INTERNAL_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu;
const PRODUCTS = new Set(["standard", "instant"]);

export function invalid(endpointKey, fieldName) {
  throw new ApiRequestError(
    "Business treasury returned incomplete data and could not be displayed safely.",
    { code: "INVALID_RESPONSE", endpointKey, body: { fieldName } },
  );
}

export function object(value, endpointKey, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(endpointKey, fieldName);
  }
  return value;
}

export function list(value, endpointKey, fieldName) {
  if (!Array.isArray(value)) invalid(endpointKey, fieldName);
  return value;
}

export function exactFields(value, fields, endpointKey, fieldName) {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) invalid(endpointKey, fieldName);
}

export function assertPublic(value, endpointKey) {
  if (INTERNAL_UUID.test(JSON.stringify(value))) invalid(endpointKey, "publicIdentity");
}

export function text(value, endpointKey, fieldName, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > 500 || INTERNAL_UUID.test(result)) {
    invalid(endpointKey, fieldName);
  }
  return result;
}

export function publicKey(value, kind, endpointKey, fieldName, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  const result = text(value, endpointKey, fieldName).toLowerCase();
  if (!PUBLIC_KEYS[kind].test(result)) invalid(endpointKey, fieldName);
  return result;
}

export function currencyCode(value, endpointKey, fieldName = "currencyCode") {
  const result = text(value, endpointKey, fieldName).toUpperCase();
  if (!CURRENCY_CODE.test(result)) invalid(endpointKey, fieldName);
  return result;
}

export function precision(value, endpointKey, fieldName = "precision") {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0 || result > 18) {
    invalid(endpointKey, fieldName);
  }
  return result;
}

export function decimal(value, endpointKey, fieldName, { positive = false } = {}) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!DECIMAL.test(result) || (positive && !/[1-9]/u.test(result))) {
    invalid(endpointKey, fieldName);
  }
  return result;
}

export function decimalPlaces(value) {
  return String(value).split(".")[1]?.length || 0;
}

export function scaledInteger(value, scale) {
  const [whole, fraction = ""] = String(value).split(".");
  return BigInt(`${whole}${fraction.padEnd(scale, "0")}`);
}

export function decimalsEqual(left, right) {
  const scale = Math.max(decimalPlaces(left), decimalPlaces(right));
  return scaledInteger(left, scale) === scaledInteger(right, scale);
}

export function timestamp(value, endpointKey, fieldName, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  const result = text(value, endpointKey, fieldName);
  const parsed = Date.parse(result);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== result) {
    invalid(endpointKey, fieldName);
  }
  return result;
}

export function token(value, endpointKey, fieldName) {
  const result = text(value, endpointKey, fieldName).toLowerCase();
  if (!SAFE_TOKEN.test(result)) invalid(endpointKey, fieldName);
  return result;
}

export function fundingToken(value, endpointKey, fieldName) {
  const result = text(value, endpointKey, fieldName).toLowerCase();
  if (!FUNDING_TOKEN.test(result)) invalid(endpointKey, fieldName);
  return result;
}

export function boolean(value, endpointKey, fieldName) {
  if (typeof value !== "boolean") invalid(endpointKey, fieldName);
  return value;
}

export function integer(value, endpointKey, fieldName, minimum, maximum) {
  if (
    typeof value !== "number" || !Number.isSafeInteger(value) ||
    value < minimum || value > maximum
  ) invalid(endpointKey, fieldName);
  return value;
}

export function assertTransportNumber(value, endpointKey, fieldName, { positive = false } = {}) {
  if (
    typeof value !== "number" || !Number.isFinite(value) ||
    value < 0 || (positive && value <= 0) || Math.abs(value) >= 1e15
  ) invalid(endpointKey, fieldName);
}

export function finiteQuantity(value, endpointKey, fieldName) {
  if (
    typeof value !== "number" || !Number.isFinite(value) ||
    value < 0 || Math.abs(value) >= 1e15
  ) invalid(endpointKey, fieldName);
  return value;
}

export function storeItemKey(value, endpointKey) {
  const result = text(value, endpointKey, "itemKey").toLowerCase();
  if (!ITEM_KEY.test(result)) invalid(endpointKey, "itemKey");
  return result;
}

export function countryCode(value, endpointKey) {
  const result = text(value, endpointKey, "countryCode").toUpperCase();
  if (!COUNTRY_CODE.test(result)) invalid(endpointKey, "countryCode");
  return result;
}

export function product(value, endpointKey) {
  const result = token(value, endpointKey, "product");
  if (!PRODUCTS.has(result)) invalid(endpointKey, "product");
  return result;
}

export function money(value, endpointKey, fieldName) {
  const row = object(value, endpointKey, fieldName);
  exactFields(row, ["amount", "currencyCode", "precision"], endpointKey, fieldName);
  const result = Object.freeze({
    amount: decimal(row.amount, endpointKey, `${fieldName}.amount`),
    currencyCode: currencyCode(row.currencyCode, endpointKey, `${fieldName}.currencyCode`),
    precision: precision(row.precision, endpointKey, `${fieldName}.precision`),
  });
  if (decimalPlaces(result.amount) > result.precision) {
    invalid(endpointKey, `${fieldName}.amount`);
  }
  return result;
}

export function operationBody(value, endpointKey) {
  const row = object(value, endpointKey, "response");
  assertPublic(row, endpointKey);
  return row;
}

export function mutationEnvelope(value, endpointKey, fieldName, parser) {
  const row = operationBody(value, endpointKey);
  exactFields(
    row,
    ["ok", "outcome", fieldName, "refreshRequired"],
    endpointKey,
    "response",
  );
  if (
    row.ok !== true ||
    !new Set(["applied", "replayed"]).has(row.outcome) ||
    typeof row.refreshRequired !== "boolean"
  ) {
    invalid(endpointKey, "outcome");
  }
  return Object.freeze({
    outcome: row.outcome,
    refreshRequired: row.refreshRequired,
    [fieldName]: parser(row[fieldName], endpointKey),
  });
}
