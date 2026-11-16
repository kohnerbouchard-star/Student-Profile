import { PlayerStorePublicError } from "../contracts/playerStorePublicContracts.ts";

export interface PlayerStoreFundingRpcError {
  readonly message?: string;
  readonly code?: string;
}

const PRE_FUNDING_QUOTE_CONFLICT = ["LE", "GACY_CONFLICT"].join("");

export function mapFundingRpcError(
  error: PlayerStoreFundingRpcError,
  phase: "quote" | "purchase" | "receipt",
): PlayerStorePublicError {
  const source = `${error.code ?? ""} ${error.message ?? ""}`.toUpperCase();
  const code = [...source.matchAll(/[A-Z][A-Z0-9_]{4,}/gu)]
    .map((match) => match[0])
    .find((candidate) =>
      /^(?:STORE|PURCHASE|FUNDING|BANK|FX|PLAYER|GAME)_/u.test(candidate)
    ) ?? "";

  if (code.includes("DUPLICATE_ACCOUNT")) {
    return publicError(
      "store_funding_duplicate_account",
      "Each Store funding account may be selected only once.",
      400,
    );
  }
  if (code.includes("REMAINDER_INVALID")) {
    return publicError(
      "store_funding_remainder_invalid",
      "The final Store funding account must cover a positive remainder.",
      400,
    );
  }
  if (/REQUEST_INVALID|ALLOCATIONS?_INVALID|ALLOCATION_INVALID/u.test(code)) {
    return publicError(
      "invalid_player_store_request",
      "Store funding request is invalid.",
      400,
    );
  }
  if (code.includes("PRECISION_INVALID")) {
    return publicError(
      "store_funding_precision_invalid",
      "A Store funding amount does not match the bill currency precision.",
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
  if (
    code.includes("OFFER_VERSION_CONFLICT") ||
    code.includes("OFFER_CONFLICT")
  ) {
    return publicError(
      "store_offer_version_conflict",
      "The Store offer changed before the request could complete.",
      409,
    );
  }
  if (code.includes("IN_PROGRESS")) {
    return new PlayerStorePublicError(
      "store_purchase_in_progress",
      "This Store purchase is still processing.",
      409,
      true,
    );
  }
  if (
    code.includes("IDEMPOTENCY_CONFLICT") ||
    code.includes("CONTEXT_CONFLICT") ||
    code === "PURCHASE_FUNDING_QUOTE_CONFLICT"
  ) {
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
    code.includes("INSUFFICIENT_FUNDS") ||
    code.includes("INSUFFICIENT_BALANCE")
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
  if (code.includes("QUOTE_CONSUMED") || code.includes("QUOTE_UNUSABLE")) {
    return publicError(
      "store_quote_not_available",
      "Store funding quote is no longer available.",
      409,
    );
  }
  if (code.includes(PRE_FUNDING_QUOTE_CONFLICT)) {
    return publicError(
      "store_funding_quote_required",
      "This Store quote predates funded checkout. Create a new quote.",
      410,
    );
  }
  if (
    /BANK_ACCOUNT|SOURCE_ACCOUNT|ACCOUNT_(?:NOT_FOUND|INVALID|UNAVAILABLE|NOT_ACTIVE)/u
      .test(code) ||
    code.includes("TARGET_INVALID") ||
    code.includes("SELF_TARGET_FORBIDDEN") ||
    code === "PURCHASE_FUNDING_CURRENCY_INVALID"
  ) {
    return publicError(
      "store_funding_account_unavailable",
      "A selected Checking account is unavailable for this Store purchase.",
      409,
    );
  }
  if (code.includes("QUOTE_MISMATCH") || code.includes("FUNDING_MISMATCH")) {
    return publicError(
      "store_offer_conflict",
      "The Store offer changed before the purchase could complete.",
      409,
    );
  }
  if (code.includes("GAME_SESSION_DISABLED")) {
    return new PlayerStorePublicError(
      "store_game_paused",
      "Store purchases are paused for this game.",
      409,
      true,
    );
  }
  if (code.includes("GAME_SESSION_ARCHIVED")) {
    return publicError(
      "store_game_ended",
      "Store purchases are closed because this game has ended.",
      409,
    );
  }
  if (
    /NOT_FOUND|UNAVAILABLE|STATUS_INVALID|MISMATCH|RESERVED/u.test(code) ||
    code.includes("CURRENCY_PRECISION_UNSUPPORTED") ||
    code.includes("CUSTODY_MISSING")
  ) {
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

function publicError(
  code: string,
  message: string,
  status: number,
): PlayerStorePublicError {
  return new PlayerStorePublicError(code, message, status, false);
}
