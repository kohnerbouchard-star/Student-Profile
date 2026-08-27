import {
  PLAYER_STORE_FUNDING_ACCOUNT_KEY_PATTERN,
  PLAYER_STORE_FUNDING_QUOTE_KEY_PATTERN,
  PLAYER_STORE_FUNDING_RECEIPT_KEY_PATTERN,
  type PlayerStoreBusinessFundingQuoteDto,
  type PlayerStoreBusinessFundingReceiptDto,
  type PlayerStoreFundingPublicRepository,
  type PlayerStoreFundingPublicScope,
  type PlayerStoreFundingQuoteDto,
  type PlayerStoreFundingQuoteLineDto,
  type PlayerStoreFundingReceiptDto,
  type PlayerStoreFundingReceiptLineDto,
  type PlayerStoreSeededFundingQuoteDto,
  type PlayerStoreSeededFundingReceiptDto,
} from "../contracts/playerStoreFundingPublicContracts.ts";
import {
  projectPlayerStoreOfferQuote,
  projectPlayerStoreOfferReceipt,
} from "../contracts/playerStoreOfferPublicContracts.ts";
import {
  PLAYER_STORE_ITEM_KEY_PATTERN,
  PLAYER_STORE_QUOTE_KEY_PATTERN,
  PLAYER_STORE_RECEIPT_KEY_PATTERN,
  PlayerStorePublicError,
} from "../contracts/playerStorePublicContracts.ts";
import { parseBusinessStoreOfferQuote } from "../contracts/storeOfferQuoteContracts.ts";
import { parseBusinessStoreOfferReceipt } from "../contracts/storeOfferSettlementContracts.ts";
import {
  type PlayerStoreOfferClient,
  PlayerStoreOfferPublicReadStore,
  type PlayerStoreOfferQueryResponse,
} from "./playerStoreOfferPublicReadStore.ts";

const UUID_EXACT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const UUID_ANY =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu;
const FIXING_KEY = /^fxf_[0-9a-f]{32}$/u;
const BANK_TRANSACTION_KEY = /^btx_[0-9a-f]{32}$/u;
const CURRENCY_CODE = /^[A-Z0-9_]{3,16}$/u;

interface RpcError {
  readonly message?: string;
  readonly code?: string;
}

export class SupabasePlayerStoreFundingPublicRepository
  implements PlayerStoreFundingPublicRepository {
  private readonly readStore: PlayerStoreOfferPublicReadStore;

  constructor(private readonly client: PlayerStoreOfferClient) {
    this.readStore = new PlayerStoreOfferPublicReadStore(client);
  }

  async createSeededQuote(
    input: Parameters<PlayerStoreFundingPublicRepository["createSeededQuote"]>[0],
  ): Promise<PlayerStoreSeededFundingQuoteDto> {
    const scope = normalizeScope(input);
    const raw = await this.callRpc(
      "create_seeded_store_funding_quote_v1",
      {
        p_game_session_id: scope.gameSessionId,
        p_player_id: scope.playerId,
        p_item_key: input.itemKey,
        p_quantity: input.quantity,
        p_allocations: input.allocations,
        p_idempotency_key: input.idempotencyKey,
        p_effective_at: input.effectiveAt,
      },
      "quote",
    );
    return parseSeededQuote(raw);
  }

  async settleSeededPurchase(
    input: Parameters<
      PlayerStoreFundingPublicRepository["settleSeededPurchase"]
    >[0],
  ): Promise<PlayerStoreSeededFundingReceiptDto> {
    const scope = normalizeScope(input);
    const raw = await this.callRpc(
      "settle_seeded_store_funding_v1",
      {
        p_game_session_id: scope.gameSessionId,
        p_player_id: scope.playerId,
        p_quote_key: input.quoteKey,
        p_idempotency_key: input.idempotencyKey,
        p_client_submitted_at: input.clientSubmittedAt,
        p_request_metadata: {},
      },
      "purchase",
    );
    return parseSeededReceipt(raw);
  }

  async createBusinessOfferQuote(
    input: Parameters<
      PlayerStoreFundingPublicRepository["createBusinessOfferQuote"]
    >[0],
  ): Promise<PlayerStoreBusinessFundingQuoteDto> {
    const scope = normalizeScope(input);
    const row = publicRecord(await this.callRpc(
      "create_business_store_offer_funding_quote_v1",
      {
        p_game_session_id: scope.gameSessionId,
        p_buyer_player_id: scope.playerId,
        p_offer_key: input.offerKey,
        p_quantity: input.quantity,
        p_expected_offer_version: input.expectedVersion,
        p_allocations: input.allocations,
        p_idempotency_key: input.idempotencyKey,
      },
      "quote",
    ));

    const fundingQuote = parseFundingQuote(row.fundingQuote);
    const quote = parseBusinessStoreOfferQuote(row);
    const identity = await this.readStore.requireBusinessIdentity(
      scope.gameSessionId,
      quote.sellerPartyKey,
      quote.businessKey,
    );
    return Object.freeze({
      ...projectPlayerStoreOfferQuote(quote, identity),
      fundingQuote,
    });
  }

  async settleBusinessOfferPurchase(
    input: Parameters<
      PlayerStoreFundingPublicRepository["settleBusinessOfferPurchase"]
    >[0],
  ): Promise<PlayerStoreBusinessFundingReceiptDto> {
    const scope = normalizeScope(input);
    const raw = await this.callRpc(
      "settle_business_store_offer_funding_v1",
      {
        p_game_session_id: scope.gameSessionId,
        p_buyer_player_id: scope.playerId,
        p_offer_key: input.offerKey,
        p_quote_key: input.quoteKey,
        p_quantity: input.quantity,
        p_expected_offer_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
      },
      "purchase",
    );
    return await this.parseBusinessReceipt(scope, raw);
  }

  async readBusinessOfferReceipt(
    input: Parameters<
      PlayerStoreFundingPublicRepository["readBusinessOfferReceipt"]
    >[0],
  ): Promise<PlayerStoreBusinessFundingReceiptDto> {
    const scope = normalizeScope(input);
    const raw = await this.callRpc(
      "read_business_store_offer_funding_receipt_v1",
      {
        p_game_session_id: scope.gameSessionId,
        p_buyer_player_id: scope.playerId,
        p_receipt_key: input.receiptKey,
      },
      "receipt",
    );
    return await this.parseBusinessReceipt(scope, raw);
  }

  private async parseBusinessReceipt(
    scope: PlayerStoreFundingPublicScope,
    raw: unknown,
  ): Promise<PlayerStoreBusinessFundingReceiptDto> {
    const row = publicRecord(raw);
    const fundingReceipt = parseFundingReceipt(row.fundingReceipt);
    const { fundingReceipt: _fundingReceipt, ...receiptPayload } = row;
    const receipt = parseBusinessStoreOfferReceipt(receiptPayload);
    const identity = await this.readStore.requireBusinessIdentity(
      scope.gameSessionId,
      receipt.sellerPartyKey,
      receipt.businessKey,
      { requireActive: false },
    );
    return Object.freeze({
      ...projectPlayerStoreOfferReceipt(receipt, identity),
      fundingReceipt,
    });
  }

  private async callRpc(
    functionName: string,
    args: Record<string, unknown>,
    phase: "quote" | "purchase" | "receipt",
  ): Promise<unknown> {
    const response = await this.client.rpc<unknown>(functionName, args) as
      PlayerStoreOfferQueryResponse<unknown>;
    if (response.error) throw mapFundingRpcError(response.error, phase);
    if (response.data === null || response.data === undefined) {
      throw invalidPublicResponse();
    }
    return response.data;
  }
}

function normalizeScope(
  input: PlayerStoreFundingPublicScope,
): PlayerStoreFundingPublicScope {
  const gameSessionId = String(input.gameSessionId ?? "").trim().toLowerCase();
  const playerId = String(input.playerId ?? "").trim().toLowerCase();
  if (!UUID_EXACT.test(gameSessionId) || !UUID_EXACT.test(playerId)) {
    throw new PlayerStorePublicError(
      "player_store_funding_scope_invalid",
      "Player Store funding scope is invalid.",
      500,
      false,
    );
  }
  return Object.freeze({ gameSessionId, playerId });
}

function parseSeededQuote(value: unknown): PlayerStoreSeededFundingQuoteDto {
  const row = publicRecord(value);
  return Object.freeze({
    quoteKey: publicKey(row.quoteKey, PLAYER_STORE_QUOTE_KEY_PATTERN),
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
    finalTotalPrice: finiteNumber(row.finalTotalPrice, 0),
    currencyCode: currency(row.currencyCode),
    itemCurrencyCode: currency(row.itemCurrencyCode),
    playerCurrencyCode: currency(row.playerCurrencyCode),
    exchangeRate: finiteNumber(row.exchangeRate, 0),
    itemLocalFinalUnitPrice: finiteNumber(row.itemLocalFinalUnitPrice, 0),
    itemLocalFinalTotalPrice: finiteNumber(row.itemLocalFinalTotalPrice, 0),
    expiresAt: isoTimestamp(row.expiresAt),
    pricingVersion: publicText(row.pricingVersion),
    replayed: booleanValue(row.replayed),
    fundingQuote: parseFundingQuote(row.fundingQuote),
  });
}

function parseSeededReceipt(value: unknown): PlayerStoreSeededFundingReceiptDto {
  const row = publicRecord(value);
  return Object.freeze({
    receiptKey: publicKey(row.receiptKey, PLAYER_STORE_RECEIPT_KEY_PATTERN),
    quoteKey: publicKey(row.quoteKey, PLAYER_STORE_QUOTE_KEY_PATTERN),
    itemKey: publicKey(row.itemKey, PLAYER_STORE_ITEM_KEY_PATTERN),
    itemName: publicText(row.itemName),
    quantity: boundedInteger(row.quantity, 1),
    finalUnitPrice: finiteNumber(row.finalUnitPrice, 0),
    finalTotalPrice: finiteNumber(row.finalTotalPrice, 0),
    currencyCode: currency(row.currencyCode),
    inventoryQuantityOwned: boundedInteger(row.inventoryQuantityOwned, 0),
    completedAt: isoTimestamp(row.completedAt),
    alreadyCompleted: booleanValue(row.alreadyCompleted),
    fundingReceipt: parseFundingReceipt(row.fundingReceipt),
  });
}

function parseFundingQuote(value: unknown): PlayerStoreFundingQuoteDto {
  const row = publicRecord(value);
  const lines = publicArray(row.lines).map(parseFundingQuoteLine);
  if (lines.length < 1 || lines.length > 3) throw invalidPublicResponse();
  return Object.freeze({
    quoteKey: publicKey(
      row.quote_key,
      PLAYER_STORE_FUNDING_QUOTE_KEY_PATTERN,
    ),
    fundingContextKind: publicText(row.funding_context_kind),
    fundingContextKey: publicContextKey(row.funding_context_key),
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

function parseFundingReceipt(value: unknown): PlayerStoreFundingReceiptDto {
  const row = publicRecord(value);
  const lines = publicArray(row.lines).map(parseFundingReceiptLine);
  if (lines.length < 1 || lines.length > 3) throw invalidPublicResponse();
  return Object.freeze({
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
    targetAmount: finiteNumber(row.target_amount, 0),
    targetReserveDrawAmount: finiteNumber(
      row.target_reserve_draw_amount,
      0,
    ),
    sourceDomain: publicText(row.source_domain),
    sourceAction: publicText(row.source_action),
    createdAt: isoTimestamp(row.created_at),
    lines: Object.freeze(lines),
  });
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
    targetContribution: finiteNumber(row.target_contribution, 0),
    sourceDebit: finiteNumber(row.source_debit, 0),
    referenceRate: finiteNumber(row.reference_rate, 0),
    customerRate: finiteNumber(row.customer_rate, 0),
    effectiveRate: finiteNumber(row.effective_rate, 0),
    spreadRate: finiteNumber(row.spread_rate, 0),
    requiresFx: booleanValue(row.requires_fx),
  });
}

function mapFundingRpcError(
  error: RpcError,
  phase: "quote" | "purchase" | "receipt",
): PlayerStorePublicError {
  const source = `${error.code ?? ""} ${error.message ?? ""}`.toUpperCase();
  const code = [...source.matchAll(/[A-Z][A-Z0-9_]{4,}/gu)]
    .map((match) => match[0])
    .find((candidate) =>
      /^(?:STORE|PURCHASE|FUNDING|BANK|FX|PLAYER)_/u.test(candidate)
    ) ?? "";

  if (/REQUEST_INVALID|ALLOCATIONS?_INVALID|PRECISION_INVALID/u.test(code)) {
    return publicError(
      "invalid_player_store_request",
      "Store funding request is invalid.",
      400,
    );
  }
  if (code.includes("SELF_PURCHASE")) {
    return publicError(
      "store_offer_self_purchase_forbidden",
      "A Player cannot purchase from their own Business.",
      403,
    );
  }
  if (code.includes("IDEMPOTENCY") || code.endsWith("_CONFLICT")) {
    return publicError(
      "store_idempotency_conflict",
      "This idempotency key was already used for another Store request.",
      409,
    );
  }
  if (code.includes("INSUFFICIENT_STOCK")) {
    return publicError(
      "store_insufficient_stock",
      "Store stock is insufficient.",
      409,
    );
  }
  if (
    code.includes("FUNDING_INSUFFICIENT") ||
    code.includes("INSUFFICIENT_FUNDS")
  ) {
    return publicError(
      "store_insufficient_balance",
      "Available Checking funds are insufficient for this purchase.",
      409,
    );
  }
  if (/LIQUIDITY|FACILITY|CLEARING|RESERVE|CAP_/u.test(code)) {
    return publicError(
      "store_fx_liquidity_unavailable",
      "Retail checkout FX capacity is unavailable.",
      409,
    );
  }
  if (code.includes("TOTAL_MISMATCH")) {
    return publicError(
      "store_funding_total_mismatch",
      "The selected account allocations must equal the Store bill.",
      409,
    );
  }
  if (code.includes("QUOTE_EXPIRED") || code.includes("RATE_VERSION_STALE")) {
    return publicError(
      "store_quote_expired",
      "The Store funding quote has expired.",
      409,
    );
  }
  if (code.includes("RECEIPT_NOT_FOUND")) {
    return publicError(
      "store_offer_receipt_not_found",
      "Store offer receipt was not found.",
      404,
    );
  }
  if (/NOT_FOUND|UNAVAILABLE|STATUS_INVALID|MISMATCH|RESERVED/u.test(code)) {
    return publicError(
      phase === "quote"
        ? "store_quote_not_available"
        : "store_purchase_unavailable",
      phase === "quote"
        ? "Store funding quote is not available."
        : "Store purchase is not available.",
      409,
    );
  }
  return publicError(
    phase === "quote"
      ? "player_store_funding_quote_failed"
      : phase === "receipt"
      ? "player_store_funding_receipt_failed"
      : "player_store_funding_purchase_failed",
    phase === "quote"
      ? "Store funding quote could not be created."
      : phase === "receipt"
      ? "Store funding receipt could not be loaded."
      : "Store purchase could not be completed.",
    500,
  );
}

function publicRecord(value: unknown): Record<string, unknown> {
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

function invalidPublicResponse(): PlayerStorePublicError {
  return publicError(
    "player_store_funding_response_invalid",
    "Store funding returned an invalid public response.",
    500,
  );
}

function publicError(
  code: string,
  message: string,
  status: number,
): PlayerStorePublicError {
  return new PlayerStorePublicError(code, message, status, false);
}
