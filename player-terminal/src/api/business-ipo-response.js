import { ApiRequestError } from "./errors.js";
import { ipoPrice, ipoTotal } from "./business-ipo-backend-routes.js";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;
const REASONS = ["requires_corporation", "business_inactive", "authorized_capacity_required", "national_currency_required", "financial_history_unavailable", "positive_equity_required", "operating_sales_required"];
function invalid() { throw new ApiRequestError("The offering response could not be verified. Refresh before continuing.", { code: "INVALID_RESPONSE", status: 502 }); }
function row(value) { if (!value || typeof value !== "object" || Array.isArray(value) || UUID.test(JSON.stringify(value))) invalid(); return value; }
function text(value, pattern, max = 200) { if (typeof value !== "string" || !value || value.length > max || (pattern && !pattern.test(value))) invalid(); return value; }
function bool(value) { if (typeof value !== "boolean") invalid(); return value; }
function optional(value, parse) { return value === null ? null : parse(value); }
function pick(value, values) { if (!values.includes(value)) invalid(); return value; }
function key(value, prefix) { return text(value, new RegExp(`^${prefix}_[0-9a-f]{32}$`, "u"), 40); }
function whole(value) { return text(value, /^(?:0|[1-9][0-9]{0,18})$/u, 20); }
function amount(value) { return text(value, /^-?(?:0|[1-9][0-9]{0,39})(?:\.[0-9]{1,18})?$/u, 80); }
function integer(value, max) { if (!Number.isSafeInteger(value) || value < 0 || value > max) invalid(); return value; }
function timestamp(value) { const result = text(value, null, 40); if (!Number.isFinite(Date.parse(result))) invalid(); return result; }
function currency(value) { return text(value, /^[A-Z0-9]{3,16}$/u, 16); }
function fundamentals(s, nullable = false) {
  const parse = (v, fn) => nullable ? optional(v, fn) : fn(v);
  return { statementKey: parse(s.statementKey, v => key(v, "bopr")), periodNumber: parse(s.periodNumber, whole), equity: parse(s.equity, amount), revenue: parse(s.revenue, amount), netIncome: parse(s.netIncome, amount) };
}
function ownBusiness(value) {
  const s = row(value); const result = { eligible: bool(s.eligible), reason: optional(s.reason, v => pick(v, REASONS)), canPropose: bool(s.canPropose), businessKey: key(s.businessKey, "biz"), businessName: text(s.businessName), countryCode: text(s.countryCode, null, 32), currencyCode: currency(s.currencyCode), priceDecimalPlaces: integer(s.priceDecimalPlaces, 2), ...fundamentals(s, true) };
  for (const k of ["authorizedShares", "issuedShares", "outstandingShares", "availableShares"]) result[k] = optional(s[k], whole);
  if (result.eligible && (result.reason !== null || result.statementKey === null || result.equity === null || result.availableShares === null || BigInt(result.availableShares) <= 0n)) invalid();
  return result;
}
function offer(value) {
  const s = row(value); const result = { ipoKey: key(s.ipoKey, "bgp"), businessKey: key(s.businessKey, "biz"), businessName: text(s.businessName), status: pick(s.status, ["open", "approved", "rejected", "executed", "cancelled", "expired"]), currencyCode: currency(s.currencyCode), unitPrice: amount(s.unitPrice), ...fundamentals(s), managementPolicy: pick(s.managementPolicy, ["operating_owners_at_first_subscription_v1"]), settlementPolicy: pick(s.settlementPolicy, ["immediate_issuance_listing_after_full_allocation"]), canVote: bool(s.canVote), vote: optional(s.vote, v => pick(v, ["approve", "reject"])), canSubscribe: bool(s.canSubscribe), subscriptionUnavailableReason: optional(s.subscriptionUnavailableReason, v => pick(v, REASONS)), votingExpiresAt: timestamp(s.votingExpiresAt), createdAt: timestamp(s.createdAt) };
  for (const k of ["offeredShares", "issuedShares", "remainingShares", "originalOutstandingShares", "postOfferingOutstandingShares", "newShareBasisPoints", "subscribedShares"]) result[k] = whole(s[k]);
  for (const k of ["approvalThresholdBasisPoints", "approvalBasisPoints", "rejectionBasisPoints"]) result[k] = integer(s[k], 10000);
  if (!ipoPrice(result.unitPrice) || BigInt(result.offeredShares) !== BigInt(result.issuedShares) + BigInt(result.remainingShares) || BigInt(result.postOfferingOutstandingShares) !== BigInt(result.originalOutstandingShares) + BigInt(result.offeredShares)) invalid();
  return result;
}
export function normalizeBusinessIpoResponse(endpointKey, value, intent) {
  const s = row(value); if (s.schemaVersion !== 1) invalid();
  if (endpointKey === "businessIpos") {
    if (s.offerLimit !== 100 || !Array.isArray(s.offers) || s.offers.length > 100) invalid();
    const offers = s.offers.map(offer); if (new Set(offers.map(v => v.ipoKey)).size !== offers.length) invalid();
    return { schemaVersion: 1, offerLimit: 100, truncated: bool(s.truncated), ownBusiness: optional(s.ownBusiness, ownBusiness), offers };
  }
  const operation = { businessIpoPropose: "propose", businessIpoVote: "vote", businessIpoSubscribe: "subscribe" }[endpointKey];
  if (!operation || s.operation !== operation) invalid();
  const result = { schemaVersion: 1, operation, replayed: bool(s.replayed), refreshRequired: s.refreshRequired === true };
  if (operation !== "subscribe") {
    const projected = offer(s.offer);
    if (intent && (operation === "propose" ? canonical(projected.unitPrice) !== canonical(intent.unitPrice) || projected.offeredShares !== intent.offeredShares : projected.ipoKey !== intent.ipoKey || projected.vote !== intent.decision)) invalid();
    return { ...result, offer: projected };
  }
  const r = row(s.receipt); const receipt = { receiptKey: key(r.receiptKey, "bot"), ipoKey: key(r.ipoKey, "bgp"), businessKey: key(r.businessKey, "biz"), shares: whole(r.shares), unitPrice: amount(r.unitPrice), total: amount(r.total), currencyCode: currency(r.currencyCode), createdAt: timestamp(r.createdAt), offeringCompleted: bool(r.offeringCompleted) };
  const total = ipoTotal(receipt.unitPrice, receipt.shares);
  if (total === null || canonical(total) !== canonical(receipt.total)) invalid();
  if (intent && (receipt.ipoKey !== intent.ipoKey || receipt.shares !== intent.shares)) invalid();
  return { ...result, receipt };
}
function canonical(value) { return value.replace(/(\.\d*?)0+$/u, "$1").replace(/\.$/u, ""); }
