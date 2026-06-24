import type {
  CreateStoreItemInput,
  NormalizedCreateStoreItemInput,
  NormalizedUpdateStoreItemInput,
  StoreItemStatus,
  StoreItemVisibility,
  UpdateStoreItemInput,
} from "../contracts/storeCatalogContracts.ts";

export class StoreCatalogValidationError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "StoreCatalogValidationError";
    this.code = code;
    this.details = details;
  }
}

export function normalizeCreateStoreItemInput(
  input: CreateStoreItemInput,
): NormalizedCreateStoreItemInput {
  const name = normalizeRequiredText(input.name, "name");

  return {
    gameSessionId: normalizeRequiredUuid(input.gameSessionId, "gameSessionId"),
    itemKey: normalizeItemKey(input.itemKey ?? buildItemKeyFromName(name)),
    name,
    description: normalizeNullableText(input.description),
    category: normalizeCategory(input.category ?? "general"),
    price: normalizeNonNegativeMoney(input.price ?? 0, "price"),
    currencyCode: normalizeRequiredCurrencyCode(input.currencyCode),
    stockQuantity: normalizeNonNegativeInteger(
      input.stockQuantity ?? 0,
      "stockQuantity",
    ),
    status: normalizeStatus(input.status ?? "active"),
    visibility: normalizeVisibility(input.visibility ?? "visible"),
    sortOrder: normalizeInteger(input.sortOrder ?? 0, "sortOrder"),
  };
}

export function normalizeUpdateStoreItemInput(
  input: UpdateStoreItemInput,
): NormalizedUpdateStoreItemInput {
  const values: NormalizedUpdateStoreItemInput["values"] = {};

  if (input.name !== undefined) {
    values.name = normalizeRequiredText(input.name, "name");
  }

  if (input.description !== undefined) {
    values.description = normalizeNullableText(input.description);
  }

  if (input.category !== undefined && input.category !== null) {
    values.category = normalizeCategory(input.category);
  }

  if (input.price !== undefined && input.price !== null) {
    values.price = normalizeNonNegativeMoney(input.price, "price");
  }

  if (input.currencyCode !== undefined && input.currencyCode !== null) {
    values.currencyCode = normalizeCurrencyCode(input.currencyCode);
  }

  if (input.stockQuantity !== undefined && input.stockQuantity !== null) {
    values.stockQuantity = normalizeNonNegativeInteger(
      input.stockQuantity,
      "stockQuantity",
    );
  }

  if (input.status !== undefined && input.status !== null) {
    values.status = normalizeStatus(input.status);
  }

  if (input.visibility !== undefined && input.visibility !== null) {
    values.visibility = normalizeVisibility(input.visibility);
  }

  if (input.sortOrder !== undefined && input.sortOrder !== null) {
    values.sortOrder = normalizeInteger(input.sortOrder, "sortOrder");
  }

  return {
    gameSessionId: normalizeRequiredUuid(input.gameSessionId, "gameSessionId"),
    itemId: normalizeRequiredUuid(input.itemId, "itemId"),
    values,
  };
}

export function buildItemKeyFromName(name: string): string {
  const itemKey = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);

  if (!itemKey) {
    throw new StoreCatalogValidationError(
      "invalid_store_item_key",
      "Store item key could not be generated from the item name.",
    );
  }

  return itemKey;
}

function normalizeRequiredUuid(value: string, fieldName: string): string {
  const normalizedValue = value.trim().toLowerCase();

  if (!isUuid(normalizedValue)) {
    throw new StoreCatalogValidationError(
      "invalid_store_uuid",
      `${fieldName} must be a UUID.`,
    );
  }

  return normalizedValue;
}

function normalizeRequiredText(value: string | null | undefined, fieldName: string): string {
  const normalizedValue = value?.trim() ?? "";

  if (!normalizedValue) {
    throw new StoreCatalogValidationError(
      "required_store_text",
      `${fieldName} is required.`,
    );
  }

  return normalizedValue;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const normalizedValue = value?.trim() ?? "";
  return normalizedValue || null;
}

function normalizeItemKey(value: string): string {
  const normalizedValue = value.trim().toLowerCase();

  if (!/^[a-z0-9_-]{1,64}$/.test(normalizedValue)) {
    throw new StoreCatalogValidationError(
      "invalid_store_item_key",
      "itemKey must be 1 to 64 lowercase letters, numbers, underscores, or hyphens.",
    );
  }

  return normalizedValue;
}

function normalizeCategory(value: string): string {
  const normalizedValue = value.trim().toLowerCase();

  if (!/^[a-z0-9_-]{1,32}$/.test(normalizedValue)) {
    throw new StoreCatalogValidationError(
      "invalid_store_category",
      "category must be 1 to 32 lowercase letters, numbers, underscores, or hyphens.",
    );
  }

  return normalizedValue;
}

const OFFICIAL_STORE_CURRENCY_CODES = new Set([
  "NRC",
  "YRC",
  "THD",
  "SLV",
  "ELD",
  "VAL",
  "LUM",
  "SYN",
  "XAL",
  "DRV",
]);

function normalizeRequiredCurrencyCode(value: string | null | undefined): string {
  const normalizedValue = value?.trim().toUpperCase() ?? "";

  if (!normalizedValue) {
    throw new StoreCatalogValidationError(
      "required_store_currency",
      "currencyCode is required.",
    );
  }

  return normalizeCurrencyCode(normalizedValue);
}

function normalizeCurrencyCode(value: string): string {
  const normalizedValue = value.trim().toUpperCase();

  if (!/^[A-Z0-9]{3,16}$/.test(normalizedValue)) {
    throw new StoreCatalogValidationError(
      "invalid_store_currency",
      "currencyCode must be 3 to 16 uppercase letters or numbers.",
    );
  }

  if (!OFFICIAL_STORE_CURRENCY_CODES.has(normalizedValue)) {
    throw new StoreCatalogValidationError(
      "unsupported_store_currency",
      "currencyCode must be one of the official Econovaria country currencies.",
      {
        allowedCurrencyCodes: Array.from(OFFICIAL_STORE_CURRENCY_CODES),
      },
    );
  }

  return normalizedValue;
}

function normalizeNonNegativeMoney(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new StoreCatalogValidationError(
      "invalid_store_money_amount",
      `${fieldName} must be a non-negative number.`,
    );
  }

  return Math.round(value * 100) / 100;
}

function normalizeNonNegativeInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new StoreCatalogValidationError(
      "invalid_store_integer",
      `${fieldName} must be a non-negative integer.`,
    );
  }

  return value;
}

function normalizeInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value)) {
    throw new StoreCatalogValidationError(
      "invalid_store_integer",
      `${fieldName} must be an integer.`,
    );
  }

  return value;
}

function normalizeStatus(value: StoreItemStatus): StoreItemStatus {
  if (value !== "active" && value !== "disabled" && value !== "archived") {
    throw new StoreCatalogValidationError(
      "invalid_store_status",
      "status must be active, disabled, or archived.",
    );
  }

  return value;
}

function normalizeVisibility(value: StoreItemVisibility): StoreItemVisibility {
  if (value !== "visible" && value !== "hidden") {
    throw new StoreCatalogValidationError(
      "invalid_store_visibility",
      "visibility must be visible or hidden.",
    );
  }

  return value;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );
}
