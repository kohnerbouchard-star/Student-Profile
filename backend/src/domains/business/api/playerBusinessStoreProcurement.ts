import {
  type BusinessStoreQuoteDto,
  type BusinessStoreReceiptDto,
  PlayerBusinessError,
  type PlayerBusinessRepository,
} from "../contracts/playerBusinessContracts.ts";

const PUBLIC_KEY = /^[a-z]{3}_[0-9a-f]{32}$/u;
const STORE_ITEM_KEY = /^[a-z0-9_-]{1,64}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,160}$/u;
const CURRENCY_CODE = /^[A-Z0-9_]{3,16}$/u;
const COUNTRY_CODE = /^[A-Z][A-Z0-9_]{2,31}$/u;

interface BusinessStoreScope {
  readonly gameSessionId: string;
  readonly playerId: string;
}

export async function createBusinessStoreQuote(
  repository: PlayerBusinessRepository,
  scope: BusinessStoreScope,
  body: Record<string, unknown>,
): Promise<BusinessStoreQuoteDto> {
  const result = await repository.execute("create_business_store_quote_v2", {
    p_game_session_id: scope.gameSessionId,
    p_player_id: scope.playerId,
    p_item_key: readStoreItemKey(body.itemKey),
    p_quantity: readInteger(body.quantity, "quantity", 1, 100_000),
    p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
  });
  return toBusinessStoreQuote(result);
}

export async function purchaseBusinessStoreQuote(
  repository: PlayerBusinessRepository,
  scope: BusinessStoreScope,
  body: Record<string, unknown>,
): Promise<BusinessStoreReceiptDto> {
  const result = await repository.execute("purchase_business_store_quote_v2", {
    p_game_session_id: scope.gameSessionId,
    p_player_id: scope.playerId,
    p_quote_key: readPublicKey(body.quoteKey, "quoteKey", "bsq"),
    p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
    p_client_submitted_at: readOptionalTimestamp(
      body.clientSubmittedAt,
      "clientSubmittedAt",
    ),
    p_request_metadata: {
      route: "players.me.business.store.purchases.v2",
    },
  });
  return toBusinessStoreReceipt(result);
}

export function toBusinessStoreQuote(
  row: Record<string, unknown>,
): BusinessStoreQuoteDto {
  return {
    businessKey: readResultPublicKey(row.business_key, "business_key", "biz"),
    quoteKey: readResultPublicKey(row.quote_key, "quote_key", "bsq"),
    itemKey: readResultStoreItemKey(row.item_key, "item_key"),
    itemName: readResultText(row.item_name, "item_name", 1, 200),
    quantity: readResultInteger(row.quantity, "quantity", 1, 100_000),
    countryCode: readResultCode(
      row.country_code,
      "country_code",
      COUNTRY_CODE,
    ),
    itemCurrencyCode: readResultCode(
      row.item_currency_code,
      "item_currency_code",
      CURRENCY_CODE,
    ),
    settlementCurrencyCode: readResultCode(
      row.settlement_currency_code,
      "settlement_currency_code",
      CURRENCY_CODE,
    ),
    baseUnitPrice: readResultNumber(row.base_unit_price, "base_unit_price"),
    inflationMultiplier: readResultNumber(
      row.inflation_multiplier,
      "inflation_multiplier",
    ),
    locationMultiplier: readResultNumber(
      row.location_multiplier,
      "location_multiplier",
    ),
    scarcityMultiplier: readResultNumber(
      row.scarcity_multiplier,
      "scarcity_multiplier",
    ),
    itemLocalFinalUnitPrice: readResultNumber(
      row.item_local_final_unit_price,
      "item_local_final_unit_price",
    ),
    itemLocalFinalTotalPrice: readResultNumber(
      row.item_local_final_total_price,
      "item_local_final_total_price",
    ),
    exchangeRate: readResultNumber(row.exchange_rate, "exchange_rate"),
    finalUnitPrice: readResultNumber(row.final_unit_price, "final_unit_price"),
    finalTotalPrice: readResultNumber(
      row.final_total_price,
      "final_total_price",
    ),
    pricingVersion: readResultText(
      row.pricing_version,
      "pricing_version",
      1,
      120,
    ),
    expiresAt: readResultTimestamp(row.expires_at, "expires_at"),
    replayed: readResultBoolean(row.replayed, "replayed"),
  };
}

export function toBusinessStoreReceipt(
  row: Record<string, unknown>,
): BusinessStoreReceiptDto {
  return {
    businessKey: readResultPublicKey(row.business_key, "business_key", "biz"),
    receiptKey: readResultPublicKey(row.receipt_key, "receipt_key", "bsr"),
    quoteKey: readResultPublicKey(row.quote_key, "quote_key", "bsq"),
    itemKey: readResultStoreItemKey(row.item_key, "item_key"),
    itemName: readResultText(row.item_name, "item_name", 1, 200),
    quantity: readResultInteger(row.quantity, "quantity", 1, 100_000),
    finalUnitPrice: readResultNumber(row.final_unit_price, "final_unit_price"),
    finalTotalPrice: readResultNumber(
      row.final_total_price,
      "final_total_price",
    ),
    currencyCode: readResultCode(
      row.currency_code,
      "currency_code",
      CURRENCY_CODE,
    ),
    warehouseQuantityOwned: readResultNumber(
      row.warehouse_quantity_owned,
      "warehouse_quantity_owned",
    ),
    warehouseAverageUnitCost: readResultNumber(
      row.warehouse_average_unit_cost,
      "warehouse_average_unit_cost",
    ),
    completedAt: readResultTimestamp(row.completed_at, "completed_at"),
    alreadyCompleted: readResultBoolean(
      row.already_completed,
      "already_completed",
    ),
  };
}

function readStoreItemKey(value: unknown): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!STORE_ITEM_KEY.test(result)) {
    throw invalidRequest("itemKey is invalid.");
  }
  return result;
}

function readPublicKey(
  value: unknown,
  field: string,
  prefix: string,
): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!PUBLIC_KEY.test(result) || !result.startsWith(`${prefix}_`)) {
    throw invalidRequest(`${field} is invalid.`);
  }
  return result;
}

function readIdempotencyKey(value: unknown): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!IDEMPOTENCY_KEY.test(result)) {
    throw invalidRequest("idempotencyKey is invalid.");
  }
  return result;
}

function readInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const result = Number(value);
  if (
    !Number.isInteger(result) || result < minimum || result > maximum
  ) {
    throw invalidRequest(`${field} must be an integer between ${minimum} and ${maximum}.`);
  }
  return result;
}

function readOptionalTimestamp(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 64) {
    throw invalidRequest(`${field} must be an ISO timestamp.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw invalidRequest(`${field} must be an ISO timestamp.`);
  }
  return parsed.toISOString();
}

function readResultPublicKey(
  value: unknown,
  field: string,
  prefix: string,
): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!PUBLIC_KEY.test(result) || !result.startsWith(`${prefix}_`)) {
    throw invalidResult(field);
  }
  return result;
}

function readResultStoreItemKey(value: unknown, field: string): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!STORE_ITEM_KEY.test(result)) throw invalidResult(field);
  return result;
}

function readResultText(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < minimum || result.length > maximum) {
    throw invalidResult(field);
  }
  return result;
}

function readResultCode(
  value: unknown,
  field: string,
  pattern: RegExp,
): string {
  const result = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!pattern.test(result)) throw invalidResult(field);
  return result;
}

function readResultNumber(value: unknown, field: string): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw invalidResult(field);
  return result;
}

function readResultInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const result = readResultNumber(value, field);
  if (!Number.isInteger(result) || result < minimum || result > maximum) {
    throw invalidResult(field);
  }
  return result;
}

function readResultBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw invalidResult(field);
  return value;
}

function readResultTimestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length > 64) {
    throw invalidResult(field);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw invalidResult(field);
  return parsed.toISOString();
}

function invalidRequest(message: string): PlayerBusinessError {
  return new PlayerBusinessError(
    "invalid_business_store_request",
    message,
    400,
  );
}

function invalidResult(field: string): PlayerBusinessError {
  return new PlayerBusinessError(
    "business_store_result_invalid",
    `Business Store result field is invalid: ${field}.`,
    500,
  );
}
