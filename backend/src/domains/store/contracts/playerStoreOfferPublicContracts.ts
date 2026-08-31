import type { BusinessStoreOfferQuoteDto } from "./storeOfferQuoteContracts.ts";
import type { BusinessStoreOfferReceiptDto } from "./storeOfferSettlementContracts.ts";
import type { StoreCatalogOfferGroupDto } from "./storeSellerOfferContracts.ts";

export const PLAYER_STORE_OFFER_KEY_PATTERN = /^sof_[0-9a-f]{32}$/u;
export const PLAYER_STORE_OFFER_QUOTE_KEY_PATTERN = /^quote_[0-9a-f]{32}$/u;
export const PLAYER_STORE_OFFER_RECEIPT_KEY_PATTERN = /^spr_[0-9a-f]{32}$/u;

export type PlayerStoreOfferPublicSellerKind =
  | "seeded"
  | "npc"
  | "business";

export type PlayerStoreOfferPublicPurchasability =
  | "system_offer"
  | "business_offer";

export interface PlayerStoreOfferPublicOfferDto {
  readonly offerKey: string;
  readonly sellerKind: PlayerStoreOfferPublicSellerKind;
  readonly sellerPartyKey: string;
  readonly sellerName: string;
  readonly businessKey: string | null;
  readonly businessName: string | null;
  readonly unitPrice: number;
  readonly currencyCode: string;
  readonly availableQuantity: number;
  readonly status: "active";
  readonly purchasability: PlayerStoreOfferPublicPurchasability;
  readonly purchasable: boolean;
  readonly version: number;
}

/**
 * Offer-only product projection. Retained seeded item fields remain owned by
 * PlayerStorePublicItemDto and are combined at the authenticated HTTP boundary.
 */
export interface PlayerStoreOfferPublicProductDto {
  readonly catalogItemKey: string;
  readonly canonicalItemKey: string;
  readonly storeItemKey: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string;
  readonly currencyCode: string;
  readonly bestOfferKey: string | null;
  readonly bestUnitPrice: number | null;
  readonly totalAvailableQuantity: number;
  readonly sellerCount: number;
  readonly offerCount: number;
  readonly offers: readonly PlayerStoreOfferPublicOfferDto[];
  readonly updatedAt: string;
}

export interface PlayerStoreOfferPublicQuoteDto {
  readonly quoteKey: string;
  readonly quoteStatus: "created" | "used" | "expired" | "cancelled";
  readonly offerKey: string;
  readonly offerVersion: number;
  readonly businessKey: string;
  readonly businessName: string;
  readonly sellerPartyKey: string;
  readonly sellerName: string;
  readonly catalogItemKey: string;
  readonly canonicalItemKey: string;
  readonly storeItemKey: string;
  readonly quantity: number;
  readonly availableQuantityAtQuote: number;
  readonly unitPrice: number;
  readonly totalPrice: number;
  readonly currencyCode: string;
  readonly expiresAt: string;
  readonly pricingVersion: "business-offer-fixed-price-v2";
  readonly replayed: boolean;
}

export interface PlayerStoreOfferPublicReceiptDto {
  readonly receiptKey: string;
  readonly quoteKey: string;
  readonly offerKey: string;
  readonly businessKey: string;
  readonly businessName: string;
  readonly sellerPartyKey: string;
  readonly sellerName: string;
  readonly catalogItemKey: string;
  readonly canonicalItemKey: string;
  readonly storeItemKey: string;
  readonly inventoryTransactionKey: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly totalPrice: number;
  readonly sellerProceeds: number;
  readonly currencyCode: string;
  readonly offerVersionBefore: number;
  readonly offerVersionAfter: number;
  readonly remainingListedQuantity: number;
  readonly completedAt: string;
  readonly alreadyCompleted: boolean;
}

export interface PlayerStoreOfferPublicScope {
  readonly gameSessionId: string;
  readonly playerId: string;
}

export interface PlayerStoreOfferProductPublicRepository {
  listOfferProducts(
    scope: PlayerStoreOfferPublicScope,
  ): Promise<readonly PlayerStoreOfferPublicProductDto[]>;
}

/**
 * Combined pre-funding Business-offer port retained for regression coverage.
 * Live Player Store composition must use the read-only product port and the
 * funded command port separately.
 */
export interface PlayerStoreOfferPublicRepository
  extends PlayerStoreOfferProductPublicRepository {
  createBusinessOfferQuote(
    input: PlayerStoreOfferPublicScope & {
      readonly offerKey: string;
      readonly quantity: number;
      readonly expectedVersion: number;
      readonly idempotencyKey: string;
    },
  ): Promise<PlayerStoreOfferPublicQuoteDto>;

  purchaseBusinessOffer(
    input: PlayerStoreOfferPublicScope & {
      readonly offerKey: string;
      readonly quoteKey: string;
      readonly quantity: number;
      readonly expectedVersion: number;
      readonly idempotencyKey: string;
    },
  ): Promise<PlayerStoreOfferPublicReceiptDto>;

  readBusinessOfferReceipt(
    input: PlayerStoreOfferPublicScope & { readonly receiptKey: string },
  ): Promise<PlayerStoreOfferPublicReceiptDto>;
}

export interface PlayerStoreOfferPublicBusinessIdentity {
  readonly sellerPartyKey: string;
  /** Trusted server-only Business UUID. Never copy into a public DTO. */
  readonly businessId: string;
  readonly businessKey: string;
  readonly businessName: string;
  /** Trusted server-only ownership state. Never copy into a public DTO. */
  readonly ownerPlayerId: string;
  /** Trusted server-only lifecycle state. Never copy into a public DTO. */
  readonly businessStatus: "active" | "restructuring" | "distressed" | "closed";
  /** Trusted server-only settlement currency. Never copy into a public DTO. */
  readonly currencyCode: string;
}

export function businessSellerPartyKeys(
  groups: readonly StoreCatalogOfferGroupDto[],
): string[] {
  return [
    ...new Set(
      groups.flatMap((group) =>
        group.offers
          .filter((offer) => offer.sellerKind === "business")
          .map((offer) => offer.sellerKey)
      ),
    ),
  ].sort();
}

export function businessSellerOfferKeys(
  groups: readonly StoreCatalogOfferGroupDto[],
): string[] {
  return [
    ...new Set(
      groups.flatMap((group) =>
        group.offers
          .filter((offer) => offer.sellerKind === "business")
          .map((offer) => offer.offerKey)
      ),
    ),
  ].sort();
}

export function projectPlayerStoreOfferProduct(
  group: StoreCatalogOfferGroupDto,
  identities: ReadonlyMap<string, PlayerStoreOfferPublicBusinessIdentity>,
  buyerPlayerId: string,
  unreservedBusinessOfferKeys: ReadonlySet<string>,
  buyerOwnedBusinessIds: ReadonlySet<string>,
): PlayerStoreOfferPublicProductDto {
  const offers = group.offers.map((offer): PlayerStoreOfferPublicOfferDto => {
    const identity = offer.sellerKind === "business"
      ? identities.get(offer.sellerKey)
      : undefined;
    if (offer.sellerKind === "business" && !identity) {
      fail("Business seller identity is unavailable.");
    }
    const purchasable = offer.availableQuantity > 0 && (
      offer.sellerKind === "seeded" ||
      offer.sellerKind === "npc" ||
      (offer.sellerKind === "business" &&
        identity?.businessStatus === "active" &&
        identity.ownerPlayerId !== buyerPlayerId &&
        !buyerOwnedBusinessIds.has(identity.businessId) &&
        identity.currencyCode === offer.currencyCode &&
        unreservedBusinessOfferKeys.has(offer.offerKey))
    );
    return {
      offerKey: offer.offerKey,
      sellerKind: offer.sellerKind,
      sellerPartyKey: offer.sellerKey,
      sellerName: identity?.businessName ?? offer.sellerName,
      businessKey: identity?.businessKey ?? null,
      businessName: identity?.businessName ?? null,
      unitPrice: offer.unitPrice,
      currencyCode: offer.currencyCode,
      availableQuantity: offer.availableQuantity,
      status: "active",
      purchasability: offer.sellerKind === "business"
        ? "business_offer"
        : "system_offer",
      purchasable,
      version: offer.version,
    };
  });
  const purchasableOffers = offers.filter((offer) => offer.purchasable);
  const purchasableCurrencies = new Set(
    purchasableOffers.map((offer) => offer.currencyCode),
  );
  const bestOffer = purchasableOffers.length && purchasableCurrencies.size === 1
    ? purchasableOffers.reduce((best, offer) =>
      offer.unitPrice < best.unitPrice ||
        (offer.unitPrice === best.unitPrice && offer.offerKey < best.offerKey)
        ? offer
        : best
    )
    : null;
  return {
    catalogItemKey: group.catalogItemKey,
    canonicalItemKey: group.canonicalItemKey,
    storeItemKey: group.storeItemKey,
    name: group.name,
    description: group.description,
    category: group.category,
    currencyCode: group.currencyCode,
    bestOfferKey: bestOffer?.offerKey ?? null,
    bestUnitPrice: bestOffer?.unitPrice ?? null,
    totalAvailableQuantity: purchasableOffers.reduce(
      (total, offer) => total + offer.availableQuantity,
      0,
    ),
    sellerCount: new Set(
      purchasableOffers.map((offer) => offer.sellerPartyKey),
    ).size,
    offerCount: group.offerCount,
    offers,
    updatedAt: group.updatedAt,
  };
}

export function projectPlayerStoreOfferQuote(
  quote: BusinessStoreOfferQuoteDto,
  identity: PlayerStoreOfferPublicBusinessIdentity,
): PlayerStoreOfferPublicQuoteDto {
  return {
    quoteKey: quote.quoteKey,
    quoteStatus: quote.quoteStatus,
    offerKey: quote.offerKey,
    offerVersion: quote.offerVersion,
    businessKey: quote.businessKey,
    businessName: identity.businessName,
    sellerPartyKey: quote.sellerPartyKey,
    sellerName: identity.businessName,
    catalogItemKey: quote.catalogItemKey,
    canonicalItemKey: quote.canonicalItemKey,
    storeItemKey: quote.storeItemKey,
    quantity: quote.quantity,
    availableQuantityAtQuote: quote.availableQuantityAtQuote,
    unitPrice: quote.finalUnitPrice,
    totalPrice: quote.finalTotalPrice,
    currencyCode: quote.buyerCurrencyCode,
    expiresAt: quote.expiresAt,
    pricingVersion: quote.pricingVersion,
    replayed: quote.replayed,
  };
}

export function projectPlayerStoreOfferReceipt(
  receipt: BusinessStoreOfferReceiptDto,
  identity: PlayerStoreOfferPublicBusinessIdentity,
): PlayerStoreOfferPublicReceiptDto {
  return {
    receiptKey: receipt.receiptKey,
    quoteKey: receipt.quoteKey,
    offerKey: receipt.offerKey,
    businessKey: receipt.businessKey,
    businessName: identity.businessName,
    sellerPartyKey: receipt.sellerPartyKey,
    sellerName: identity.businessName,
    catalogItemKey: receipt.catalogItemKey,
    canonicalItemKey: receipt.canonicalItemKey,
    storeItemKey: receipt.storeItemKey,
    inventoryTransactionKey: receipt.inventoryTransactionKey,
    quantity: receipt.quantity,
    unitPrice: receipt.unitPrice,
    totalPrice: receipt.totalPrice,
    sellerProceeds: receipt.businessCredit,
    currencyCode: receipt.currencyCode,
    offerVersionBefore: receipt.offerVersionBefore,
    offerVersionAfter: receipt.offerVersionAfter,
    remainingListedQuantity: receipt.remainingListedQuantity,
    completedAt: receipt.completedAt,
    alreadyCompleted: receipt.replayed,
  };
}

export function parsePlayerStoreOfferBuyerReceiptRow(
  value: unknown,
): Omit<
  PlayerStoreOfferPublicReceiptDto,
  "businessName" | "sellerName" | "alreadyCompleted"
> {
  const row = record(value);
  const quantity = positiveInteger(row.quantity, "quantity");
  const unitPrice = money(row.unit_price, "unitPrice");
  const totalPrice = money(row.total_price, "totalPrice");
  if (totalPrice !== round4(unitPrice * quantity)) {
    fail("Invalid receipt total.");
  }
  const before = positiveInteger(
    row.offer_version_before,
    "offerVersionBefore",
  );
  const after = positiveInteger(row.offer_version_after, "offerVersionAfter");
  if (after !== before + 1) fail("Invalid receipt version.");
  return {
    receiptKey: pattern(
      row.public_key,
      PLAYER_STORE_OFFER_RECEIPT_KEY_PATTERN,
      "receiptKey",
    ),
    quoteKey: pattern(
      row.quote_key,
      PLAYER_STORE_OFFER_QUOTE_KEY_PATTERN,
      "quoteKey",
    ),
    offerKey: pattern(
      row.offer_key,
      PLAYER_STORE_OFFER_KEY_PATTERN,
      "offerKey",
    ),
    businessKey: pattern(
      row.business_key,
      /^biz_[0-9a-f]{32}$/u,
      "businessKey",
    ),
    sellerPartyKey: pattern(
      row.seller_party_key,
      /^pty_[0-9a-f]{32}$/u,
      "sellerPartyKey",
    ),
    catalogItemKey: pattern(
      row.catalog_item_key,
      /^itm_[0-9a-f]{32}$/u,
      "catalogItemKey",
    ),
    canonicalItemKey: pattern(
      row.canonical_item_key,
      /^[a-z0-9][a-z0-9._-]{0,159}$/u,
      "canonicalItemKey",
    ),
    storeItemKey: pattern(
      row.store_item_key,
      /^[a-z0-9_-]{1,64}$/u,
      "storeItemKey",
    ),
    inventoryTransactionKey: pattern(
      row.inventory_transaction_key,
      /^itx_[0-9a-f]{32}$/u,
      "inventoryTransactionKey",
    ),
    quantity,
    unitPrice,
    totalPrice,
    sellerProceeds: money(row.business_credit, "sellerProceeds"),
    currencyCode: pattern(
      row.currency_code,
      /^[A-Z0-9_]{3,16}$/u,
      "currencyCode",
    ),
    offerVersionBefore: before,
    offerVersionAfter: after,
    remainingListedQuantity: nonnegativeInteger(
      row.remaining_listed_quantity,
      "remainingListedQuantity",
    ),
    completedAt: timestamp(row.completed_at, "completedAt"),
  };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("Receipt row must be an object.");
  }
  return value as Record<string, unknown>;
}

function pattern(value: unknown, regex: RegExp, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!regex.test(text)) fail(`${label} is invalid.`);
  return text;
}

function positiveInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > 1_000_000) {
    fail(`${label} is invalid.`);
  }
  return number;
}

function nonnegativeInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) fail(`${label} is invalid.`);
  return number;
}

function money(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number !== round4(number)) {
    fail(`${label} is invalid.`);
  }
  return number;
}

function timestamp(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!Number.isFinite(Date.parse(text))) fail(`${label} is invalid.`);
  return new Date(text).toISOString();
}

function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function fail(message: string): never {
  throw new Error(message);
}
