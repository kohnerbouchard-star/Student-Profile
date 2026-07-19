import {
  isRecord,
  readBalanceNumber,
} from "../../../platform/supabase/edgeParsing.ts";

export interface IdempotentStaffLedgerAdjustmentInput {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly staffUserId: string;
  readonly routeKey: string;
  readonly idempotencyKey: string;
  readonly accountType: string;
  readonly amount: number;
  readonly currencyCode: string;
  readonly entryType: string;
  readonly sourceDomain: string;
  readonly sourceAction: string;
  readonly sourceId?: string | null;
  readonly auditMetadata?: Record<string, unknown>;
}

export interface IdempotentStaffLedgerAdjustmentResult {
  readonly outcome: "applied" | "replayed";
  readonly ledgerEntryId: string;
  readonly accountBalanceId: string;
  readonly accountType: string;
  readonly balance: number;
  readonly currencyCode: string;
  readonly createdAt: string;
}

export interface IdempotentStaffLedgerClient {
  rpc<Data = unknown>(
    functionName: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{
    readonly data: Data | null;
    readonly error: { readonly message?: string } | null;
  }>;
}

export class IdempotentStaffLedgerAdjustmentError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "IdempotentStaffLedgerAdjustmentError";
  }
}

export async function recordIdempotentStaffLedgerAdjustment(
  client: IdempotentStaffLedgerClient,
  input: IdempotentStaffLedgerAdjustmentInput,
): Promise<IdempotentStaffLedgerAdjustmentResult> {
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new IdempotentStaffLedgerAdjustmentError(
      "ledger_idempotency_key_required",
      "An idempotency key is required for ledger adjustments.",
      400,
    );
  }

  const response = await client.rpc<unknown[]>(
    "record_idempotent_staff_ledger_adjustment_v1",
    {
      p_game_session_id: input.gameSessionId,
      p_player_id: input.playerId,
      p_staff_user_id: input.staffUserId,
      p_route_key: input.routeKey,
      p_idempotency_key: idempotencyKey,
      p_account_type: input.accountType,
      p_amount: input.amount,
      p_currency_code: input.currencyCode,
      p_entry_type: input.entryType,
      p_source_domain: input.sourceDomain,
      p_source_action: input.sourceAction,
      p_source_id: input.sourceId ?? null,
      p_audit_metadata: input.auditMetadata ?? {},
    },
  );

  if (response.error) {
    throw mapRpcError(response.error.message ?? "");
  }

  const row = readResult(response.data);
  if (!row) {
    throw new IdempotentStaffLedgerAdjustmentError(
      "ledger_adjustment_failed",
      "Ledger adjustment failed.",
      500,
    );
  }
  return row;
}

function readResult(
  value: unknown,
): IdempotentStaffLedgerAdjustmentResult | null {
  if (!Array.isArray(value) || !isRecord(value[0])) return null;
  const row = value[0];
  const outcome = row.outcome === "replayed"
    ? "replayed"
    : row.outcome === "applied"
    ? "applied"
    : null;
  if (
    !outcome ||
    typeof row.ledger_entry_id !== "string" ||
    typeof row.account_balance_id !== "string" ||
    typeof row.account_type !== "string" ||
    (typeof row.balance !== "number" && typeof row.balance !== "string") ||
    typeof row.currency_code !== "string" ||
    typeof row.created_at !== "string"
  ) return null;

  return {
    outcome,
    ledgerEntryId: row.ledger_entry_id,
    accountBalanceId: row.account_balance_id,
    accountType: row.account_type,
    balance: readBalanceNumber(row.balance),
    currencyCode: row.currency_code,
    createdAt: row.created_at,
  };
}

function mapRpcError(message: string): IdempotentStaffLedgerAdjustmentError {
  const upper = message.trim().toUpperCase();
  if (upper.includes("LEDGER_IDEMPOTENCY_KEY_REQUIRED")) {
    return new IdempotentStaffLedgerAdjustmentError(
      "ledger_idempotency_key_required",
      "An idempotency key is required for ledger adjustments.",
      400,
    );
  }
  if (upper.includes("LEDGER_IDEMPOTENCY_CONFLICT")) {
    return new IdempotentStaffLedgerAdjustmentError(
      "ledger_idempotency_conflict",
      "That idempotency key was already used for a different ledger adjustment.",
      409,
    );
  }
  if (upper.includes("LEDGER_IDEMPOTENCY_IN_PROGRESS")) {
    return new IdempotentStaffLedgerAdjustmentError(
      "ledger_adjustment_in_progress",
      "That ledger adjustment is still being processed.",
      409,
    );
  }
  if (upper.includes("PLAYER_NOT_FOUND")) {
    return new IdempotentStaffLedgerAdjustmentError(
      "player_not_found",
      "Player was not found for this game session.",
      404,
    );
  }
  if (
    upper.includes("GAME_SESSION_REQUIRED") ||
    upper.includes("PLAYER_REQUIRED") ||
    upper.includes("STAFF_USER_REQUIRED") ||
    upper.includes("LEDGER_IDEMPOTENCY_ROUTE_REQUIRED") ||
    upper.includes("ACCOUNT_TYPE_REQUIRED") ||
    upper.includes("LEDGER_AMOUNT_REQUIRED") ||
    upper.includes("INVALID_CURRENCY_CODE") ||
    upper.includes("INVALID_LEDGER_ENTRY_TYPE") ||
    upper.includes("SOURCE_DOMAIN_REQUIRED") ||
    upper.includes("SOURCE_ACTION_REQUIRED") ||
    upper.includes("INVALID_AUDIT_METADATA")
  ) {
    return new IdempotentStaffLedgerAdjustmentError(
      "invalid_ledger_adjustment",
      "Ledger adjustment request is invalid.",
      400,
    );
  }
  return new IdempotentStaffLedgerAdjustmentError(
    "ledger_adjustment_failed",
    "Ledger adjustment failed.",
    500,
  );
}
