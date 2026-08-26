import { parsePlayerBankAccounts } from "../../economy/infrastructure/supabasePlayerBankingPublicRepository.ts";
import {
  PLAYER_BANK_ACCOUNT_KEY_PATTERN,
  PLAYER_FX_FIXING_KEY_PATTERN,
  PLAYER_FX_ORDER_KEY_PATTERN,
  PLAYER_FX_QUOTE_KEY_PATTERN,
  PLAYER_FX_RECEIPT_KEY_PATTERN,
  PlayerBankingFxError,
  type PlayerBankingFxFixingDto,
  type PlayerBankingFxHistoryPage,
  type PlayerBankingFxHistoryPointDto,
  type PlayerBankingFxMutationResult,
  type PlayerBankingFxOrderDto,
  type PlayerBankingFxOrdersPage,
  type PlayerBankingFxOverview,
  type PlayerBankingFxProduct,
  type PlayerBankingFxQuoteDto,
} from "../contracts/playerBankingFxContracts.ts";
import { projectPlayerBankingFxCurrencies } from "./playerBankingFxCurrencyProjection.ts";

type Row = Record<string, unknown>;

export function projectPlayerBankingFxOverview(
  overviewValue: unknown,
  accountsValue: unknown,
): PlayerBankingFxOverview {
  const overview = oneRow(overviewValue, "FX overview");
  const allOrders = optionalRows(
    first(overview, "orders", "fx_orders", "fxOrders"),
    "FX overview orders",
  ).map(orderDto);
  const pending = optionalRows(
    first(overview, "pending_orders", "pendingOrders"),
    "FX overview pending orders",
  );
  const completed = optionalRows(
    first(overview, "completed_orders", "completedOrders"),
    "FX overview completed orders",
  );
  let accounts;
  try {
    accounts = parsePlayerBankAccounts(accountsValue);
  } catch {
    throw invalidResult("Player bank accounts");
  }
  return {
    accounts,
    currencies: projectPlayerBankingFxCurrencies(
      first(overview, "currencies", "currency_options", "currencyOptions"),
    ),
    fixing: fixingDto(
      nestedRow(overview, ["fixing", "current_fixing", "currentFixing"]) ??
        overview,
    ),
    pendingOrders: pending.length
      ? pending.map(orderDto)
      : allOrders.filter((order) => pendingOrderStatus(order.status)),
    completedOrders: completed.length
      ? completed.map(orderDto)
      : allOrders.filter((order) => !pendingOrderStatus(order.status)),
  };
}

export function projectPlayerBankingFxHistoryPage(
  value: unknown,
  limit: number,
): PlayerBankingFxHistoryPage {
  const page = pageRows(
    value,
    ["history", "rates", "items", "rows"],
    "FX rate history",
  );
  return {
    items: page.rows.slice(0, limit).map(historyDto),
    hasMore: page.hasMore ?? page.rows.length > limit,
  };
}

export function projectPlayerBankingFxOrdersPage(
  value: unknown,
  limit: number,
): PlayerBankingFxOrdersPage {
  const page = pageRows(value, ["orders", "items", "rows"], "FX orders");
  return {
    items: page.rows.slice(0, limit).map(orderDto),
    hasMore: page.hasMore ?? page.rows.length > limit,
  };
}

export function projectPlayerBankingFxQuoteMutation(
  value: unknown,
): PlayerBankingFxMutationResult<PlayerBankingFxQuoteDto> {
  return mutation(
    value,
    ["quote", "fx_quote", "fxQuote"],
    quoteDto,
    "FX quote",
  );
}

export function projectPlayerBankingFxOrderMutation(
  value: unknown,
  label: string,
): PlayerBankingFxMutationResult<PlayerBankingFxOrderDto> {
  return mutation(
    value,
    ["order", "fx_order", "fxOrder"],
    orderDto,
    label,
  );
}

function fixingDto(row: Row): PlayerBankingFxFixingDto {
  return {
    fixingKey: publicKey(
      first(
        row,
        "fixing_key",
        "fixingKey",
        "fixing_public_key",
        "fixingPublicKey",
        "current_fixing_public_id",
        "currentFixingPublicId",
      ),
      PLAYER_FX_FIXING_KEY_PATTERN,
      "FX fixing key",
    ),
    effectiveAt: iso(
      first(row, "effective_at", "effectiveAt"),
      "FX fixing effective time",
    ),
    calculatedAt: iso(
      first(row, "calculated_at", "calculatedAt"),
      "FX fixing calculation time",
    ),
    nextFixingAt: iso(
      first(row, "next_fixing_at", "nextFixingAt"),
      "next FX fixing time",
    ),
    overdue: boolean(
      first(row, "overdue", "fixing_overdue", "fixingOverdue"),
      "FX overdue state",
    ),
    policyVersion: token(
      first(row, "policy_version", "policyVersion"),
      "FX policy version",
      100,
    ),
  };
}

function quoteDto(row: Row): PlayerBankingFxQuoteDto {
  return {
    quoteKey: publicKey(
      first(row, "quote_key", "quoteKey", "public_key", "publicKey"),
      PLAYER_FX_QUOTE_KEY_PATTERN,
      "FX quote key",
    ),
    product: product(first(row, "product", "order_type", "orderType")),
    sourceAccountKey: publicKey(
      first(row, "source_account_key", "sourceAccountKey"),
      PLAYER_BANK_ACCOUNT_KEY_PATTERN,
      "source account key",
    ),
    targetAccountKey: publicKey(
      first(row, "target_account_key", "targetAccountKey"),
      PLAYER_BANK_ACCOUNT_KEY_PATTERN,
      "target account key",
    ),
    sourceCurrencyCode: currency(
      first(row, "source_currency_code", "sourceCurrencyCode"),
    ),
    targetCurrencyCode: currency(
      first(row, "target_currency_code", "targetCurrencyCode"),
    ),
    sourceMinorUnit: minorUnit(
      first(row, "source_minor_unit", "sourceMinorUnit"),
      "source minor unit",
    ),
    targetMinorUnit: minorUnit(
      first(row, "target_minor_unit", "targetMinorUnit"),
      "target minor unit",
    ),
    sourceAmountMode: sourceAmountMode(
      first(row, "source_amount_mode", "sourceAmountMode"),
    ),
    sourceAmount: amount(
      first(row, "source_amount", "sourceAmount"),
      "source amount",
      true,
    ),
    referenceRate: amount(
      first(row, "reference_rate", "referenceRate", "mid_rate", "midRate"),
      "reference rate",
      true,
    ),
    customerRate: amount(
      first(
        row,
        "customer_rate",
        "customerRate",
        "accepted_rate",
        "acceptedRate",
      ),
      "customer rate",
      true,
    ),
    spreadRate: amount(first(row, "spread_rate", "spreadRate"), "spread rate"),
    feeAmount: amount(first(row, "fee_amount", "feeAmount"), "fee amount"),
    targetAmount: amount(
      first(
        row,
        "target_amount",
        "targetAmount",
        "expected_credit",
        "expectedCredit",
      ),
      "target amount",
      true,
    ),
    fixingKey: publicKey(
      first(
        row,
        "fixing_key",
        "fixingKey",
        "fixing_public_key",
        "fixingPublicKey",
      ),
      PLAYER_FX_FIXING_KEY_PATTERN,
      "FX fixing key",
    ),
    policyVersion: token(
      first(row, "policy_version", "policyVersion"),
      "FX policy version",
      100,
    ),
    expiresAt: iso(first(row, "expires_at", "expiresAt"), "FX quote expiry"),
    settlesAt: iso(
      first(row, "settles_at", "settlesAt", "settlement_at", "settlementAt"),
      "FX settlement time",
    ),
    requiresFx: boolean(
      first(row, "requires_fx", "requiresFx"),
      "FX requirement",
    ),
    roundingDisclosure: boundedText(
      first(row, "rounding_disclosure", "roundingDisclosure"),
      "FX rounding disclosure",
      500,
    ),
  };
}

function orderDto(row: Row): PlayerBankingFxOrderDto {
  const receipt = first(
    row,
    "receipt_key",
    "receiptKey",
    "receipt_public_key",
    "receiptPublicKey",
  );
  return {
    orderKey: publicKey(
      first(row, "order_key", "orderKey", "public_key", "publicKey"),
      PLAYER_FX_ORDER_KEY_PATTERN,
      "FX order key",
    ),
    quoteKey: publicKey(
      first(row, "quote_key", "quoteKey", "quote_public_key", "quotePublicKey"),
      PLAYER_FX_QUOTE_KEY_PATTERN,
      "FX quote key",
    ),
    product: product(first(row, "product", "order_type", "orderType")),
    status: lowerToken(
      first(row, "status", "order_status", "orderStatus"),
      "FX order status",
      40,
    ),
    sourceCurrencyCode: currency(
      first(row, "source_currency_code", "sourceCurrencyCode"),
    ),
    targetCurrencyCode: currency(
      first(row, "target_currency_code", "targetCurrencyCode"),
    ),
    sourceAmount: amount(
      first(row, "source_amount", "sourceAmount"),
      "source amount",
      true,
    ),
    feeAmount: amount(first(row, "fee_amount", "feeAmount"), "fee amount"),
    targetAmount: amount(
      first(
        row,
        "target_amount",
        "targetAmount",
        "expected_credit",
        "expectedCredit",
      ),
      "target amount",
      true,
    ),
    submittedAt: iso(
      first(row, "submitted_at", "submittedAt", "created_at", "createdAt"),
      "FX submission time",
    ),
    settlesAt: iso(
      first(row, "settles_at", "settlesAt", "settlement_at", "settlementAt"),
      "FX settlement time",
    ),
    completedAt: nullableIso(
      first(row, "completed_at", "completedAt", "settled_at", "settledAt"),
      "FX completion time",
    ),
    receiptKey: receipt === null || receipt === undefined || receipt === ""
      ? null
      : publicKey(receipt, PLAYER_FX_RECEIPT_KEY_PATTERN, "FX receipt key"),
  };
}

function historyDto(row: Row): PlayerBankingFxHistoryPointDto {
  return {
    fixingKey: publicKey(
      first(
        row,
        "fixing_key",
        "fixingKey",
        "fixing_public_key",
        "fixingPublicKey",
        "public_key",
        "publicKey",
      ),
      PLAYER_FX_FIXING_KEY_PATTERN,
      "FX fixing key",
    ),
    effectiveAt: iso(
      first(row, "effective_at", "effectiveAt"),
      "FX fixing effective time",
    ),
    sourceCurrencyCode: currency(
      first(row, "source_currency_code", "sourceCurrencyCode"),
    ),
    targetCurrencyCode: currency(
      first(row, "target_currency_code", "targetCurrencyCode"),
    ),
    referenceRate: amount(
      first(row, "reference_rate", "referenceRate", "rate"),
      "reference rate",
      true,
    ),
  };
}

function mutation<T>(
  value: unknown,
  keys: readonly string[],
  project: (row: Row) => T,
  label: string,
): PlayerBankingFxMutationResult<T> {
  const root = oneRow(value, label);
  return {
    outcome: mutationOutcome(root),
    value: project(nestedRow(root, keys) ?? root),
  };
}

function mutationOutcome(row: Row): "applied" | "replayed" {
  const outcome = String(first(row, "outcome", "result") ?? "").trim()
    .toLowerCase();
  return outcome === "replayed" ||
      first(row, "replayed", "is_replay", "isReplay") === true
    ? "replayed"
    : "applied";
}

function pageRows(value: unknown, keys: readonly string[], label: string) {
  if (Array.isArray(value)) return { rows: rows(value, label), hasMore: null };
  const envelope = oneRow(value, label);
  const hasMore = first(envelope, "has_more", "hasMore");
  return {
    rows: rows(first(envelope, ...keys), label),
    hasMore: hasMore === undefined || hasMore === null
      ? null
      : boolean(hasMore, `${label} hasMore`),
  };
}

function oneRow(value: unknown, label: string): Row {
  const candidate = Array.isArray(value)
    ? value.length === 1 ? value[0] : null
    : value;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw invalidResult(label);
  }
  return candidate as Row;
}

function nestedRow(row: Row, keys: readonly string[]): Row | null {
  const value = first(row, ...keys);
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Row
    : null;
}

function optionalRows(value: unknown, label: string): Row[] {
  return value === undefined || value === null ? [] : rows(value, label);
}

function rows(value: unknown, label: string): Row[] {
  if (
    !Array.isArray(value) ||
    value.some((item) =>
      !item || typeof item !== "object" || Array.isArray(item)
    )
  ) throw invalidResult(label);
  return value as Row[];
}

function first(row: Row, ...keys: readonly string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }
  return undefined;
}

function publicKey(value: unknown, pattern: RegExp, label: string): string {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!pattern.test(key)) throw invalidResult(label);
  return key;
}

function product(value: unknown): PlayerBankingFxProduct {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (result !== "standard" && result !== "instant") {
    throw invalidResult("FX product");
  }
  return result;
}

function currency(value: unknown): string {
  const result = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/u.test(result)) throw invalidResult("FX currency code");
  return result;
}

function amount(value: unknown, label: string, positive = false): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (
    !/^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/u.test(result) ||
    (positive && /^0(?:\.0+)?$/u.test(result))
  ) throw invalidResult(label);
  return result;
}

function minorUnit(value: unknown, label: string): number {
  const result = typeof value === "number" ? value : Number.NaN;
  if (!Number.isInteger(result) || result < 0 || result > 18) {
    throw invalidResult(label);
  }
  return result;
}

function sourceAmountMode(value: unknown): "source_debit" {
  if (value !== "source_debit") throw invalidResult("source amount mode");
  return value;
}

function token(value: unknown, label: string, max: number): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > max || !/^[A-Za-z0-9._:-]+$/u.test(result)) {
    throw invalidResult(label);
  }
  return result;
}

function lowerToken(value: unknown, label: string, max: number): string {
  return token(value, label, max).toLowerCase();
}

function boundedText(value: unknown, label: string, max: number): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > max) throw invalidResult(label);
  return result;
}

function iso(value: unknown, label: string): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || !Number.isFinite(Date.parse(result))) {
    throw invalidResult(label);
  }
  return result;
}

function nullableIso(value: unknown, label: string): string | null {
  return value === null || value === undefined || value === ""
    ? null
    : iso(value, label);
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw invalidResult(label);
  return value;
}

function pendingOrderStatus(status: string): boolean {
  return ["pending", "reserved", "claimed", "processing", "settling"].includes(
    status,
  );
}

function invalidResult(label: string): PlayerBankingFxError {
  return new PlayerBankingFxError(
    "player_banking_fx_result_invalid",
    `${label} returned an invalid result.`,
    503,
    true,
  );
}
