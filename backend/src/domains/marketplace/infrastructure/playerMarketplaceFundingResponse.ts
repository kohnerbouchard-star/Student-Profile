import {
  MARKETPLACE_FUNDING_ACCOUNT_KEY_PATTERN,
  MARKETPLACE_FUNDING_BANK_TRANSACTION_KEY_PATTERN,
  MARKETPLACE_FUNDING_ORDER_KEY_PATTERN,
  MARKETPLACE_FUNDING_QUOTE_KEY_PATTERN,
  MARKETPLACE_FUNDING_RECEIPT_KEY_PATTERN,
  MARKETPLACE_FUNDING_RESERVATION_KEY_PATTERN,
  type PlayerMarketplaceFundedOrderDto,
  type PlayerMarketplaceFundedReservationDto,
  type PlayerMarketplaceFundingQuoteDto,
  type PlayerMarketplaceFundingQuoteLineDto,
  type PlayerMarketplaceFundingReceiptDto,
  type PlayerMarketplaceFundingReceiptLineDto,
} from "../contracts/playerMarketplaceFundingContracts.ts";
import {
  MARKETPLACE_ITEM_KEY_PATTERN,
  MARKETPLACE_LISTING_KEY_PATTERN,
  PlayerMarketplaceError,
  PlayerMarketplacePersistenceError,
} from "../contracts/playerMarketplaceContracts.ts";

const UUID_ANY =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu;
const FIXING_KEY = /^fxf_[0-9a-f]{32}$/u;
const CURRENCY_CODE = /^[A-Z0-9_]{3,16}$/u;

export interface MarketplaceFundingRpcError {
  readonly message?: string;
  readonly code?: string;
}

export function parseMarketplaceFundingQuote(
  value: unknown,
): PlayerMarketplaceFundedReservationDto {
  const row = publicRecord(value);
  return Object.freeze({
    reservationKey: publicKey(
      row.reservationKey,
      MARKETPLACE_FUNDING_RESERVATION_KEY_PATTERN,
    ),
    listingKey: publicKey(row.listingKey, MARKETPLACE_LISTING_KEY_PATTERN),
    itemKey: publicKey(row.itemKey, MARKETPLACE_ITEM_KEY_PATTERN),
    quantity: boundedInteger(row.quantity, 1),
    unitPrice: finiteNumber(row.unitPrice, 0),
    subtotal: finiteNumber(row.subtotal, 0),
    feeRate: finiteNumber(row.feeRate, 0),
    taxRate: finiteNumber(row.taxRate, 0),
    feeAmount: finiteNumber(row.feeAmount, 0),
    taxAmount: finiteNumber(row.taxAmount, 0),
    buyerTotal: finiteNumber(row.buyerTotal, 0),
    sellerProceeds: finiteNumber(row.sellerProceeds, 0),
    currencyCode: currency(row.currencyCode),
    status: reservationStatus(row.status),
    version: boundedInteger(row.version, 1),
    listingVersion: boundedInteger(row.listingVersion, 1),
    expiresAt: isoTimestamp(row.expiresAt),
    replayed: booleanValue(row.replayed),
    fundingQuote: parseFundingQuote(row.fundingQuote),
  });
}

export function parseMarketplaceFundingOrder(
  value: unknown,
): PlayerMarketplaceFundedOrderDto {
  const row = publicRecord(value);
  return Object.freeze({
    orderKey: publicKey(row.orderKey, MARKETPLACE_FUNDING_ORDER_KEY_PATTERN),
    reservationKey: publicKey(
      row.reservationKey,
      MARKETPLACE_FUNDING_RESERVATION_KEY_PATTERN,
    ),
    listingKey: publicKey(row.listingKey, MARKETPLACE_LISTING_KEY_PATTERN),
    itemKey: publicKey(row.itemKey, MARKETPLACE_ITEM_KEY_PATTERN),
    quantity: boundedInteger(row.quantity, 1),
    unitPrice: finiteNumber(row.unitPrice, 0),
    subtotal: finiteNumber(row.subtotal, 0),
    feeAmount: finiteNumber(row.feeAmount, 0),
    taxAmount: finiteNumber(row.taxAmount, 0),
    buyerTotal: finiteNumber(row.buyerTotal, 0),
    sellerProceeds: finiteNumber(row.sellerProceeds, 0),
    currencyCode: currency(row.currencyCode),
    status: orderStatus(row.status),
    version: boundedInteger(row.version, 1),
    completedAt: isoTimestamp(row.completedAt),
    refundedAt: nullableIsoTimestamp(row.refundedAt),
    replayed: booleanValue(row.replayed),
    fundingReceipt: parseFundingReceipt(row.fundingReceipt),
    distributionBankTransactionKey: publicKey(
      row.distributionBankTransactionKey,
      MARKETPLACE_FUNDING_BANK_TRANSACTION_KEY_PATTERN,
    ),
  });
}

function parseFundingQuote(value: unknown): PlayerMarketplaceFundingQuoteDto {
  const row = publicRecord(value);
  const lines = publicArray(row.lines).map(parseFundingQuoteLine);
  if (lines.length < 1 || lines.length > 3) throw invalidPublicResponse();
  if (publicText(row.funding_context_kind) !== "marketplace.purchase") {
    throw invalidPublicResponse();
  }
  return Object.freeze({
    quoteKey: publicKey(row.quote_key, MARKETPLACE_FUNDING_QUOTE_KEY_PATTERN),
    fundingContextKind: "marketplace.purchase",
    fundingContextKey: publicKey(
      row.funding_context_key,
      MARKETPLACE_FUNDING_RESERVATION_KEY_PATTERN,
    ),
    targetCurrencyCode: currency(row.target_currency_code),
    targetMinorUnit: boundedInteger(row.target_minor_unit, 0, 18),
    targetAmount: finiteNumber(row.target_amount, 0),
    fixingKey: publicKey(row.fixing_key, FIXING_KEY),
    policyVersion: publicText(row.policy_version),
    requiresFx: booleanValue(row.requires_fx),
    expiresAt: isoTimestamp(row.expires_at),
    lines: Object.freeze(lines),
  });
}

function parseFundingQuoteLine(
  value: unknown,
): PlayerMarketplaceFundingQuoteLineDto {
  const row = publicRecord(value);
  return Object.freeze({
    lineNumber: boundedInteger(row.line_number, 1, 3),
    sourceAccountKey: publicKey(
      row.source_account_key,
      MARKETPLACE_FUNDING_ACCOUNT_KEY_PATTERN,
    ),
    sourceCurrencyCode: currency(row.source_currency_code),
    sourceMinorUnit: boundedInteger(row.source_minor_unit, 0, 18),
    targetCurrencyCode: currency(row.target_currency_code),
    targetMinorUnit: boundedInteger(row.target_minor_unit, 0, 18),
    postedAmount: finiteNumber(row.posted_amount),
    heldAmount: finiteNumber(row.held_amount, 0),
    availableAmount: finiteNumber(row.available_amount),
    targetContribution: finiteNumber(row.target_contribution, 0),
    sourceDebit: finiteNumber(row.source_debit, 0),
    referenceRate: finiteNumber(row.reference_rate, 0),
    customerRate: finiteNumber(row.customer_rate, 0),
    effectiveRate: finiteNumber(row.effective_rate, 0),
    spreadRate: finiteNumber(row.spread_rate, 0),
    requiresFx: booleanValue(row.requires_fx),
    roundingDisclosure: publicText(row.rounding_disclosure),
  });
}

function parseFundingReceipt(
  value: unknown,
): PlayerMarketplaceFundingReceiptDto {
  const row = publicRecord(value);
  const lines = publicArray(row.lines).map(parseFundingReceiptLine);
  if (lines.length < 1 || lines.length > 3) throw invalidPublicResponse();
  if (
    publicText(row.funding_context_kind) !== "marketplace.purchase" ||
    publicText(row.source_domain) !== "marketplace" ||
    publicText(row.source_action) !== "marketplace_purchase_funding"
  ) {
    throw invalidPublicResponse();
  }
  return Object.freeze({
    receiptKey: publicKey(
      row.receipt_key,
      MARKETPLACE_FUNDING_RECEIPT_KEY_PATTERN,
    ),
    quoteKey: publicKey(row.quote_key, MARKETPLACE_FUNDING_QUOTE_KEY_PATTERN),
    bankTransactionKey: publicKey(
      row.bank_transaction_key,
      MARKETPLACE_FUNDING_BANK_TRANSACTION_KEY_PATTERN,
    ),
    targetAccountKey: publicKey(
      row.target_account_key,
      MARKETPLACE_FUNDING_ACCOUNT_KEY_PATTERN,
    ),
    fundingContextKind: "marketplace.purchase",
    fundingContextKey: publicKey(
      row.funding_context_key,
      MARKETPLACE_FUNDING_RESERVATION_KEY_PATTERN,
    ),
    targetCurrencyCode: currency(row.target_currency_code),
    targetAmount: finiteNumber(row.target_amount, 0),
    targetReserveDrawAmount: finiteNumber(
      row.target_reserve_draw_amount,
      0,
    ),
    sourceDomain: "marketplace",
    sourceAction: "marketplace_purchase_funding",
    createdAt: isoTimestamp(row.created_at),
    lines: Object.freeze(lines),
  });
}

function parseFundingReceiptLine(
  value: unknown,
): PlayerMarketplaceFundingReceiptLineDto {
  const row = publicRecord(value);
  return Object.freeze({
    lineNumber: boundedInteger(row.line_number, 1, 3),
    sourceAccountKey: publicKey(
      row.source_account_key,
      MARKETPLACE_FUNDING_ACCOUNT_KEY_PATTERN,
    ),
    sourceCurrencyCode: currency(row.source_currency_code),
    targetContribution: finiteNumber(row.target_contribution, 0),
    sourceDebit: finiteNumber(row.source_debit, 0),
    referenceRate: finiteNumber(row.reference_rate, 0),
    customerRate: finiteNumber(row.customer_rate, 0),
    effectiveRate: finiteNumber(row.effective_rate, 0),
    spreadRate: finiteNumber(row.spread_rate, 0),
    requiresFx: booleanValue(row.requires_fx),
  });
}

export function mapMarketplaceFundingRpcError(
  error: MarketplaceFundingRpcError,
  phase: "quote" | "settlement",
): PlayerMarketplaceError | PlayerMarketplacePersistenceError {
  const source = `${error.code ?? ""} ${error.message ?? ""}`.toUpperCase();
  const code = [...source.matchAll(/[A-Z][A-Z0-9_]{4,}/gu)]
    .map((match) => match[0])
    .find((candidate) =>
      /^(?:MARKETPLACE|PURCHASE|FUNDING|BANK|FX)_/u.test(candidate)
    ) ?? "";

  if (/REQUEST_INVALID|ALLOCATIONS?_INVALID|PRECISION_INVALID/u.test(code)) {
    return publicError(
      "invalid_player_marketplace_request",
      "Marketplace funding request is invalid.",
      400,
    );
  }
  if (code.includes("NOT_FOUND")) {
    return publicError(
      "player_marketplace_not_found",
      "Marketplace listing or reservation was not found.",
      404,
    );
  }
  if (code.includes("DISABLED") || code.includes("COUNTRY_BLOCKED")) {
    return publicError(
      "player_marketplace_disabled",
      "Marketplace trading is unavailable.",
      403,
    );
  }
  if (
    code.includes("FUNDING_INSUFFICIENT") ||
    code.includes("INSUFFICIENT_FUNDS") ||
    code.includes("AVAILABLE_BALANCE_INSUFFICIENT")
  ) {
    return publicError(
      "player_marketplace_insufficient_funds",
      "Available Checking funds are insufficient.",
      409,
    );
  }
  if (
    code.includes("IDEMPOTENCY") || code.includes("CONFLICT") ||
    code.includes("STALE") || code.includes("EXPIRED") ||
    code.includes("NOT_ACTIVE") || code.includes("UNAVAILABLE") ||
    code.includes("LIQUIDITY") || code.includes("FACILITY") ||
    code.includes("TOTAL_MISMATCH") || code.includes("SELF_PURCHASE")
  ) {
    return publicError(
      "player_marketplace_conflict",
      phase === "quote"
        ? "Marketplace funding quote is no longer available."
        : "Marketplace settlement could not be completed from the quoted state.",
      409,
    );
  }
  return new PlayerMarketplacePersistenceError(
    code || "MARKETPLACE_FUNDING_UNKNOWN",
    phase === "quote"
      ? "Marketplace funding quote failed."
      : "Marketplace funded settlement failed.",
  );
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

function nullableIsoTimestamp(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return isoTimestamp(value);
}

function reservationStatus(
  value: unknown,
): "reserved" | "settling" | "settled" | "released" | "expired" {
  const candidate = publicText(value).toLowerCase();
  if (![
    "reserved",
    "settling",
    "settled",
    "released",
    "expired",
  ].includes(candidate)) {
    throw invalidPublicResponse();
  }
  return candidate as
    | "reserved"
    | "settling"
    | "settled"
    | "released"
    | "expired";
}

function orderStatus(value: unknown): "completed" | "disputed" | "refunded" {
  const candidate = publicText(value).toLowerCase();
  if (![
    "completed",
    "disputed",
    "refunded",
  ].includes(candidate)) {
    throw invalidPublicResponse();
  }
  return candidate as "completed" | "disputed" | "refunded";
}

function invalidPublicResponse(): PlayerMarketplaceError {
  return publicError(
    "player_marketplace_service_unavailable",
    "Marketplace funding returned an invalid public response.",
    500,
  );
}

function publicError(
  code: ConstructorParameters<typeof PlayerMarketplaceError>[0],
  message: string,
  status: number,
): PlayerMarketplaceError {
  return new PlayerMarketplaceError(code, message, status, false);
}
