export interface SettleBusinessStoreOfferCommand {
  readonly gameSessionId: string;
  readonly buyerPlayerId: string;
  readonly offerKey: string;
  readonly quoteKey: string;
  readonly quantity: number;
  readonly expectedOfferVersion: number;
  readonly idempotencyKey: string;
}

export interface BusinessStoreOfferReceiptDto {
  readonly receiptKey: string;
  readonly quoteKey: string;
  readonly offerKey: string;
  readonly businessKey: string;
  readonly sellerPartyKey: string;
  readonly catalogItemKey: string;
  readonly canonicalItemKey: string;
  readonly storeItemKey: string;
  readonly buyerInventoryAccountKey: string;
  readonly inventoryTransactionKey: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly totalPrice: number;
  readonly currencyCode: string;
  readonly buyerDebit: number;
  readonly businessCredit: number;
  readonly grossRevenue: number;
  readonly costOfGoodsSold: number;
  readonly grossMargin: number;
  readonly sourceUnitCost: number;
  readonly costCurrencyCode: string;
  readonly offerVersionBefore: number;
  readonly offerVersionAfter: number;
  readonly remainingListedQuantity: number;
  readonly completedAt: string;
  readonly replayed: boolean;
}

export interface StoreOfferSettlementRepository {
  settleBusinessOffer(
    command: SettleBusinessStoreOfferCommand,
  ): Promise<BusinessStoreOfferReceiptDto>;
}

export class StoreOfferSettlementContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "StoreOfferSettlementContractError";
    this.code = code;
  }
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const PUBLIC = {
  receipt: /^spr_[0-9a-f]{32}$/u,
  quote: /^quote_[0-9a-f]{32}$/u,
  offer: /^sof_[0-9a-f]{32}$/u,
  business: /^biz_[0-9a-f]{32}$/u,
  party: /^pty_[0-9a-f]{32}$/u,
  item: /^itm_[0-9a-f]{32}$/u,
  inventoryAccount: /^iac_[0-9a-f]{32}$/u,
  inventoryTransaction: /^itx_[0-9a-f]{32}$/u,
  canonicalItem: /^[a-z0-9][a-z0-9._-]{0,159}$/u,
  storeItem: /^[a-z0-9_-]{1,64}$/u,
  currency: /^[A-Z0-9_]{3,16}$/u,
} as const;
const RECEIPT_FIELDS = [
  "receiptKey",
  "quoteKey",
  "offerKey",
  "businessKey",
  "sellerPartyKey",
  "catalogItemKey",
  "canonicalItemKey",
  "storeItemKey",
  "buyerInventoryAccountKey",
  "inventoryTransactionKey",
  "quantity",
  "unitPrice",
  "totalPrice",
  "currencyCode",
  "buyerDebit",
  "businessCredit",
  "grossRevenue",
  "costOfGoodsSold",
  "grossMargin",
  "sourceUnitCost",
  "costCurrencyCode",
  "offerVersionBefore",
  "offerVersionAfter",
  "remainingListedQuantity",
  "completedAt",
  "replayed",
] as const;

export function normalizeBusinessStoreOfferSettlementCommand(
  value: SettleBusinessStoreOfferCommand,
): SettleBusinessStoreOfferCommand {
  const key = typeof value.idempotencyKey === "string"
    ? value.idempotencyKey.trim()
    : "";
  if (key.length < 8 || key.length > 160) {
    commandFail("idempotencyKey must contain 8 to 160 characters.");
  }
  return {
    gameSessionId: commandPattern(value.gameSessionId, UUID, "gameSessionId"),
    buyerPlayerId: commandPattern(value.buyerPlayerId, UUID, "buyerPlayerId"),
    offerKey: commandPattern(value.offerKey, PUBLIC.offer, "offerKey"),
    quoteKey: commandPattern(value.quoteKey, PUBLIC.quote, "quoteKey"),
    quantity: boundedQuantity(
      value.quantity,
      "quantity",
      "invalid_store_offer_settlement_command",
    ),
    expectedOfferVersion: positiveInteger(
      value.expectedOfferVersion,
      "expectedOfferVersion",
      "invalid_store_offer_settlement_command",
    ),
    idempotencyKey: key,
  };
}

export function parseBusinessStoreOfferReceipt(
  value: unknown,
): BusinessStoreOfferReceiptDto {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    resultFail("Receipt must be an object.");
  }
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row).sort();
  const expectedKeys = [...RECEIPT_FIELDS].sort();
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    resultFail("Receipt fields must match the public contract exactly.");
  }
  const nonnegativeMoneyFields = [
    "unitPrice",
    "totalPrice",
    "buyerDebit",
    "businessCredit",
    "grossRevenue",
    "costOfGoodsSold",
    "sourceUnitCost",
  ] as const;
  const amounts = Object.fromEntries(
    nonnegativeMoneyFields.map((field) => [
      field,
      exactMoney(row[field], field),
    ]),
  ) as Record<(typeof nonnegativeMoneyFields)[number], number> & {
    grossMargin: number;
  };
  amounts.grossMargin = exactMoney(row.grossMargin, "grossMargin", true);
  const quantity = positiveInteger(
    row.quantity,
    "quantity",
    "invalid_store_offer_settlement_contract",
  );
  const before = positiveInteger(
    row.offerVersionBefore,
    "offerVersionBefore",
    "invalid_store_offer_settlement_contract",
  );
  const after = positiveInteger(
    row.offerVersionAfter,
    "offerVersionAfter",
    "invalid_store_offer_settlement_contract",
  );
  if (
    after !== before + 1 ||
    amounts.unitPrice <= 0 || amounts.totalPrice <= 0 ||
    amounts.totalPrice !== round4(amounts.unitPrice * quantity) ||
    amounts.totalPrice !== round2(amounts.totalPrice) ||
    amounts.costOfGoodsSold !== round4(amounts.sourceUnitCost * quantity) ||
    amounts.totalPrice !== amounts.buyerDebit ||
    amounts.totalPrice !== amounts.businessCredit ||
    amounts.totalPrice !== amounts.grossRevenue ||
    amounts.grossMargin !==
      round4(amounts.grossRevenue - amounts.costOfGoodsSold)
  ) resultFail("Receipt economic invariants are inconsistent.");
  const completedAt = typeof row.completedAt === "string" &&
      Number.isFinite(Date.parse(row.completedAt))
    ? new Date(row.completedAt).toISOString()
    : resultFail("completedAt must be an ISO timestamp.");
  const currencyCode = resultPattern(
    row.currencyCode,
    PUBLIC.currency,
    "currencyCode",
  );
  const costCurrencyCode = resultPattern(
    row.costCurrencyCode,
    PUBLIC.currency,
    "costCurrencyCode",
  );
  if (costCurrencyCode !== currencyCode) {
    resultFail("Receipt cost and settlement currency must match.");
  }
  return {
    receiptKey: resultPattern(row.receiptKey, PUBLIC.receipt, "receiptKey"),
    quoteKey: resultPattern(row.quoteKey, PUBLIC.quote, "quoteKey"),
    offerKey: resultPattern(row.offerKey, PUBLIC.offer, "offerKey"),
    businessKey: resultPattern(row.businessKey, PUBLIC.business, "businessKey"),
    sellerPartyKey: resultPattern(
      row.sellerPartyKey,
      PUBLIC.party,
      "sellerPartyKey",
    ),
    catalogItemKey: resultPattern(
      row.catalogItemKey,
      PUBLIC.item,
      "catalogItemKey",
    ),
    canonicalItemKey: resultPattern(
      row.canonicalItemKey,
      PUBLIC.canonicalItem,
      "canonicalItemKey",
    ),
    storeItemKey: resultPattern(
      row.storeItemKey,
      PUBLIC.storeItem,
      "storeItemKey",
    ),
    buyerInventoryAccountKey: resultPattern(
      row.buyerInventoryAccountKey,
      PUBLIC.inventoryAccount,
      "buyerInventoryAccountKey",
    ),
    inventoryTransactionKey: resultPattern(
      row.inventoryTransactionKey,
      PUBLIC.inventoryTransaction,
      "inventoryTransactionKey",
    ),
    quantity,
    unitPrice: amounts.unitPrice,
    totalPrice: amounts.totalPrice,
    currencyCode,
    buyerDebit: amounts.buyerDebit,
    businessCredit: amounts.businessCredit,
    grossRevenue: amounts.grossRevenue,
    costOfGoodsSold: amounts.costOfGoodsSold,
    grossMargin: amounts.grossMargin,
    sourceUnitCost: amounts.sourceUnitCost,
    costCurrencyCode,
    offerVersionBefore: before,
    offerVersionAfter: after,
    remainingListedQuantity: nonnegativeInteger(
      row.remainingListedQuantity,
      "remainingListedQuantity",
    ),
    completedAt,
    replayed: typeof row.replayed === "boolean"
      ? row.replayed
      : resultFail("replayed must be boolean."),
  };
}

function commandPattern(value: unknown, regex: RegExp, label: string): string {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!regex.test(text)) commandFail(`${label} has an invalid format.`);
  return text;
}
function resultPattern(value: unknown, regex: RegExp, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!regex.test(text)) resultFail(`${label} has an invalid format.`);
  return text;
}
function positiveInteger(value: unknown, label: string, code: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new StoreOfferSettlementContractError(
      code,
      `${label} must be a bounded positive integer.`,
    );
  }
  return value;
}
function boundedQuantity(value: unknown, label: string, code: string): number {
  const number = positiveInteger(value, label, code);
  if (number > 1_000_000) {
    throw new StoreOfferSettlementContractError(
      code,
      `${label} must not exceed 1000000.`,
    );
  }
  return number;
}
function nonnegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    resultFail(`${label} must be a non-negative integer.`);
  }
  return value;
}
function exactMoney(value: unknown, label: string, negative = false): number {
  if (
    typeof value !== "number" || !Number.isFinite(value) ||
    value !== round4(value) || (!negative && value < 0)
  ) {
    resultFail(`${label} must be an exact value with at most four decimals.`);
  }
  return value;
}
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}
function commandFail(message: string): never {
  throw new StoreOfferSettlementContractError(
    "invalid_store_offer_settlement_command",
    message,
  );
}
function resultFail(message: string): never {
  throw new StoreOfferSettlementContractError(
    "invalid_store_offer_settlement_contract",
    message,
  );
}
