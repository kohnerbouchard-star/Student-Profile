import { PlayerBusinessError } from "../contracts/playerBusinessContracts.ts";

export function mapPlayerBusinessDatabaseError(
  message: string,
): PlayerBusinessError {
  const mappings: Record<string, [number, string, boolean?]> = {
    PLAYER_SCOPE_REQUIRED: [401, "Player session scope is required."],
    PLAYER_NOT_FOUND: [404, "Player was not found in this game."],
    PLAYER_ECONOMIC_CONTEXT_REQUIRED: [
      409,
      "Player country and currency must be assigned first.",
    ],
    BUSINESS_NOT_FOUND: [
      404,
      "Business was not found or is not owned by this player.",
    ],
    PRODUCT_NOT_FOUND: [404, "Business product was not found."],
    EMPLOYEE_NOT_FOUND: [404, "Business employee was not found."],
    CAPACITY_EXCEEDED: [409, "The production run exceeds available capacity."],
    PRODUCTION_UNAFFORDABLE: [
      409,
      "Business funds are insufficient for this production run.",
    ],
    INSUFFICIENT_INPUT_INVENTORY: [
      409,
      "Business input inventory is insufficient.",
    ],
    BUSINESS_PRODUCTION_RECIPE_AMBIGUOUS: [
      409,
      "This product matches more than one canonical Business recipe.",
    ],
    BUSINESS_LABOR_REQUIREMENT_INVALID: [
      409,
      "The recipe labor requirement is not currently valid.",
    ],
    BUSINESS_LABOR_ROLE_COVERAGE_UNAVAILABLE: [
      409,
      "The Business does not have enough active workers in a required production role.",
    ],
    BUSINESS_LABOR_SKILL_UNAVAILABLE: [
      409,
      "The active workforce does not meet this recipe's skill requirement.",
    ],
    BUSINESS_LABOR_CAPACITY_UNAVAILABLE: [
      409,
      "The required workers do not have enough labor minutes available in the current payroll period.",
    ],
    BUSINESS_LABOR_RESERVATION_CONSUMPTION_CONFLICT: [
      409,
      "Production labor changed during settlement. Refresh before retrying.",
      true,
    ],
    WAGE_UNAFFORDABLE: [409, "The business cannot afford the proposed wage."],
    STALE_PRODUCT_VERSION: [
      409,
      "Product pricing changed. Reload before retrying.",
    ],
    CLOSED_BUSINESS_IMMUTABLE: [
      409,
      "A closed business cannot be reopened through this action.",
    ],
    BUSINESS_OPERATING_PERIOD_CLOSE_REQUIRED: [
      409,
      "The due Business operating period must close before this Business can close.",
    ],
    BUSINESS_OPERATING_PERIOD_CLOSE_PENDING: [
      409,
      "Active payroll and Store receipt processing must finish before this Business can close.",
    ],
    BUSINESS_OUTSTANDING_PAYROLL_LIABILITY: [
      409,
      "Unpaid payroll must be recovered before this Business can close.",
    ],
    BUSINESS_OUTSTANDING_TAX_LIABILITY: [
      409,
      "Assessed unpaid tax must be settled before this Business can close.",
    ],
    IDEMPOTENCY_KEY_CONFLICT: [
      409,
      "This idempotency key was already used for a different request.",
    ],
    BUSINESS_ALREADY_OWNED: [
      409,
      "Close the current business before creating another one.",
    ],
    BUSINESS_DIRECT_ACQUISITION_RETIRED: [
      410,
      "Direct Business acquisition is retired; use registered ownership transfers.",
    ],
    BUSINESS_CACHED_FINANCIAL_AUTHORITY_RETIRED: [
      410,
      "This cached Business financial mutation is retired.",
    ],
    BUSINESS_OWNERSHIP_TRANSFER_VALUATION_AUTHORITY_UNAVAILABLE: [
      410,
      "New ownership transfers require authoritative financial reporting.",
    ],
    BUSINESS_FORMATION_ALREADY_PENDING: [
      409,
      "A Business formation is already awaiting completion.",
    ],
    BUSINESS_PROPOSED_OWNER_NOT_FOUND: [
      404,
      "A proposed Business owner was not found in this game.",
    ],
    BUSINESS_FORMATION_NOT_FOUND: [404, "Business formation was not found."],
    BUSINESS_FORMATION_OWNER_REQUIRED: [
      403,
      "Only a proposed owner may respond to this formation.",
    ],
    BUSINESS_FORMATION_OWNER_ALREADY_RESPONDED: [
      409,
      "This proposed owner already responded.",
    ],
    BUSINESS_FORMATION_NOT_AWAITING_APPROVAL: [
      409,
      "This formation is not awaiting owner approval.",
    ],
    BUSINESS_FORMATION_PROPOSER_REQUIRED: [
      403,
      "Only the formation proposer may activate this Business.",
    ],
    BUSINESS_FORMATION_NOT_READY_FOR_CAPITALIZATION: [
      409,
      "This formation is not ready for capitalization.",
    ],
    BUSINESS_FORMATION_UNANIMOUS_APPROVAL_REQUIRED: [
      409,
      "All proposed owners must approve before activation.",
    ],
    BUSINESS_FORMATION_INSUFFICIENT_OWNER_FUNDS: [
      409,
      "One or more owners do not have enough funds for the agreed contribution.",
    ],
    BUSINESS_OWNERSHIP_AMBIGUOUS: [
      409,
      "Multiple open Businesses are associated with this Player.",
    ],
    BUSINESS_NOT_ACTIVE: [409, "The Business must be active before hiring."],
    BUSINESS_WORKFORCE_CANDIDATE_KEY_INVALID: [
      400,
      "Workforce candidate key is invalid.",
    ],
    BUSINESS_WORKFORCE_CANDIDATE_NOT_FOUND: [
      404,
      "Workforce candidate was not found.",
    ],
    BUSINESS_WORKFORCE_CANDIDATE_NOT_AVAILABLE: [
      409,
      "Workforce candidate is no longer available.",
    ],
    BUSINESS_WORKFORCE_CANDIDATE_EXPIRED: [
      409,
      "Workforce candidate availability has expired.",
    ],
    BUSINESS_WORKFORCE_CANDIDATE_COUNTRY_MISMATCH: [
      409,
      "Workforce candidate is not available in the Business country.",
    ],
    BUSINESS_WORKFORCE_CANDIDATE_CURRENCY_MISMATCH: [
      409,
      "Workforce candidate wage currency does not match the Business.",
    ],
    BUSINESS_WORKFORCE_ROLE_NOT_ACTIVE: [
      409,
      "The workforce role is not active.",
    ],
    BUSINESS_WORKFORCE_PLAYER_ALREADY_EMPLOYED: [
      409,
      "This candidate is already actively employed by the Business.",
    ],
    BUSINESS_OWNER_CANNOT_HIRE_SELF: [
      409,
      "The Business owner cannot hire themselves through the candidate market.",
    ],
    BUSINESS_WORKFORCE_HIRE_CONFLICT: [
      409,
      "The workforce candidate was hired by another request.",
    ],
    BUSINESS_WORKFORCE_HIRE_REPLAY_MISSING: [
      500,
      "Workforce hire replay evidence is incomplete.",
      true,
    ],
    STORE_ITEM_KEY_INVALID: [400, "Store item key is invalid."],
    STORE_QUOTE_QUANTITY_INVALID: [400, "Store quote quantity is invalid."],
    IDEMPOTENCY_KEY_REQUIRED: [400, "A valid idempotency key is required."],
    STORE_ITEM_NOT_FOUND: [404, "Store item is not available."],
    STORE_WITHDRAWAL_REQUEST_INVALID: [
      400,
      "The Store withdrawal request is invalid.",
    ],
    STORE_WITHDRAWAL_BUSINESS_NOT_FOUND: [
      404,
      "The active owned Business was not found for this Store offer.",
    ],
    STORE_WITHDRAWAL_OFFER_NOT_FOUND: [
      404,
      "The Business Store offer was not found.",
    ],
    STORE_WITHDRAWAL_OFFER_VERSION_CONFLICT: [
      409,
      "The Store offer changed. Refresh before retrying.",
      true,
    ],
    STORE_WITHDRAWAL_IDEMPOTENCY_CONFLICT: [
      409,
      "This idempotency key was already used for different withdrawal intent.",
    ],
    STORE_WITHDRAWAL_REDUCTION_EXCEEDS_AVAILABLE: [
      409,
      "The requested reduction exceeds currently available listing stock.",
    ],
    STORE_WITHDRAWAL_PENDING_EXISTS: [
      409,
      "A withdrawal request is already pending for this Store offer.",
    ],
    STORE_WITHDRAWAL_OFFER_STATUS_INVALID: [
      409,
      "This Store offer cannot enter withdrawal from its current state.",
    ],
    STORE_WITHDRAWAL_REPLAY_OFFER_MISSING: [
      500,
      "Withdrawal replay evidence is incomplete.",
      true,
    ],
    STORE_WITHDRAWAL_BUSINESS_PARTY_NOT_FOUND: [
      409,
      "The Business seller identity is unavailable for this Store offer.",
    ],
    STORE_WITHDRAWAL_OFFER_CUSTODY_MISSING: [
      409,
      "The Store offer is missing canonical listing custody.",
    ],
    STORE_WITHDRAWAL_ACCOUNT_UNAVAILABLE: [
      409,
      "The Store offer listing account is unavailable.",
    ],
    STORE_WITHDRAWAL_LISTING_HOLDING_MISSING: [
      409,
      "The Store offer listing holding is unavailable.",
    ],
    BUSINESS_COUNTRY_PROFILE_NOT_FOUND: [
      409,
      "The Business country is not configured for Store pricing.",
    ],
    BUSINESS_CURRENCY_MISMATCH: [
      409,
      "The Business currency does not match this procurement quote.",
    ],
    COUNTRY_PROFILE_NOT_FOUND: [
      409,
      "The Business country is not configured for Store pricing.",
    ],
    COUNTRY_SNAPSHOT_NOT_FOUND: [
      409,
      "A current country economic snapshot is required for Store pricing.",
    ],
    STORE_QUOTE_CURRENCY_INVALID: [
      409,
      "The Business settlement currency is invalid.",
    ],
    INSUFFICIENT_STOCK: [409, "Store stock is insufficient for this purchase."],
    QUOTE_NOT_FOUND: [404, "Business Store quote was not found."],
    QUOTE_NOT_USABLE: [409, "Business Store quote can no longer be used."],
    QUOTE_EXPIRED: [409, "Business Store quote has expired."],
    INSUFFICIENT_BUSINESS_BALANCE: [
      409,
      "Business cash is insufficient for this purchase.",
    ],
    ITEM_CANONICAL_CONTEXT_UNAVAILABLE: [
      409,
      "Store item is not connected to canonical inventory.",
    ],
    BUSINESS_STOCKROOM_COST_CURRENCY_MISMATCH: [
      409,
      "Existing Stockroom cost basis uses another currency.",
    ],
    BUSINESS_STORE_PROCUREMENT_PAYMENT_RETIRED: [
      410,
      "This pre-C4 procurement quote cannot be paid. Create a funded Business Store quote.",
    ],
    BUSINESS_PURCHASE_FUNDING_TOTAL_MISMATCH: [
      409,
      "The selected account allocations must equal the current Business Store bill.",
    ],
    BUSINESS_PURCHASE_FUNDING_ACCOUNT_INVALID: [
      400,
      "Select one to three active Business Checking accounts.",
    ],
    BUSINESS_PURCHASE_FUNDING_INSUFFICIENT: [
      409,
      "Available Business Checking funds are insufficient for this purchase.",
    ],
    PURCHASE_FUNDING_QUOTE_EXPIRED: [
      409,
      "The Business Store funding quote has expired.",
    ],
    PURCHASE_FUNDING_QUOTE_NOT_FOUND: [
      404,
      "The Business Store funding quote was not found.",
    ],
    PURCHASE_FUNDING_QUOTE_CONSUMED: [
      409,
      "The Business Store funding quote was already consumed.",
    ],
    PURCHASE_FUNDING_QUOTE_CONFLICT: [
      409,
      "The Business Store funding quote conflicts with this request.",
    ],
    PURCHASE_FUNDING_QUOTE_REQUEST_INVALID: [
      400,
      "The Business Store funding request is invalid.",
    ],
    PURCHASE_FUNDING_SOURCE_AMOUNT_INVALID: [
      400,
      "A funding source amount is invalid.",
    ],
    PURCHASE_FUNDING_EVIDENCE_IMMUTABLE: [
      409,
      "Committed funding evidence cannot be changed.",
    ],
    PURCHASE_FUNDING_QUOTE_LINES_INVALID: [
      500,
      "Funding quote line evidence is incomplete.",
      true,
    ],
    PURCHASE_FUNDING_SETTLEMENT_REQUEST_INVALID: [
      400,
      "The procurement funding settlement request is invalid.",
    ],
    PURCHASE_FUNDING_CONTEXT_CONFLICT: [
      409,
      "The Business Store funding context changed. Create a new quote.",
    ],
    PURCHASE_FUNDING_IDEMPOTENCY_CONFLICT: [
      409,
      "This idempotency key was already used for different funding intent.",
    ],
    BUSINESS_STORE_FUNDING_BINDING_CONFLICT: [
      409,
      "The commercial quote and funding evidence no longer reconcile.",
    ],
    BUSINESS_STORE_FUNDING_RECEIPT_CONFLICT: [
      409,
      "The procurement receipt and funding evidence do not reconcile.",
    ],
    PURCHASE_FUNDING_ALLOCATION_INVALID: [
      400,
      "Select one to three valid Business Checking allocations.",
    ],
    PURCHASE_FUNDING_DUPLICATE_ACCOUNT: [
      400,
      "Each Business Checking allocation must use a unique account.",
    ],
    PURCHASE_FUNDING_CURRENCY_INVALID: [
      409,
      "A selected Business Checking currency is unavailable for this procurement.",
    ],
    PURCHASE_FUNDING_PRECISION_INVALID: [
      400,
      "A funding amount exceeds its currency precision.",
    ],
    PURCHASE_FUNDING_TARGET_PRECISION_INVALID: [
      409,
      "The Store settlement currency precision changed. Create a new quote.",
    ],
    PURCHASE_FUNDING_TARGET_ROUNDS_TO_ZERO: [
      409,
      "The Store item price is below the settlement currency precision.",
    ],
    PURCHASE_FUNDING_TARGET_ACCOUNT_INVALID: [
      409,
      "The canonical Business Store target account is unavailable.",
    ],
    PURCHASE_FUNDING_SELF_TARGET_FORBIDDEN: [
      409,
      "A source allocation cannot also be the procurement target account.",
    ],
    PURCHASE_FUNDING_TOTAL_MISMATCH: [
      409,
      "The selected allocations do not reconcile to the current Business Store bill.",
    ],
    PURCHASE_FUNDING_REMAINDER_INVALID: [
      409,
      "The server-derived remainder must be positive. Review the allocations.",
    ],
    BANK_ACCOUNT_NOT_FOUND: [
      404,
      "A selected Business Checking account was not found.",
    ],
    BANK_ACCOUNT_NOT_ACTIVE: [
      409,
      "A required Business Checking account is not active.",
    ],
    BANK_ACCOUNT_CURRENCY_INVALID: [
      409,
      "A required Business Checking currency is unavailable.",
    ],
    BANK_ACCOUNT_PROJECTION_MISSING: [
      503,
      "Business Checking account evidence is temporarily unavailable.",
      true,
    ],
    BUSINESS_ACCOUNT_OWNER_INVALID: [
      409,
      "A selected Checking account is not owned by this Business.",
    ],
    FUNDING_INSUFFICIENT: [
      409,
      "Available Business Checking funds are insufficient for this purchase.",
    ],
    FX_RATE_VERSION_STALE: [
      409,
      "The procurement FX fixing is stale. Create a new quote.",
      true,
    ],
    FX_FIXING_NOT_FOUND: [
      409,
      "A current procurement FX fixing is unavailable.",
      true,
    ],
    FX_FIXING_VALUE_NOT_FOUND: [
      409,
      "A required procurement FX currency value is unavailable.",
      true,
    ],
    FX_LIQUIDITY_UNAVAILABLE: [
      409,
      "Procurement FX liquidity is currently unavailable.",
      true,
    ],
    BUSINESS_STORE_QUOTE_IMMUTABLE: [
      409,
      "Committed Business Store quote evidence cannot be changed.",
    ],
    BUSINESS_STORE_QUOTE_TRANSITION_INVALID: [
      409,
      "The Business Store quote is no longer in a usable state.",
    ],
    BUSINESS_STORE_PURCHASE_IMMUTABLE: [
      409,
      "Committed procurement evidence cannot be changed.",
    ],
    BUSINESS_STORE_PURCHASE_TRANSITION_INVALID: [
      409,
      "The Business Store purchase cannot advance from its current state.",
    ],
    INVALID_REQUEST_METADATA: [
      400,
      "Business Store request metadata is invalid.",
    ],
    INVENTORY_POSTING_RESULT_MISSING: [
      500,
      "Canonical inventory settlement did not produce a Stockroom result.",
      true,
    ],
    IDEMPOTENCY_IN_PROGRESS: [
      409,
      "This Business Store purchase is still processing.",
      true,
    ],
    GAME_SESSION_DISABLED: [
      409,
      "Business Store purchases are paused for this game.",
      true,
    ],
    GAME_SESSION_ARCHIVED: [
      409,
      "Business Store purchases are closed because this game has ended.",
    ],
    GAME_SESSION_NOT_ACTIVE: [
      409,
      "Business Store purchases are unavailable for this game.",
    ],
    GAME_SESSION_NOT_FOUND: [
      409,
      "Business Store purchases are unavailable for this game.",
    ],
  };
  const source = message.toUpperCase();
  const code = Object.keys(mappings).find((candidate) =>
    new RegExp(`(?:^|[^A-Z0-9_])${candidate}(?:$|[^A-Z0-9_])`, "u").test(source)
  );
  const mapped = code ? mappings[code] : undefined;
  return new PlayerBusinessError(
    code?.toLowerCase() ?? "business_operation_failed",
    mapped?.[1] ?? "The business operation could not be completed.",
    mapped?.[0] ?? 500,
    mapped?.[2] ?? false,
  );
}
