import { PlayerBusinessError } from "../contracts/playerBusinessContracts.ts";

type Row = Record<string, unknown>;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;
const REASONS = ["requires_corporation", "business_inactive", "authorized_capacity_required", "national_currency_required", "financial_history_unavailable", "positive_equity_required", "operating_sales_required"];
function invalid(): never { throw new PlayerBusinessError("business_ipo_response_invalid", "The offering response could not be verified. Refresh before continuing.", 502); }
function row(value: unknown): Row { if (!value || typeof value !== "object" || Array.isArray(value)) invalid(); return value as Row; }
function text(value: unknown, max = 200): string { if (typeof value !== "string" || !value || value.length > max || UUID.test(value)) invalid(); return value; }
function bool(value: unknown): boolean { if (typeof value !== "boolean") invalid(); return value; }
function pick(value: unknown, values: readonly string[]): string { if (typeof value !== "string" || !values.includes(value)) invalid(); return value; }
function optional<T>(value: unknown, parse: (value: unknown) => T): T | null { return value === null ? null : parse(value); }
function key(value: unknown, prefix: string): string { const result = text(value, 40); if (!new RegExp(`^${prefix}_[0-9a-f]{32}$`, "u").test(result)) invalid(); return result; }
function whole(value: unknown): string { const result = text(value, 20); if (!/^(?:0|[1-9][0-9]{0,18})$/u.test(result)) invalid(); return result; }
function amount(value: unknown): string { const result = text(value, 80); if (!/^-?(?:0|[1-9][0-9]{0,39})(?:\.[0-9]{1,18})?$/u.test(result)) invalid(); return result; }
function cents(value: string): bigint {
  if (!/^(?:0|[1-9][0-9]{0,12})(?:\.[0-9]{1,2})?$/u.test(value)) invalid();
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
function integer(value: unknown, max: number): number { if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > max) invalid(); return Number(value); }
function timestamp(value: unknown): string { const result = text(value, 40); if (!Number.isFinite(Date.parse(result))) invalid(); return result; }
function currency(value: unknown): string { const result = text(value, 16); if (!/^[A-Z0-9]{3,16}$/u.test(result)) invalid(); return result; }
function reason(value: unknown): string { return pick(value, REASONS); }
function fundamentals(source: Row): Row {
  return { statementKey: key(source.statementKey, "bopr"), periodNumber: whole(source.periodNumber), equity: amount(source.equity), revenue: amount(source.revenue), netIncome: amount(source.netIncome) };
}
function eligibility(value: unknown): Row {
  const source = row(value);
  const result = {
    eligible: bool(source.eligible), reason: optional(source.reason, reason), canPropose: bool(source.canPropose),
    businessKey: key(source.businessKey, "biz"), businessName: text(source.businessName),
    countryCode: text(source.countryCode, 32), currencyCode: currency(source.currencyCode),
    priceDecimalPlaces: integer(source.priceDecimalPlaces, 2),
    authorizedShares: optional(source.authorizedShares, whole), issuedShares: optional(source.issuedShares, whole),
    outstandingShares: optional(source.outstandingShares, whole), availableShares: optional(source.availableShares, whole),
    statementKey: optional(source.statementKey, (v) => key(v, "bopr")), periodNumber: optional(source.periodNumber, whole),
    equity: optional(source.equity, amount), revenue: optional(source.revenue, amount), netIncome: optional(source.netIncome, amount),
  };
  if (result.eligible && (result.reason !== null || result.availableShares === null || BigInt(result.availableShares) <= 0n || result.equity === null || result.statementKey === null)) invalid();
  return result;
}
export function projectBusinessIpoOffer(value: unknown): Row {
  const s = row(value);
  const offered = whole(s.offeredShares); const issued = whole(s.issuedShares); const remaining = whole(s.remainingShares);
  if (BigInt(offered) < 1n || BigInt(offered) > 1000000n || BigInt(offered) !== BigInt(issued) + BigInt(remaining)) invalid();
  const original = whole(s.originalOutstandingShares), post = whole(s.postOfferingOutstandingShares);
  if (BigInt(post) !== BigInt(original) + BigInt(offered) || whole(s.newShareBasisPoints) !== (BigInt(offered) * 10000n / BigInt(post)).toString()) invalid();
  if (cents(amount(s.unitPrice)) <= 0n || cents(amount(s.unitPrice)) > 100000000n) invalid();
  if ((s.canSubscribe === true && (s.status !== "approved" || BigInt(remaining) === 0n)) || (s.canVote === true && (s.status !== "open" || s.vote !== null))) invalid();
  return {
    ipoKey: key(s.ipoKey, "bgp"), businessKey: key(s.businessKey, "biz"), businessName: text(s.businessName),
    status: pick(s.status, ["open", "approved", "rejected", "executed", "cancelled", "expired"]),
    currencyCode: currency(s.currencyCode), unitPrice: amount(s.unitPrice),
    offeredShares: offered, issuedShares: issued, remainingShares: remaining,
    originalOutstandingShares: whole(s.originalOutstandingShares), postOfferingOutstandingShares: whole(s.postOfferingOutstandingShares),
    newShareBasisPoints: whole(s.newShareBasisPoints), ...fundamentals(s),
    managementPolicy: pick(s.managementPolicy, ["operating_owners_at_first_subscription_v1"]),
    settlementPolicy: pick(s.settlementPolicy, ["immediate_issuance_listing_after_full_allocation"]),
    approvalThresholdBasisPoints: integer(s.approvalThresholdBasisPoints, 10000),
    approvalBasisPoints: integer(s.approvalBasisPoints, 10000), rejectionBasisPoints: integer(s.rejectionBasisPoints, 10000),
    canVote: bool(s.canVote), vote: optional(s.vote, (v) => pick(v, ["approve", "reject"])),
    subscribedShares: whole(s.subscribedShares), canSubscribe: bool(s.canSubscribe),
    subscriptionUnavailableReason: optional(s.subscriptionUnavailableReason, reason),
    votingExpiresAt: timestamp(s.votingExpiresAt), createdAt: timestamp(s.createdAt),
  };
}
export function projectBusinessIpos(value: unknown): Row {
  const s = row(value);
  if (s.schemaVersion !== 1 || s.offerLimit !== 100 || !Array.isArray(s.offers) || s.offers.length > 100) invalid();
  const offers = s.offers.map(projectBusinessIpoOffer);
  if (new Set(offers.map((v) => v.ipoKey)).size !== offers.length) invalid();
  return { schemaVersion: 1, offerLimit: 100, truncated: bool(s.truncated), ownBusiness: optional(s.ownBusiness, eligibility), offers };
}
export function projectBusinessIpoMutation(value: unknown, operation: "propose" | "vote" | "subscribe"): Row {
  const s = row(value);
  if (s.schemaVersion !== 1 || s.operation !== operation) invalid();
  const envelope = { schemaVersion: 1, operation, replayed: bool(s.replayed) };
  if (operation !== "subscribe") return { ...envelope, offer: projectBusinessIpoOffer(s.offer) };
  const r = row(s.receipt);
  const quantity = whole(r.shares), unitPrice = amount(r.unitPrice), total = amount(r.total);
  if (BigInt(quantity) < 1n || BigInt(quantity) > 1000000n || cents(unitPrice) <= 0n || cents(unitPrice) > 100000000n || cents(total) !== cents(unitPrice) * BigInt(quantity)) invalid();
  return { ...envelope, receipt: {
    receiptKey: key(r.receiptKey, "bot"), ipoKey: key(r.ipoKey, "bgp"), businessKey: key(r.businessKey, "biz"),
    shares: whole(r.shares), unitPrice: amount(r.unitPrice), total: amount(r.total),
    currencyCode: currency(r.currencyCode), createdAt: timestamp(r.createdAt), offeringCompleted: bool(r.offeringCompleted),
  } };
}
