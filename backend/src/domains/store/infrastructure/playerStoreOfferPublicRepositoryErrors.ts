import type { PlayerStoreOfferPublicScope } from "../contracts/playerStoreOfferPublicContracts.ts";
import { PLAYER_STORE_OFFER_RECEIPT_KEY_PATTERN } from "../contracts/playerStoreOfferPublicContracts.ts";
import { PlayerStorePublicError } from "../contracts/playerStorePublicContracts.ts";
import { StoreOfferQuoteContractError } from "../contracts/storeOfferQuoteContracts.ts";
import { StoreOfferSettlementContractError } from "../contracts/storeOfferSettlementContracts.ts";
import { StoreSellerOfferContractError } from "../contracts/storeSellerOfferContracts.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function normalizePlayerStoreOfferScope(
  input: PlayerStoreOfferPublicScope,
): PlayerStoreOfferPublicScope {
  const gameSessionId = String(input.gameSessionId ?? "").trim().toLowerCase();
  const playerId = String(input.playerId ?? "").trim().toLowerCase();
  if (!UUID.test(gameSessionId) || !UUID.test(playerId)) {
    throw playerStoreOfferUnavailable(
      "player_store_offer_scope_invalid",
      "Player Store offer scope is invalid.",
    );
  }
  return { gameSessionId, playerId };
}

export function normalizePlayerStoreOfferReceiptKey(value: unknown): string {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!PLAYER_STORE_OFFER_RECEIPT_KEY_PATTERN.test(key)) {
    throw new PlayerStorePublicError(
      "invalid_store_offer_receipt_key",
      "Store offer receipt key is invalid.",
      400,
      false,
    );
  }
  return key;
}

export function mapPlayerStoreOfferCatalogError(
  error: unknown,
): PlayerStorePublicError {
  if (error instanceof PlayerStorePublicError) return error;
  void (error instanceof StoreSellerOfferContractError);
  return playerStoreOfferUnavailable(
    "player_store_offer_catalog_failed",
    "Store offers could not be loaded.",
  );
}

type PublicErrorSpec = readonly [code: string, message: string, status: number];
const IDEMPOTENCY: PublicErrorSpec = [
  "store_idempotency_conflict",
  "This idempotency key was already used for another Store request.",
  409,
];
const SELF_PURCHASE: PublicErrorSpec = [
  "store_offer_self_purchase_forbidden",
  "A Player cannot purchase from their own Business.",
  403,
];
const QUOTE_ERRORS: Readonly<Record<string, PublicErrorSpec>> = {
  invalid_store_offer_quote_command: [
    "invalid_store_offer_quote",
    "Store offer quote request is invalid.",
    400,
  ],
  store_offer_quote_idempotency_conflict: IDEMPOTENCY,
  store_offer_quote_version_conflict: [
    "store_offer_version_conflict",
    "The Store offer changed before it could be quoted.",
    409,
  ],
  store_offer_quote_self_purchase_forbidden: SELF_PURCHASE,
  store_offer_quote_inventory_reserved: [
    "store_offer_inventory_reserved",
    "Store offer Inventory is currently reserved.",
    409,
  ],
  store_offer_quote_insufficient_stock: [
    "store_insufficient_stock",
    "Store offer stock is insufficient.",
    409,
  ],
};
const QUOTE_UNAVAILABLE = new Set([
  "store_offer_quote_offer_unavailable",
  "store_offer_quote_custody_unavailable",
  "store_offer_quote_catalog_unavailable",
  "store_offer_quote_party_unavailable",
  "store_offer_quote_buyer_country_unavailable",
]);

export function mapPlayerStoreOfferQuoteError(
  error: unknown,
): PlayerStorePublicError {
  if (error instanceof PlayerStorePublicError) return error;
  if (!(error instanceof StoreOfferQuoteContractError)) {
    return quoteFailure();
  }
  const spec = QUOTE_ERRORS[error.code] ??
    (QUOTE_UNAVAILABLE.has(error.code)
      ? ["store_offer_not_available", "Store offer is not available.", 409]
      : null);
  return spec ? publicError(spec) : quoteFailure();
}

const SETTLEMENT_ERRORS: Readonly<Record<string, PublicErrorSpec>> = {
  invalid_store_offer_settlement_command: [
    "invalid_store_offer_purchase",
    "Store offer purchase request is invalid.",
    400,
  ],
  store_offer_settlement_idempotency_conflict: IDEMPOTENCY,
  store_offer_settlement_insufficient_funds: [
    "store_insufficient_balance",
    "Available Checking funds are insufficient for this purchase.",
    409,
  ],
  store_offer_settlement_inventory_reserved: [
    "store_offer_inventory_reserved",
    "Store offer Inventory is currently reserved.",
    409,
  ],
  store_offer_settlement_insufficient_stock: [
    "store_insufficient_stock",
    "Store offer stock is insufficient.",
    409,
  ],
  store_offer_settlement_quote_expired: [
    "store_quote_expired",
    "Store offer quote has expired.",
    409,
  ],
  store_offer_settlement_self_purchase_forbidden: SELF_PURCHASE,
  store_offer_settlement_offer_conflict: [
    "store_offer_conflict",
    "Store offer changed before the purchase could complete.",
    409,
  ],
  store_offer_settlement_quote_unavailable: [
    "store_quote_not_available",
    "Store offer quote is not available.",
    409,
  ],
};
const SETTLEMENT_UNAVAILABLE = new Set([
  "store_offer_settlement_custody_unavailable",
  "store_offer_settlement_catalog_unavailable",
  "store_offer_settlement_party_unavailable",
  "store_offer_settlement_money_unavailable",
  "store_offer_settlement_inventory_unavailable",
]);

export function mapPlayerStoreOfferSettlementError(
  error: unknown,
): PlayerStorePublicError {
  if (error instanceof PlayerStorePublicError) return error;
  if (!(error instanceof StoreOfferSettlementContractError)) {
    return purchaseFailure();
  }
  const spec = SETTLEMENT_ERRORS[error.code] ??
    (SETTLEMENT_UNAVAILABLE.has(error.code)
      ? [
        "store_offer_purchase_unavailable",
        "Store offer purchase is not available.",
        409,
      ]
      : null);
  return spec ? publicError(spec) : purchaseFailure();
}

export function playerStoreOfferConflict(
  code: string,
  message: string,
): PlayerStorePublicError {
  return new PlayerStorePublicError(code, message, 409, false);
}

export function playerStoreOfferUnavailable(
  code: string,
  message: string,
): PlayerStorePublicError {
  return new PlayerStorePublicError(code, message, 500, false);
}

export function requiresPlayerStoreOfferFailureProbe(error: unknown): boolean {
  if (error instanceof StoreOfferQuoteContractError) {
    return error.code === "store_offer_quote_version_conflict" ||
      error.code === "store_offer_quote_offer_unavailable" ||
      error.code === "store_offer_quote_inventory_reserved" ||
      error.code === "store_offer_quote_insufficient_stock";
  }
  if (error instanceof StoreOfferSettlementContractError) {
    return error.code === "store_offer_settlement_offer_conflict" ||
      error.code === "store_offer_settlement_inventory_reserved" ||
      error.code === "store_offer_settlement_insufficient_stock";
  }
  return false;
}

function publicError([code, message, status]: PublicErrorSpec) {
  return new PlayerStorePublicError(code, message, status, false);
}

function quoteFailure() {
  return playerStoreOfferUnavailable(
    "player_store_offer_quote_failed",
    "Store offer quote could not be created.",
  );
}

function purchaseFailure() {
  return playerStoreOfferUnavailable(
    "player_store_offer_purchase_failed",
    "Store offer purchase could not be completed.",
  );
}
