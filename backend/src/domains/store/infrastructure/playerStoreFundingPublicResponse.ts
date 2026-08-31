import {
  PLAYER_STORE_FUNDING_ACCOUNT_KEY_PATTERN,
  PLAYER_STORE_FUNDING_QUOTE_KEY_PATTERN,
  PLAYER_STORE_FUNDING_RECEIPT_KEY_PATTERN,
  type PlayerStoreFundingQuoteDto,
  type PlayerStoreFundingQuoteLineDto,
  type PlayerStoreFundingReceiptDto,
  type PlayerStoreFundingReceiptLineDto,
  type PlayerStoreSeededFundingQuoteDto,
  type PlayerStoreSeededFundingReceiptDto,
} from "../contracts/playerStoreFundingPublicContracts.ts";
import {
  PLAYER_STORE_ITEM_KEY_PATTERN,
  PLAYER_STORE_QUOTE_KEY_PATTERN,
  PLAYER_STORE_RECEIPT_KEY_PATTERN,
  PlayerStorePublicError,
} from "../contracts/playerStorePublicContracts.ts";

const UUID_ANY =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu;
const FIXING_KEY = /^fxf_[0-9a-f]{32}$/u;
const BANK_TRANSACTION_KEY = /^btx_[0-9a-f]{32}$/u;
const INVENTORY_TRANSACTION_KEY = /^itx_[0-9a-f]{32}$/u;
const SHA256_DIGEST = /^[0-9a-f]{64}$/u;
const OFFER_KEY = /^sof_[0-9a-f]{32}$/u;
const PARTY_KEY = /^pty_[0-9a-f]{32}$/u;
const CURRENCY_CODE = /^[A-Z0-9_]{3,16}$/u;

export type StoreFundingReceiptAction =
  | "system_offer_purchase_funding"
  | "business_offer_purchase_funding";

export function parseSeededQuote(
  value: unknown,
): PlayerStoreSeededFundingQuoteDto {
  const row = publicRecord(value);
  const sellerKind = systemSellerKind(row.sellerKind);
  const quoteKey = publicKey(row.quoteKey, PLAYER_STORE_QUOTE_KEY_PATTERN);
  const currencyCode = currency(row.currencyCode);
  const finalTotalPrice = finiteNumber(row.finalTotalPrice, 0);
  const fundingQuote = parseFundingQuote(row.fundingQuote);
  assertFundingBinding(
    fundingQuote,
    "store.system-offer",
    quoteKey,
    currencyCode,
    finalTotalPrice,
  );
  return Object.freeze({
    quoteKey,
    quoteStatus: quoteStatus(row.quoteStatus),
    itemKey: publicKey(row.itemKey, PLAYER_STORE_ITEM_KEY_PATTERN),
    itemName: publicText(row.itemName),
    quantity: boundedInteger(row.quantity, 1),
    baseUnitPrice: finiteNumber(row.baseUnitPrice, 0),
    inflationMultiplier: finiteNumber(row.inflationMultiplier, 0),
    locationMultiplier: finiteNumber(row.locationMultiplier, 0),
    scarcityMultiplier: finiteNumber(row.scarcityMultiplier, 0),
    discountAmount: finiteNumber(row.discountAmount, 0),
    finalUnitPrice: finiteNumber(row.finalUnitPrice, 0),
    finalTotalPrice,
    currencyCode,
    itemCurrencyCode: currency(row.itemCurrencyCode),
    playerCurrencyCode: currency(row.playerCurrencyCode),
    exchangeRate: finiteNumber(row.exchangeRate, 0),
    itemLocalFinalUnitPrice: finiteNumber(row.itemLocalFinalUnitPrice, 0),
    itemLocalFinalTotalPrice: finiteNumber(row.itemLocalFinalTotalPrice, 0),
    expiresAt: isoTimestamp(row.expiresAt),
    pricingVersion: publicText(row.pricingVersion),
    replayed: booleanValue(row.replayed),
    offerKey: publicKey(row.offerKey, OFFER_KEY),
    offerVersion: boundedInteger(row.offerVersion, 1),
    sellerKind,
    sellerPartyKey: publicKey(row.sellerPartyKey, PARTY_KEY),
    sellerName: publicText(row.sellerName),
    availableQuantityAtQuote: boundedInteger(
      row.availableQuantityAtQuote,
      1,
    ),
    contextDigest: publicKey(row.contextDigest, SHA256_DIGEST),
    fundingQuote,
  });
}

export function parseSeededReceipt(
  value: unknown,
): PlayerStoreSeededFundingReceiptDto {
  const row = publicRecord(value);
  const sellerKind = systemSellerKind(row.sellerKind);
  const quoteKey = publicKey(row.quoteKey, PLAYER_STORE_QUOTE_KEY_PATTERN);
  const currencyCode = currency(row.currencyCode);
  const finalTotalPrice = finiteNumber(row.finalTotalPrice, 0);
  const fundingReceipt = parseFundingReceipt(
    row.fundingReceipt,
    "system_offer_purchase_funding",
  );
  assertFundingBinding(
    fundingReceipt,
    "store.system-offer",
    quoteKey,
    currencyCode,
    finalTotalPrice,
  );
  const offerVersionBefore = boundedInteger(row.offerVersionBefore, 1);
  const offerVersionAfter = boundedInteger(row.offerVersionAfter, 1);
  if (
    (sellerKind === "seeded" && offerVersionAfter !== offerVersionBefore) ||
    (sellerKind === "npc" && offerVersionAfter !== offerVersionBefore + 1)
  ) throw invalidPublicResponse();
  return Object.freeze({
    receiptKey: publicKey(row.receiptKey, PLAYER_STORE_RECEIPT_KEY_PATTERN),
    quoteKey,
    itemKey: publicKey(row.itemKey, PLAYER_STORE_ITEM_KEY_PATTERN),
    itemName: publicText(row.itemName),
    quantity: boundedInteger(row.quantity, 1),
    finalUnitPrice: finiteNumber(row.finalUnitPrice, 0),
    finalTotalPrice,
    currencyCode,
    inventoryQuantityOwned: boundedInteger(row.inventoryQuantityOwned, 0),
    offerKey: publicKey(row.offerKey, OFFER_KEY),
    sellerKind,
    sellerPartyKey: publicKey(row.sellerPartyKey, PARTY_KEY),
    sellerName: publicText(row.sellerName),
    offerVersionBefore,
    offerVersionAfter,
    remainingSellerQuantity: boundedInteger(row.remainingSellerQuantity, 0),
    sellerProceeds: finiteNumber(row.sellerProceeds, 0),
    inventoryTransactionKey: publicKey(
      row.inventoryTransactionKey,
      INVENTORY_TRANSACTION_KEY,
    ),
    completedAt: isoTimestamp(row.completedAt),
    alreadyCompleted: booleanValue(row.alreadyCompleted),
    contextDigest: publicKey(row.contextDigest, SHA256_DIGEST),
    fundingReceipt,
  });
}

export function assertFundingBinding(
  evidence: Pick<
    PlayerStoreFundingQuoteDto | PlayerStoreFundingReceiptDto,
    | "fundingContextKind"
    | "fundingContextKey"
    | "targetCurrencyCode"
    | "targetAmount"
  >,
  expectedContextKind: "store.system-offer" | "store.business-offer",
  expectedContextKey: string,
  expectedCurrencyCode: string,
  expectedAmount: number,
): void {
  if (
    evidence.fundingContextKind !== expectedContextKind ||
    evidence.fundingContextKey !== expectedContextKey ||
    evidence.targetCurrencyCode !== expectedCurrencyCode ||
    Number(evidence.targetAmount) !== expectedAmount
  ) {
    throw invalidPublicResponse();
  }
}

export function parseFundingQuote(value: unknown): PlayerStoreFundingQuoteDto {
  const row = publicRecord(value);
  const lines = publicArray(row.lines).map(parseFundingQuoteLine);
  if (lines.length < 1 || lines.length > 3) throw invalidPublicResponse();
  const quote = Object.freeze({
    quoteKey: publicKey(
      row.quote_key,
      PLAYER_STORE_FUNDING_QUOTE_KEY_PATTERN,
    ),
    fundingContextKind: publicText(row.funding_context_kind),
    fundingContextKey: publicContextKey(row.funding_context_key),
    targetCurrencyCode: currency(row.target_currency_code),
    targetMinorUnit: boundedInteger(row.target_minor_unit, 0, 18),
    targetAmount: positiveDecimal(row.target_amount),
    fixingKey: publicKey(row.fixing_key, FIXING_KEY),
    policyVersion: publicText(row.policy_version),
    requiresFx: booleanValue(row.requires_fx),
    expiresAt: isoTimestamp(row.expires_at),
    lines: Object.freeze(lines),
  });
  assertFundingLineInvariants(
    quote.lines,
    quote.targetCurrencyCode,
    quote.targetMinorUnit,
    quote.targetAmount,
  );
  if (quote.requiresFx !== quote.lines.some((line) => line.requiresFx)) {
    throw invalidPublicResponse();
  }
  return quote;
}

function parseFundingQuoteLine(value: unknown): PlayerStoreFundingQuoteLineDto {
  const row = publicRecord(value);
  return Object.freeze({
    lineNumber: boundedInteger(row.line_number, 1, 3),
    sourceAccountKey: publicKey(
      row.source_account_key,
      PLAYER_STORE_FUNDING_ACCOUNT_KEY_PATTERN,
    ),
    sourceCurrencyCode: currency(row.source_currency_code),
    sourceMinorUnit: boundedInteger(row.source_minor_unit, 0, 18),
    targetCurrencyCode: currency(row.target_currency_code),
    targetMinorUnit: boundedInteger(row.target_minor_unit, 0, 18),
    postedAmount: decimal(row.posted_amount),
    heldAmount: nonNegativeDecimal(row.held_amount),
    availableAmount: decimal(row.available_amount),
    targetContribution: positiveDecimal(row.target_contribution),
    sourceDebit: positiveDecimal(row.source_debit),
    referenceRate: positiveDecimal(row.reference_rate),
    customerRate: positiveDecimal(row.customer_rate),
    effectiveRate: positiveDecimal(row.effective_rate),
    spreadRate: nonNegativeDecimal(row.spread_rate),
    requiresFx: booleanValue(row.requires_fx),
    roundingDisclosure: publicText(row.rounding_disclosure),
  });
}

export function parseFundingReceipt(
  value: unknown,
  expectedSourceAction: StoreFundingReceiptAction,
): PlayerStoreFundingReceiptDto {
  const row = publicRecord(value);
  const lines = publicArray(row.lines).map(parseFundingReceiptLine);
  if (lines.length < 1 || lines.length > 3) throw invalidPublicResponse();
  const receipt = Object.freeze({
    receiptKey: publicKey(
      row.receipt_key,
      PLAYER_STORE_FUNDING_RECEIPT_KEY_PATTERN,
    ),
    quoteKey: publicKey(
      row.quote_key,
      PLAYER_STORE_FUNDING_QUOTE_KEY_PATTERN,
    ),
    bankTransactionKey: publicKey(
      row.bank_transaction_key,
      BANK_TRANSACTION_KEY,
    ),
    targetAccountKey: publicKey(
      row.target_account_key,
      PLAYER_STORE_FUNDING_ACCOUNT_KEY_PATTERN,
    ),
    fundingContextKind: publicText(row.funding_context_kind),
    fundingContextKey: publicContextKey(row.funding_context_key),
    targetCurrencyCode: currency(row.target_currency_code),
    targetMinorUnit: boundedInteger(row.target_minor_unit, 0, 18),
    targetAmount: positiveDecimal(row.target_amount),
    targetReserveDrawAmount: nonNegativeDecimal(
      row.target_reserve_draw_amount,
    ),
    sourceDomain: publicText(row.source_domain),
    sourceAction: publicText(row.source_action),
    createdAt: isoTimestamp(row.created_at),
    lines: Object.freeze(lines),
  });
  assertFundingLineInvariants(
    receipt.lines,
    receipt.targetCurrencyCode,
    receipt.targetMinorUnit,
    receipt.targetAmount,
  );
  if (
    receipt.sourceDomain !== "store" ||
    receipt.sourceAction !== expectedSourceAction
  ) {
    throw invalidPublicResponse();
  }
  return receipt;
}

function parseFundingReceiptLine(
  value: unknown,
): PlayerStoreFundingReceiptLineDto {
  const row = publicRecord(value);
  return Object.freeze({
    lineNumber: boundedInteger(row.line_number, 1, 3),
    sourceAccountKey: publicKey(
      row.source_account_key,
      PLAYER_STORE_FUNDING_ACCOUNT_KEY_PATTERN,
    ),
    sourceCurrencyCode: currency(row.source_currency_code),
    sourceMinorUnit: boundedInteger(row.source_minor_unit, 0, 18),
    targetCurrencyCode: currency(row.target_currency_code),
    targetMinorUnit: boundedInteger(row.target_minor_unit, 0, 18),
    targetContribution: positiveDecimal(row.target_contribution),
    sourceDebit: positiveDecimal(row.source_debit),
    referenceRate: positiveDecimal(row.reference_rate),
    customerRate: positiveDecimal(row.customer_rate),
    effectiveRate: positiveDecimal(row.effective_rate),
    spreadRate: nonNegativeDecimal(row.spread_rate),
    requiresFx: booleanValue(row.requires_fx),
  });
}

interface FundingInvariantLine {
  readonly lineNumber: number;
  readonly sourceAccountKey: string;
  readonly sourceCurrencyCode: string;
  readonly targetCurrencyCode: string;
  readonly targetMinorUnit: number;
  readonly targetContribution: string;
  readonly requiresFx: boolean;
}

function assertFundingLineInvariants(
  lines: readonly FundingInvariantLine[],
  targetCurrencyCode: string,
  targetMinorUnit: number,
  targetAmount: string,
): void {
  const sourceAccounts = new Set<string>();
  let contributionUnits = 0n;
  for (const [index, line] of lines.entries()) {
    if (
      line.lineNumber !== index + 1 ||
      sourceAccounts.has(line.sourceAccountKey) ||
      line.targetCurrencyCode !== targetCurrencyCode ||
      line.targetMinorUnit !== targetMinorUnit ||
      line.requiresFx !== (line.sourceCurrencyCode !== targetCurrencyCode)
    ) {
      throw invalidPublicResponse();
    }
    sourceAccounts.add(line.sourceAccountKey);
    contributionUnits += decimalUnits(line.targetContribution, targetMinorUnit);
  }
  if (contributionUnits !== decimalUnits(targetAmount, targetMinorUnit)) {
    throw invalidPublicResponse();
  }
}

function decimalUnits(value: string, minorUnit: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  const discarded = fraction.slice(minorUnit);
  if (discarded && /[1-9]/u.test(discarded)) throw invalidPublicResponse();
  const paddedFraction = fraction.slice(0, minorUnit).padEnd(minorUnit, "0");
  return BigInt(`${whole}${paddedFraction}`);
}

export function publicRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidPublicResponse();
  }
  if (UUID_ANY.test(JSON.stringify(value))) throw invalidPublicResponse();
  return value as Record<string, unknown>;
}

function publicArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw invalidPublicResponse();
  return value;
}

function publicText(value: unknown): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate || candidate.length > 400 || UUID_ANY.test(candidate)) {
    throw invalidPublicResponse();
  }
  return candidate;
}

function publicContextKey(value: unknown): string {
  const candidate = publicText(value);
  if (candidate.length > 240) throw invalidPublicResponse();
  return candidate;
}

function publicKey(value: unknown, pattern: RegExp): string {
  const candidate = publicText(value);
  if (!pattern.test(candidate)) throw invalidPublicResponse();
  return candidate;
}

function currency(value: unknown): string {
  return publicKey(value, CURRENCY_CODE);
}

function finiteNumber(
  value: unknown,
  minimum = Number.NEGATIVE_INFINITY,
): number {
  const candidate = typeof value === "number"
    ? value
    : typeof value === "string" && /^-?[0-9]+(?:\.[0-9]+)?$/u.test(value)
    ? Number(value)
    : Number.NaN;
  if (
    !Number.isFinite(candidate) || candidate < minimum ||
    Math.abs(candidate) >= 1_000_000_000_000_000
  ) {
    throw invalidPublicResponse();
  }
  return candidate;
}

function decimal(value: unknown): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (
    !/^-?(?:0|[1-9][0-9]{0,39})(?:\.[0-9]{1,38})?$/u.test(candidate) ||
    candidate.length > 80
  ) {
    throw invalidPublicResponse();
  }
  const negative = candidate.startsWith("-");
  const [whole, fraction = ""] = (negative ? candidate.slice(1) : candidate)
    .split(".");
  const canonicalFraction = fraction.replace(/0+$/u, "");
  const canonicalWhole = String(BigInt(whole));
  const sign = negative && (canonicalWhole !== "0" || canonicalFraction)
    ? "-"
    : "";
  return canonicalFraction
    ? `${sign}${canonicalWhole}.${canonicalFraction}`
    : `${sign}${canonicalWhole}`;
}

function nonNegativeDecimal(value: unknown): string {
  const candidate = decimal(value);
  if (candidate.startsWith("-")) throw invalidPublicResponse();
  return candidate;
}

function positiveDecimal(value: unknown): string {
  const candidate = nonNegativeDecimal(value);
  if (!/[1-9]/u.test(candidate)) throw invalidPublicResponse();
  return candidate;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const candidate = Number(value);
  if (
    !Number.isSafeInteger(candidate) || candidate < minimum ||
    candidate > maximum
  ) {
    throw invalidPublicResponse();
  }
  return candidate;
}

function booleanValue(value: unknown): boolean {
  if (typeof value !== "boolean") throw invalidPublicResponse();
  return value;
}

function isoTimestamp(value: unknown): string {
  const candidate = publicText(value);
  if (!Number.isFinite(Date.parse(candidate))) throw invalidPublicResponse();
  return new Date(candidate).toISOString();
}

function quoteStatus(
  value: unknown,
): "created" | "used" | "expired" | "cancelled" {
  const candidate = publicText(value).toLowerCase();
  if (
    candidate !== "created" && candidate !== "used" &&
    candidate !== "expired" && candidate !== "cancelled"
  ) {
    throw invalidPublicResponse();
  }
  return candidate;
}

function systemSellerKind(value: unknown): "seeded" | "npc" {
  if (value === "seeded" || value === "npc") return value;
  throw invalidPublicResponse();
}

export function invalidPublicResponse(): PlayerStorePublicError {
  return new PlayerStorePublicError(
    "player_store_funding_response_invalid",
    "Store funding returned an invalid public response.",
    500,
    false,
  );
}
