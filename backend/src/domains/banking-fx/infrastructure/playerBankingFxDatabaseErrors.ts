import { PlayerBankingFxError } from "../contracts/playerBankingFxContracts.ts";

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

const ERROR_MAPPINGS: readonly ErrorMapping[] = [
  mapping(
    ["FX_LIQUIDITY_UNAVAILABLE"],
    "FX_LIQUIDITY_UNAVAILABLE",
    409,
    "FX liquidity is currently unavailable.",
    true,
  ),
  mapping(
    ["FX_QUOTE_EXPIRED"],
    "FX_QUOTE_EXPIRED",
    409,
    "The FX quote has expired.",
  ),
  mapping(
    ["FX_QUOTE_SOURCE_PRECISION_INVALID"],
    "FX_QUOTE_SOURCE_PRECISION_INVALID",
    400,
    "The source amount exceeds the selected currency's minor-unit precision.",
  ),
  mapping(
    ["FX_QUOTE_TARGET_ROUNDS_TO_ZERO"],
    "FX_QUOTE_TARGET_ROUNDS_TO_ZERO",
    409,
    "The source amount is too small to produce a target-currency credit.",
  ),
  mapping(
    ["FX_RATE_VERSION_STALE"],
    "FX_RATE_VERSION_STALE",
    409,
    "The FX rate version is no longer current.",
    true,
  ),
  mapping(
    ["FX_QUOTE_CONSUMED", "FUNDING_QUOTE_CONSUMED"],
    "FX_QUOTE_CONSUMED",
    409,
    "The FX quote has already been consumed.",
  ),
  mapping(
    [
      "FX_QUOTE_CONFLICT",
      "FX_QUOTE_ACCOUNT_CONFLICT",
      "FUNDING_QUOTE_CONFLICT",
      "IDEMPOTENCY_KEY_CONFLICT",
    ],
    "FX_QUOTE_CONFLICT",
    409,
    "The idempotency key conflicts with an existing FX request.",
  ),
  mapping(
    [
      "FUNDING_INSUFFICIENT",
      "INSUFFICIENT_FUNDS",
      "FX_INSUFFICIENT_FUNDS",
      "AVAILABLE_BALANCE_INSUFFICIENT",
    ],
    "FUNDING_INSUFFICIENT",
    409,
    "Available Checking funds are insufficient.",
  ),
  mapping(
    ["FX_QUOTE_NOT_FOUND"],
    "FX_QUOTE_NOT_FOUND",
    404,
    "The FX quote was not found.",
  ),
  mapping(
    ["FX_ORDER_NOT_FOUND"],
    "FX_ORDER_NOT_FOUND",
    404,
    "The FX order was not found.",
  ),
  mapping(
    ["BANK_ACCOUNT_NOT_FOUND", "FX_ACCOUNT_NOT_FOUND"],
    "BANK_ACCOUNT_NOT_FOUND",
    404,
    "The selected bank account was not found.",
  ),
  mapping(
    [
      "BANK_ACCOUNT_CLOSED",
      "BANK_ACCOUNT_UNAVAILABLE",
      "ACCOUNT_NOT_ACTIVE",
      "SAVINGS_ACCOUNT_NOT_ALLOWED",
    ],
    "BANK_ACCOUNT_UNAVAILABLE",
    409,
    "The selected Checking account is unavailable for FX.",
  ),
  mapping(
    [
      "FX_ORDER_NOT_CANCELLABLE",
      "FX_ORDER_CANCELLATION_NOT_ALLOWED",
      "FX_ORDER_ALREADY_CLAIMED",
    ],
    "FX_ORDER_NOT_CANCELLABLE",
    409,
    "The FX order can no longer be cancelled.",
  ),
  mapping(
    ["FX_PRODUCT_MISMATCH", "FX_QUOTE_PRODUCT_MISMATCH"],
    "FX_PRODUCT_MISMATCH",
    409,
    "The FX quote cannot be used for this settlement product.",
  ),
  mapping(
    ["FX_SAME_CURRENCY_NOT_REQUIRED"],
    "FX_SAME_CURRENCY_NOT_REQUIRED",
    409,
    "The selected currencies do not require an FX order.",
  ),
  mapping(
    ["FX_RATE_CURRENCY_INVALID"],
    "FX_RATE_VERSION_STALE",
    409,
    "The selected currency is no longer available at the accepted fixing.",
    true,
  ),
  mapping(
    ["PLAYER_SCOPE_REQUIRED", "PLAYER_SESSION_SCOPE_REQUIRED"],
    "player_session_required",
    401,
    "A valid Player session is required.",
  ),
  mapping(
    ["PLAYER_NOT_FOUND"],
    "player_not_found",
    404,
    "The Player was not found in this game.",
  ),
];

export function mapPlayerBankingFxDatabaseError(
  error: DatabaseError,
): PlayerBankingFxError {
  const source = [error.code, error.message, error.details, error.hint]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toUpperCase();
  const matched = ERROR_MAPPINGS.find(({ aliases }) =>
    aliases.some((alias) => containsCode(source, alias))
  );
  return matched
    ? new PlayerBankingFxError(
      matched.publicCode,
      matched.message,
      matched.status,
      matched.retryable ?? false,
    )
    : new PlayerBankingFxError(
      "player_banking_fx_service_unavailable",
      "Player FX is temporarily unavailable.",
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
  return new RegExp(`(?:^|[^A-Z0-9_])${code}(?:$|[^A-Z0-9_])`, "u").test(
    source,
  );
}
