export const BUSINESS_PHASE10_CHECKPOINT = "BUSINESS-V2-10A1" as const;

export const STORE_PURCHASE_SETTLEMENT_RECEIPT_KEY_PATTERN =
  /^spr_[0-9a-f]{32}$/u;
export const STORE_SELLER_OFFER_KEY_PATTERN = /^sof_[0-9a-f]{32}$/u;
export const STORE_PUBLIC_QUOTE_KEY_PATTERN = /^quote_[0-9a-f]{32}$/u;
export const BUSINESS_PUBLIC_KEY_PATTERN = /^biz_[0-9a-f]{32}$/u;
export const ECONOMIC_PARTY_PUBLIC_KEY_PATTERN = /^pty_[0-9a-f]{32}$/u;
export const INVENTORY_ACCOUNT_PUBLIC_KEY_PATTERN = /^iac_[0-9a-f]{32}$/u;
export const INVENTORY_TRANSACTION_PUBLIC_KEY_PATTERN =
  /^itx_[0-9a-f]{32}$/u;
export const CANONICAL_ITEM_KEY_PATTERN =
  /^[a-z0-9][a-z0-9._-]{0,159}$/u;
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export const CURRENCY_CODE_PATTERN = /^[A-Z0-9_]{3,16}$/u;

export const STORE_PURCHASE_SETTLEMENT_ADVISORY_LOCK =
  "idempotency_advisory_lock" as const;

export const STORE_PURCHASE_SETTLEMENT_ROW_LOCK_ORDER = Object.freeze([
  "seller_offer",
  "store_listing_holding",
  "buyer_checking",
  "business_cash",
  "buyer_inventory",
  "economic_posting",
  "purchase_receipt",
  "offer_completion",
] as const);

export type StorePurchaseSettlementRowLock =
  (typeof STORE_PURCHASE_SETTLEMENT_ROW_LOCK_ORDER)[number];

export interface TrustedStorePurchaseSettlementScope {
  readonly gameSessionId: string;
  readonly buyerPlayerId: string;
}

export interface StorePurchaseSettlementBrowserIntent {
  readonly offerKey: string;
  readonly quoteKey: string;
  readonly quantity: number;
  readonly expectedOfferVersion: number;
  readonly idempotencyKey: string;
  readonly clientSubmittedAt: string | null;
}

export type StorePurchaseSettlementCommand =
  TrustedStorePurchaseSettlementScope &
  StorePurchaseSettlementBrowserIntent;

export interface StorePurchaseSettlementReceipt {
  readonly receiptKey: string;
  readonly quoteKey: string;
  readonly offerKey: string;
  readonly businessKey: string;
  readonly sellerPartyKey: string;
  readonly canonicalItemKey: string;
  readonly buyerInventoryAccountKey: string;
  readonly inventoryTransactionKey: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly finalTotalPrice: number;
  readonly currencyCode: string;
  readonly buyerDebitAmount: number;
  readonly sellerCreditAmount: number;
  readonly grossRevenue: number;
  readonly costOfGoodsSold: number;
  readonly offerVersionBefore: number;
  readonly offerVersionAfter: number;
  readonly remainingListedQuantity: number;
  readonly buyerInventoryQuantityOwned: number;
  readonly completedAt: string;
  readonly replayed: boolean;
}

export class StorePurchaseSettlementContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "StorePurchaseSettlementContractError";
    this.code = code;
  }
}

export function normalizeStorePurchaseSettlementCommand(
  value: StorePurchaseSettlementCommand,
): StorePurchaseSettlementCommand {
  const idempotencyKey =
    typeof value.idempotencyKey === "string"
      ? value.idempotencyKey.trim()
      : "";
  if (idempotencyKey.length < 8 || idempotencyKey.length > 160) {
    invalidCommand("idempotencyKey must contain 8 to 160 characters.");
  }

  const clientSubmittedAt =
    value.clientSubmittedAt === null
      ? null
      : readTimestamp(value.clientSubmittedAt, "clientSubmittedAt");

  return {
    gameSessionId: readPattern(
      value.gameSessionId,
      UUID_PATTERN,
      "gameSessionId",
      true,
    ),
    buyerPlayerId: readPattern(
      value.buyerPlayerId,
      UUID_PATTERN,
      "buyerPlayerId",
      true,
    ),
    offerKey: readPattern(
      value.offerKey,
      STORE_SELLER_OFFER_KEY_PATTERN,
      "offerKey",
      true,
    ),
    quoteKey: readPattern(
      value.quoteKey,
      STORE_PUBLIC_QUOTE_KEY_PATTERN,
      "quoteKey",
      true,
    ),
    quantity: readPositiveInteger(value.quantity, "quantity"),
    expectedOfferVersion: readPositiveInteger(
      value.expectedOfferVersion,
      "expectedOfferVersion",
    ),
    idempotencyKey,
    clientSubmittedAt,
  };
}

export function parseStorePurchaseSettlementReceipt(
  value: unknown,
): StorePurchaseSettlementReceipt {
  const row = requireRecord(value, "Store purchase settlement receipt");

  const quantity = readPositiveInteger(row.quantity, "quantity");
  const unitPrice = readMoney(row.unitPrice, "unitPrice");
  const finalTotalPrice = readMoney(
    row.finalTotalPrice,
    "finalTotalPrice",
  );
  const expectedTotal = roundMoney(unitPrice * quantity);
  if (finalTotalPrice !== expectedTotal) {
    invalidReceipt(
      "finalTotalPrice must equal unitPrice multiplied by quantity.",
    );
  }

  const buyerDebitAmount = readMoney(
    row.buyerDebitAmount,
    "buyerDebitAmount",
  );
  const sellerCreditAmount = readMoney(
    row.sellerCreditAmount,
    "sellerCreditAmount",
  );
  const grossRevenue = readMoney(row.grossRevenue, "grossRevenue");
  if (
    buyerDebitAmount !== finalTotalPrice ||
    sellerCreditAmount !== finalTotalPrice ||
    grossRevenue !== finalTotalPrice
  ) {
    invalidReceipt(
      "Buyer debit, seller credit, and gross revenue must equal the final total price.",
    );
  }

  const offerVersionBefore = readPositiveInteger(
    row.offerVersionBefore,
    "offerVersionBefore",
  );
  const offerVersionAfter = readPositiveInteger(
    row.offerVersionAfter,
    "offerVersionAfter",
  );
  if (offerVersionAfter !== offerVersionBefore + 1) {
    invalidReceipt(
      "offerVersionAfter must advance exactly once from offerVersionBefore.",
    );
  }

  return {
    receiptKey: readPattern(
      row.receiptKey,
      STORE_PURCHASE_SETTLEMENT_RECEIPT_KEY_PATTERN,
      "receiptKey",
      true,
    ),
    quoteKey: readPattern(
      row.quoteKey,
      STORE_PUBLIC_QUOTE_KEY_PATTERN,
      "quoteKey",
      true,
    ),
    offerKey: readPattern(
      row.offerKey,
      STORE_SELLER_OFFER_KEY_PATTERN,
      "offerKey",
      true,
    ),
    businessKey: readPattern(
      row.businessKey,
      BUSINESS_PUBLIC_KEY_PATTERN,
      "businessKey",
      true,
    ),
    sellerPartyKey: readPattern(
      row.sellerPartyKey,
      ECONOMIC_PARTY_PUBLIC_KEY_PATTERN,
      "sellerPartyKey",
      true,
    ),
    canonicalItemKey: readPattern(
      row.canonicalItemKey,
      CANONICAL_ITEM_KEY_PATTERN,
      "canonicalItemKey",
      true,
    ),
    buyerInventoryAccountKey: readPattern(
      row.buyerInventoryAccountKey,
      INVENTORY_ACCOUNT_PUBLIC_KEY_PATTERN,
      "buyerInventoryAccountKey",
      true,
    ),
    inventoryTransactionKey: readPattern(
      row.inventoryTransactionKey,
      INVENTORY_TRANSACTION_PUBLIC_KEY_PATTERN,
      "inventoryTransactionKey",
      true,
    ),
    quantity,
    unitPrice,
    finalTotalPrice,
    currencyCode: readPattern(
      row.currencyCode,
      CURRENCY_CODE_PATTERN,
      "currencyCode",
      false,
    ),
    buyerDebitAmount,
    sellerCreditAmount,
    grossRevenue,
    costOfGoodsSold: readMoney(
      row.costOfGoodsSold,
      "costOfGoodsSold",
    ),
    offerVersionBefore,
    offerVersionAfter,
    remainingListedQuantity: readNonNegativeInteger(
      row.remainingListedQuantity,
      "remainingListedQuantity",
    ),
    buyerInventoryQuantityOwned: readNonNegativeInteger(
      row.buyerInventoryQuantityOwned,
      "buyerInventoryQuantityOwned",
    ),
    completedAt: readTimestamp(row.completedAt, "completedAt"),
    replayed: readBoolean(row.replayed, "replayed"),
  };
}

export function assertStorePurchaseSettlementLockOrder(
  value: readonly string[] = STORE_PURCHASE_SETTLEMENT_ROW_LOCK_ORDER,
): void {
  if (value.length !== STORE_PURCHASE_SETTLEMENT_ROW_LOCK_ORDER.length) {
    invalidLockOrder("Settlement lock order has an unexpected number of rows.");
  }
  for (
    let index = 0;
    index < STORE_PURCHASE_SETTLEMENT_ROW_LOCK_ORDER.length;
    index += 1
  ) {
    if (value[index] !== STORE_PURCHASE_SETTLEMENT_ROW_LOCK_ORDER[index]) {
      invalidLockOrder(
        `Settlement lock order diverges at position ${index + 1}.`,
      );
    }
  }
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) {
    throw new StorePurchaseSettlementContractError(
      "invalid_store_purchase_money",
      "Money must be finite.",
    );
  }
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StorePurchaseSettlementContractError(
      "invalid_store_purchase_contract",
      `${label} must be an object.`,
    );
  }
  return value as Record<string, unknown>;
}

function readPattern(
  value: unknown,
  pattern: RegExp,
  label: string,
  lowercase: boolean,
): string {
  const text =
    typeof value === "string"
      ? value.trim()
      : "";
  const normalized = lowercase ? text.toLowerCase() : text.toUpperCase();
  if (!pattern.test(normalized)) {
    throw new StorePurchaseSettlementContractError(
      "invalid_store_purchase_contract",
      `${label} has an invalid public format.`,
    );
  }
  return normalized;
}

function readPositiveInteger(value: unknown, label: string): number {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 1) {
    throw new StorePurchaseSettlementContractError(
      "invalid_store_purchase_contract",
      `${label} must be a positive integer.`,
    );
  }
  return numberValue;
}

function readNonNegativeInteger(value: unknown, label: string): number {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new StorePurchaseSettlementContractError(
      "invalid_store_purchase_contract",
      `${label} must be a non-negative integer.`,
    );
  }
  return numberValue;
}

function readMoney(value: unknown, label: string): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new StorePurchaseSettlementContractError(
      "invalid_store_purchase_contract",
      `${label} must be a non-negative finite number.`,
    );
  }
  return roundMoney(numberValue);
}

function readTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new StorePurchaseSettlementContractError(
      "invalid_store_purchase_contract",
      `${label} must be an ISO timestamp.`,
    );
  }
  return new Date(value).toISOString();
}

function readBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new StorePurchaseSettlementContractError(
      "invalid_store_purchase_contract",
      `${label} must be boolean.`,
    );
  }
  return value;
}

function invalidCommand(message: string): never {
  throw new StorePurchaseSettlementContractError(
    "invalid_store_purchase_settlement_command",
    message,
  );
}

function invalidReceipt(message: string): never {
  throw new StorePurchaseSettlementContractError(
    "invalid_store_purchase_settlement_receipt",
    message,
  );
}

function invalidLockOrder(message: string): never {
  throw new StorePurchaseSettlementContractError(
    "invalid_store_purchase_settlement_lock_order",
    message,
  );
}
