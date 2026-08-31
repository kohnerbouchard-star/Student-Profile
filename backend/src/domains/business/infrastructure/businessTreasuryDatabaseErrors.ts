import { BusinessTreasuryError } from "../contracts/businessTreasuryContracts.ts";

interface DatabaseError {
  readonly code?: string;
  readonly message?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

interface ErrorMapping {
  readonly aliases: readonly string[];
  readonly publicCode: string;
  readonly status: number;
  readonly message: string;
  readonly retryable?: boolean;
}

const MAPPINGS: readonly ErrorMapping[] = [
  mapping(
    ["PLAYER_SCOPE_REQUIRED", "PLAYER_SESSION_SCOPE_REQUIRED"],
    "player_session_required",
    401,
    "A valid Player session is required.",
  ),
  mapping(
    ["BUSINESS_CONTROLLER_REQUIRED", "BUSINESS_OWNER_REQUIRED"],
    "business_controller_required",
    403,
    "This Player cannot manage the selected Business treasury.",
  ),
  mapping(
    ["BUSINESS_NOT_FOUND"],
    "business_not_found",
    404,
    "An active Business was not found for this Player.",
  ),
  mapping(
    ["BUSINESS_OWNERSHIP_AMBIGUOUS", "BUSINESS_SELECTION_REQUIRED"],
    "business_selection_required",
    409,
    "Select one Business before managing its treasury.",
  ),
  mapping(
    ["BANK_ACCOUNT_NOT_FOUND", "FX_ACCOUNT_NOT_FOUND"],
    "business_treasury_account_not_found",
    404,
    "The selected Business Checking account was not found.",
  ),
  mapping(
    ["BANK_ACCOUNT_CURRENCY_INVALID"],
    "business_treasury_currency_invalid",
    400,
    "The selected currency is unavailable for a Business Checking account.",
  ),
  mapping(
    [
      "BANK_ACCOUNT_CLOSED",
      "BANK_ACCOUNT_UNAVAILABLE",
      "BANK_ACCOUNT_NOT_ACTIVE",
      "ACCOUNT_NOT_ACTIVE",
      "SAVINGS_ACCOUNT_NOT_ALLOWED",
      "BUSINESS_ACCOUNT_OWNER_INVALID",
    ],
    "business_treasury_account_unavailable",
    409,
    "The selected Business Checking account is unavailable.",
  ),
  mapping(
    [
      "IDEMPOTENCY_KEY_CONFLICT",
      "BUSINESS_BANK_ACCOUNT_IDEMPOTENCY_CONFLICT",
      "FX_QUOTE_CONFLICT",
      "FX_QUOTE_ACCOUNT_CONFLICT",
    ],
    "business_treasury_idempotency_conflict",
    409,
    "This idempotency key was already used for different treasury intent.",
  ),
  mapping(
    ["FX_QUOTE_EXPIRED"],
    "business_fx_quote_expired",
    409,
    "The Business FX quote has expired.",
  ),
  mapping(
    ["FX_QUOTE_NOT_FOUND"],
    "business_fx_quote_not_found",
    404,
    "The Business FX quote was not found.",
  ),
  mapping(
    ["FX_QUOTE_PRODUCT_MISMATCH"],
    "business_fx_quote_product_mismatch",
    409,
    "The Business FX quote cannot be used for this product.",
  ),
  mapping(
    ["FX_QUOTE_CONSUMED"],
    "business_fx_quote_consumed",
    409,
    "The Business FX quote has already been consumed.",
  ),
  mapping(
    ["FX_SAME_CURRENCY_NOT_REQUIRED"],
    "business_fx_same_currency_not_required",
    409,
    "Business FX requires different source and destination currencies.",
  ),
  mapping(
    ["FX_QUOTE_TARGET_ROUNDS_TO_ZERO"],
    "business_fx_target_rounds_to_zero",
    400,
    "The source amount is too small for the destination currency precision.",
  ),
  mapping(
    ["FX_FIXING_NOT_FOUND", "FX_FIXING_VALUE_NOT_FOUND"],
    "business_fx_fixing_unavailable",
    409,
    "A current FX fixing is unavailable for the selected currencies.",
    true,
  ),
  mapping(
    [
      "BANK_ACCOUNT_REQUEST_INVALID",
      "BUSINESS_BANK_ACCOUNT_REQUEST_INVALID",
      "FX_QUOTE_REQUEST_INVALID",
      "FX_ORDER_REQUEST_INVALID",
      "FX_ORDER_CANCEL_REQUEST_INVALID",
    ],
    "invalid_business_treasury_request",
    400,
    "The Business treasury request is invalid.",
  ),
  mapping(
    ["FX_ORDER_NOT_FOUND"],
    "business_fx_order_not_found",
    404,
    "The Business FX order was not found.",
  ),
  mapping(
    [
      "FX_ORDER_NOT_CANCELLABLE",
      "FX_ORDER_CANCELLATION_NOT_ALLOWED",
      "FX_ORDER_ALREADY_CLAIMED",
    ],
    "business_fx_order_not_cancellable",
    409,
    "The Business FX order can no longer be cancelled.",
  ),
  mapping(
    ["FX_ORDER_STATE_NOT_FOUND", "FX_ORDER_STATE_CONFLICT"],
    "business_fx_order_state_conflict",
    409,
    "The Business FX order state changed. Refresh the treasury and try again.",
  ),
  mapping(
    ["FX_QUOTE_SOURCE_PRECISION_INVALID"],
    "business_fx_source_precision_invalid",
    400,
    "The source amount exceeds the selected currency precision.",
  ),
  mapping(
    ["FX_RATE_VERSION_STALE", "FX_RATE_CURRENCY_INVALID"],
    "business_fx_rate_stale",
    409,
    "The accepted FX fixing is no longer current.",
    true,
  ),
  mapping(
    [
      "FUNDING_INSUFFICIENT",
      "INSUFFICIENT_FUNDS",
      "FX_INSUFFICIENT_FUNDS",
      "AVAILABLE_BALANCE_INSUFFICIENT",
    ],
    "business_treasury_insufficient_balance",
    409,
    "Available Business Checking funds are insufficient.",
  ),
  mapping(
    ["FX_LIQUIDITY_UNAVAILABLE", "FX_FACILITY_CAPACITY_UNAVAILABLE"],
    "business_fx_liquidity_unavailable",
    409,
    "Business FX liquidity is currently unavailable.",
    true,
  ),
];

export function mapBusinessTreasuryDatabaseError(
  error: DatabaseError,
): BusinessTreasuryError {
  const source = [error.code, error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ").toUpperCase();
  const match = MAPPINGS.find(({ aliases }) =>
    aliases.some((alias) => containsCode(source, alias))
  );
  return match
    ? new BusinessTreasuryError(
      match.publicCode,
      match.message,
      match.status,
      match.retryable ?? false,
    )
    : new BusinessTreasuryError(
      "business_treasury_service_unavailable",
      "Business treasury is temporarily unavailable.",
      503,
      true,
    );
}

function mapping(
  aliases: readonly string[],
  publicCode: string,
  status: number,
  message: string,
  retryable = false,
): ErrorMapping {
  return { aliases, publicCode, status, message, retryable };
}

function containsCode(source: string, code: string): boolean {
  return new RegExp(`(?:^|[^A-Z0-9_])${code}(?:$|[^A-Z0-9_])`, "u")
    .test(source);
}
