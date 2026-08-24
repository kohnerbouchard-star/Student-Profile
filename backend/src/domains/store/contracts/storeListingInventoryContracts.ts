import type { StoreSellerOfferStatus } from "./storeSellerOfferContracts.ts";

export interface StockBusinessStoreOfferCommand {
  readonly gameSessionId: string;
  readonly businessKey: string;
  readonly offerKey: string;
  readonly quantity: number;
  readonly expectedOfferVersion: number;
  readonly idempotencyKey: string;
}

export interface StockBusinessStoreOfferResult {
  readonly offerKey: string;
  readonly offerStatus: Exclude<StoreSellerOfferStatus, "retired">;
  readonly offerVersion: number;
  readonly inventoryAccountKey: string;
  readonly transactionKey: string;
  readonly quantityAdded: number;
  readonly listedQuantity: number;
  readonly availableQuantity: number;
  readonly averageUnitCost: number;
  readonly costCurrencyCode: string;
  readonly replayed: boolean;
}

export interface StoreListingInventoryRepository {
  stockBusinessOffer(
    command: StockBusinessStoreOfferCommand,
  ): Promise<StockBusinessStoreOfferResult>;
}

export class StoreListingInventoryContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "StoreListingInventoryContractError";
    this.code = code;
  }
}

export function normalizeStockBusinessStoreOfferCommand(
  value: StockBusinessStoreOfferCommand,
): StockBusinessStoreOfferCommand {
  const gameSessionId = value.gameSessionId.trim().toLowerCase();
  const businessKey = value.businessKey.trim().toLowerCase();
  const offerKey = value.offerKey.trim().toLowerCase();
  const idempotencyKey = value.idempotencyKey.trim();

  requirePattern(
    gameSessionId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    "gameSessionId",
  );
  requirePattern(businessKey, /^biz_[0-9a-f]{32}$/u, "businessKey");
  requirePattern(offerKey, /^sof_[0-9a-f]{32}$/u, "offerKey");
  requirePositiveInteger(value.quantity, "quantity");
  requirePositiveInteger(value.expectedOfferVersion, "expectedOfferVersion");
  if (idempotencyKey.length < 8 || idempotencyKey.length > 160) {
    throw contractError(
      "invalid_store_listing_command",
      "idempotencyKey must contain 8 to 160 characters.",
    );
  }

  return {
    gameSessionId,
    businessKey,
    offerKey,
    quantity: value.quantity,
    expectedOfferVersion: value.expectedOfferVersion,
    idempotencyKey,
  };
}

export function parseStockBusinessStoreOfferResult(
  value: unknown,
): StockBusinessStoreOfferResult {
  const row = requireRecord(value, "stock result");
  const offerStatus = requireText(row.offerStatus, "offerStatus");
  if (
    offerStatus !== "draft" &&
    offerStatus !== "active" &&
    offerStatus !== "paused"
  ) {
    throw contractError(
      "invalid_store_listing_result",
      "offerStatus must be draft, active, or paused.",
    );
  }

  const quantityAdded = requirePositiveInteger(row.quantityAdded, "quantityAdded");
  const listedQuantity = requireNonNegativeInteger(
    row.listedQuantity,
    "listedQuantity",
  );
  const availableQuantity = requireNonNegativeInteger(
    row.availableQuantity,
    "availableQuantity",
  );
  if (availableQuantity > listedQuantity || quantityAdded > listedQuantity) {
    throw contractError(
      "invalid_store_listing_result",
      "Canonical listed and available quantities are inconsistent.",
    );
  }

  return {
    offerKey: requirePattern(
      row.offerKey,
      /^sof_[0-9a-f]{32}$/u,
      "offerKey",
    ),
    offerStatus,
    offerVersion: requirePositiveInteger(row.offerVersion, "offerVersion"),
    inventoryAccountKey: requirePattern(
      row.inventoryAccountKey,
      /^iac_[0-9a-f]{32}$/u,
      "inventoryAccountKey",
    ),
    transactionKey: requirePattern(
      row.transactionKey,
      /^itx_[0-9a-f]{32}$/u,
      "transactionKey",
    ),
    quantityAdded,
    listedQuantity,
    availableQuantity,
    averageUnitCost: requireMoney(row.averageUnitCost, "averageUnitCost"),
    costCurrencyCode: requirePattern(
      row.costCurrencyCode,
      /^[A-Z0-9_]{3,16}$/u,
      "costCurrencyCode",
    ),
    replayed: requireBoolean(row.replayed, "replayed"),
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw contractError(
      "invalid_store_listing_contract",
      `${label} must be an object.`,
    );
  }
  return value as Record<string, unknown>;
}

function requireText(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw contractError(
      "invalid_store_listing_contract",
      `${label} is required.`,
    );
  }
  return text;
}

function requirePattern(
  value: unknown,
  pattern: RegExp,
  label: string,
): string {
  const text = requireText(value, label);
  if (!pattern.test(text)) {
    throw contractError(
      "invalid_store_listing_contract",
      `${label} has an invalid public format.`,
    );
  }
  return text;
}

function requirePositiveInteger(value: unknown, label: string): number {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 1) {
    throw contractError(
      "invalid_store_listing_contract",
      `${label} must be a positive integer.`,
    );
  }
  return numberValue;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw contractError(
      "invalid_store_listing_contract",
      `${label} must be a non-negative integer.`,
    );
  }
  return numberValue;
}

function requireMoney(value: unknown, label: string): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw contractError(
      "invalid_store_listing_contract",
      `${label} must be a non-negative finite number.`,
    );
  }
  return numberValue;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw contractError(
      "invalid_store_listing_contract",
      `${label} must be boolean.`,
    );
  }
  return value;
}

function contractError(
  code: string,
  message: string,
): StoreListingInventoryContractError {
  return new StoreListingInventoryContractError(code, message);
}
