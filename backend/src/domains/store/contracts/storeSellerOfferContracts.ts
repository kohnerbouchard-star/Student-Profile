export type StoreSellerKind = "seeded" | "npc" | "business";
export type StoreSellerOfferStatus = "draft" | "active" | "paused" | "retired";

export interface StoreSellerOfferDto {
  readonly offerKey: string;
  readonly sellerKey: string;
  readonly sellerKind: StoreSellerKind;
  readonly sellerName: string;
  readonly unitPrice: number;
  readonly currencyCode: string;
  readonly availableQuantity: number;
  readonly status: StoreSellerOfferStatus;
  readonly version: number;
}

export interface StoreCatalogOfferGroupDto {
  readonly catalogItemKey: string;
  readonly canonicalItemKey: string;
  readonly storeItemKey: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string;
  readonly currencyCode: string;
  readonly bestUnitPrice: number | null;
  readonly totalAvailableQuantity: number;
  readonly sellerCount: number;
  readonly offerCount: number;
  readonly offers: readonly StoreSellerOfferDto[];
  readonly updatedAt: string;
}

export interface StoreSellerOfferRepository {
  listCatalogOfferGroups(
    gameSessionId: string,
  ): Promise<readonly StoreCatalogOfferGroupDto[]>;
}

export class StoreSellerOfferContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "StoreSellerOfferContractError";
    this.code = code;
  }
}

export function parseStoreCatalogOfferGroupRow(
  value: unknown,
): StoreCatalogOfferGroupDto {
  const row = requireRecord(value, "catalog offer group");
  const offersValue = row.offers;
  if (!Array.isArray(offersValue)) {
    throw contractError("invalid_store_offer_group", "offers must be an array.");
  }

  const offers = offersValue.map(parseStoreSellerOfferRow);
  const offerCount = readInteger(row.offer_count, "offer_count");
  if (offerCount !== offers.length) {
    throw contractError(
      "invalid_store_offer_group",
      "offer_count must match the number of public offer details.",
    );
  }

  const sellerCount = readInteger(row.seller_count, "seller_count");
  const availableSellerKeys = new Set(
    offers
      .filter((offer) => offer.availableQuantity > 0)
      .map((offer) => offer.sellerKey),
  );
  if (sellerCount !== availableSellerKeys.size) {
    throw contractError(
      "invalid_store_offer_group",
      "seller_count must match available public sellers.",
    );
  }

  const totalAvailableQuantity = readInteger(
    row.total_available_quantity,
    "total_available_quantity",
  );
  const derivedAvailableQuantity = offers.reduce(
    (sum, offer) => sum + offer.availableQuantity,
    0,
  );
  if (totalAvailableQuantity !== derivedAvailableQuantity) {
    throw contractError(
      "invalid_store_offer_group",
      "total_available_quantity must match canonical offer availability.",
    );
  }

  const bestUnitPrice = readNullableMoney(row.best_unit_price, "best_unit_price");
  const availableOffers = offers.filter((offer) =>
    offer.availableQuantity > 0
  );
  const availableCurrencies = new Set(
    availableOffers.map((offer) => offer.currencyCode),
  );
  const derivedBestPrice = availableOffers.length &&
      availableCurrencies.size === 1
    ? Math.min(...availableOffers.map((offer) => offer.unitPrice))
    : null;
  if (bestUnitPrice !== derivedBestPrice) {
    throw contractError(
      "invalid_store_offer_group",
      "best_unit_price must match a single-currency available offer set and must be null for mixed currencies.",
    );
  }

  return {
    catalogItemKey: readPattern(
      row.catalog_item_key,
      /^itm_[0-9a-f]{32}$/u,
      "catalog_item_key",
    ),
    canonicalItemKey: readPattern(
      row.canonical_item_key,
      /^[a-z0-9][a-z0-9._-]{0,159}$/u,
      "canonical_item_key",
    ),
    storeItemKey: readPattern(
      row.store_item_key,
      /^[a-z0-9_-]{1,64}$/u,
      "store_item_key",
    ),
    name: readText(row.name, "name"),
    description: readNullableText(row.description, "description"),
    category: readPattern(
      row.category,
      /^[a-z0-9_-]{1,32}$/u,
      "category",
    ),
    currencyCode: readPattern(
      row.currency_code,
      /^[A-Z0-9]{3,16}$/u,
      "currency_code",
    ),
    bestUnitPrice,
    totalAvailableQuantity,
    sellerCount,
    offerCount,
    offers,
    updatedAt: readTimestamp(row.updated_at, "updated_at"),
  };
}

function parseStoreSellerOfferRow(value: unknown): StoreSellerOfferDto {
  const row = requireRecord(value, "seller offer");
  const sellerKind = readText(row.sellerKind, "sellerKind");
  if (!isSellerKind(sellerKind)) {
    throw contractError(
      "invalid_store_seller_offer",
      "sellerKind must be seeded, npc, or business.",
    );
  }

  const status = readText(row.status, "status");
  if (!isOfferStatus(status) || status !== "active") {
    throw contractError(
      "invalid_store_seller_offer",
      "Aggregated offers must be active.",
    );
  }

  return {
    offerKey: readPattern(
      row.offerKey,
      /^sof_[0-9a-f]{32}$/u,
      "offerKey",
    ),
    sellerKey: readPattern(
      row.sellerKey,
      /^pty_[0-9a-f]{32}$/u,
      "sellerKey",
    ),
    sellerKind,
    sellerName: readText(row.sellerName, "sellerName"),
    unitPrice: readMoney(row.unitPrice, "unitPrice"),
    currencyCode: readPattern(
      row.currencyCode,
      /^[A-Z0-9]{3,16}$/u,
      "currencyCode",
    ),
    availableQuantity: readInteger(
      row.availableQuantity,
      "availableQuantity",
    ),
    status,
    version: readPositiveInteger(row.version, "version"),
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw contractError(
      "invalid_store_offer_contract",
      `${label} must be an object.`,
    );
  }
  return value as Record<string, unknown>;
}

function readText(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw contractError("invalid_store_offer_contract", `${label} is required.`);
  }
  return text;
}

function readNullableText(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw contractError(
      "invalid_store_offer_contract",
      `${label} must be text or null.`,
    );
  }
  return value;
}

function readPattern(value: unknown, pattern: RegExp, label: string): string {
  const text = readText(value, label);
  if (!pattern.test(text)) {
    throw contractError(
      "invalid_store_offer_contract",
      `${label} has an invalid public format.`,
    );
  }
  return text;
}

function readMoney(value: unknown, label: string): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw contractError(
      "invalid_store_offer_contract",
      `${label} must be a non-negative finite number.`,
    );
  }
  return numberValue;
}

function readNullableMoney(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  return readMoney(value, label);
}

function readInteger(value: unknown, label: string): number {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw contractError(
      "invalid_store_offer_contract",
      `${label} must be a non-negative integer.`,
    );
  }
  return numberValue;
}

function readPositiveInteger(value: unknown, label: string): number {
  const numberValue = readInteger(value, label);
  if (numberValue < 1) {
    throw contractError(
      "invalid_store_offer_contract",
      `${label} must be positive.`,
    );
  }
  return numberValue;
}

function readTimestamp(value: unknown, label: string): string {
  const text = readText(value, label);
  if (!Number.isFinite(Date.parse(text))) {
    throw contractError(
      "invalid_store_offer_contract",
      `${label} must be an ISO timestamp.`,
    );
  }
  return new Date(text).toISOString();
}

function isSellerKind(value: string): value is StoreSellerKind {
  return value === "seeded" || value === "npc" || value === "business";
}

function isOfferStatus(value: string): value is StoreSellerOfferStatus {
  return value === "draft" || value === "active" || value === "paused" || value === "retired";
}

function contractError(
  code: string,
  message: string,
): StoreSellerOfferContractError {
  return new StoreSellerOfferContractError(code, message);
}
