import {
  EdgeActivationError,
  type EdgeErrorBody,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  type SupabaseEnv,
  readOwnedGameSession,
  readSupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  isRecord,
  normalizeCurrencyCode,
  parseOptionalText,
  parseRequiredText,
  readBalanceNumber,
} from "../../../platform/supabase/edgeParsing.ts";

interface StaffLedgerAdjustmentDependencies {
  readonly resolveStaffForRequest: (
    request: Request,
    env: SupabaseEnv,
    options: { readonly missingMessage: string },
  ) => Promise<
    | {
        readonly ok: true;
        readonly staff: {
          readonly id: string;
        };
        readonly serviceClient: EdgeSupabaseClient;
      }
    | {
        readonly ok: false;
        readonly status: number;
        readonly error: EdgeErrorBody["error"];
      }
  >;
}

interface StaffLedgerAdjustmentRequestBody {
  readonly amount: number;
  readonly reason: string;
  readonly accountType: string;
  readonly currencyCode: string;
}

interface StaffLedgerAdjustmentSuccessBody {
  readonly ok: true;
  readonly player: {
    readonly id: string;
    readonly displayName: string;
    readonly rosterLabel: string | null;
    readonly status: string;
  };
  readonly ledgerEntry: {
    readonly id: string;
    readonly accountType: string;
    readonly amount: number;
    readonly balance: number;
    readonly currencyCode: string;
    readonly createdAt: string;
  };
}

interface StaffLedgerAdjustmentRpcRow {
  readonly ledger_entry_id: string;
  readonly account_balance_id: string;
  readonly account_type: string;
  readonly balance: number | string;
  readonly currency_code: string;
  readonly created_at: string;
}

export async function handleStaffLedgerAdjustmentRequest(
  request: Request,
  gameSessionId: string,
  playerId: string,
  dependencies: StaffLedgerAdjustmentDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to create a player ledger adjustment.",
      retryable: false,
    });
  }

  try {
    const envResult = readSupabaseEnv();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const staffResult = await dependencies.resolveStaffForRequest(
      request,
      envResult.value,
      {
        missingMessage: "A verified Supabase Auth user is required to create ledger adjustments.",
      },
    );

    if (!staffResult.ok) {
      return jsonError(staffResult.status, staffResult.error);
    }

    const ownershipResult = await readOwnedGameSession(
      staffResult.serviceClient,
      gameSessionId,
      staffResult.staff.id,
    );

    if (!ownershipResult.ok) {
      return jsonError(ownershipResult.status, ownershipResult.error);
    }

    const body = await readStaffLedgerAdjustmentRequestBody(request);

    const playerResponse = await staffResult.serviceClient
      .from("players")
      .select("id,display_name,roster_label,status")
      .eq("game_session_id", gameSessionId)
      .eq("id", playerId)
      .maybeSingle();

    if (playerResponse.error) {
      return jsonError(500, {
        code: "ledger_adjustment_failed",
        message: "Ledger adjustment failed.",
        retryable: false,
      });
    }

    const player = playerResponse.data as {
      readonly id: string;
      readonly display_name: string;
      readonly roster_label: string | null;
      readonly status: string;
    } | null;

    if (!player?.id) {
      return jsonError(404, {
        code: "player_not_found",
        message: "Player was not found for this game session.",
        retryable: false,
      });
    }

    if (player.status !== "active") {
      return jsonError(409, {
        code: "player_not_active",
        message: "Only active players can receive ledger adjustments.",
        retryable: false,
      });
    }

    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

    const ledgerResponse = await staffResult.serviceClient.rpc(
      "record_player_ledger_entry",
      {
        p_game_session_id: gameSessionId,
        p_player_id: playerId,
        p_account_type: body.accountType,
        p_amount: body.amount,
        p_currency_code: body.currencyCode,
        p_entry_type: "adjustment",
        p_source_domain: "ledger",
        p_source_action: "staff_player_balance_adjustment",
        p_source_id: null,
        p_created_by_type: "staff_user",
        p_created_by_id: staffResult.staff.id,
        p_audit_metadata: {
          requestId,
          reason: body.reason,
          source: "classroom_api_edge_staff_ledger_adjustment",
        },
      },
    );

    if (ledgerResponse.error) {
      const safeError = mapLedgerRpcError(ledgerResponse.error.message);

      return jsonError(safeError.status, {
        code: safeError.code,
        message: safeError.message,
        retryable: safeError.retryable,
      });
    }

    const ledgerRow = readLedgerAdjustmentRpcRow(ledgerResponse.data);

    if (!ledgerRow) {
      return jsonError(500, {
        code: "ledger_adjustment_failed",
        message: "Ledger adjustment failed.",
        retryable: false,
      });
    }

    return jsonResponse<StaffLedgerAdjustmentSuccessBody>(200, {
      ok: true,
      player: {
        id: player.id,
        displayName: player.display_name,
        rosterLabel: player.roster_label ?? null,
        status: player.status,
      },
      ledgerEntry: {
        id: ledgerRow.ledger_entry_id,
        accountType: ledgerRow.account_type,
        amount: body.amount,
        balance: readBalanceNumber(ledgerRow.balance),
        currencyCode: ledgerRow.currency_code,
        createdAt: ledgerRow.created_at,
      },
    });
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    return jsonError(500, {
      code: "ledger_adjustment_failed",
      message: "Ledger adjustment failed.",
      retryable: false,
    });
  }
}

async function readStaffLedgerAdjustmentRequestBody(
  request: Request,
): Promise<StaffLedgerAdjustmentRequestBody> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  if (!isRecord(value)) {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  return {
    amount: parseLedgerAmount(value.amount),
    reason: parseRequiredText(
      value.reason,
      "ledger_adjustment_reason_required",
      "reason is required.",
    ),
    accountType: parseOptionalText(value.accountType) ?? "cash",
    currencyCode: normalizeCurrencyCode(parseOptionalText(value.currencyCode) ?? "ECO"),
  };
}

function parseLedgerAmount(value: unknown): number {
  const amount = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(amount) || amount === 0) {
    throw new EdgeActivationError(
      "ledger_amount_required",
      "amount must be a non-zero number.",
      400,
    );
  }

  return Math.round(amount * 100) / 100;
}

function readLedgerAdjustmentRpcRow(
  value: unknown,
): StaffLedgerAdjustmentRpcRow | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const row = value[0];

  if (!isRecord(row)) {
    return null;
  }

  if (
    typeof row.ledger_entry_id !== "string" ||
    typeof row.account_balance_id !== "string" ||
    typeof row.account_type !== "string" ||
    typeof row.currency_code !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }

  if (
    typeof row.balance !== "number" &&
    typeof row.balance !== "string"
  ) {
    return null;
  }

  return {
    ledger_entry_id: row.ledger_entry_id,
    account_balance_id: row.account_balance_id,
    account_type: row.account_type,
    balance: row.balance,
    currency_code: row.currency_code,
    created_at: row.created_at,
  };
}

function mapLedgerRpcError(message: string): {
  readonly code: string;
  readonly message: string;
  readonly status: number;
  readonly retryable: boolean;
} {
  switch (message.trim().toUpperCase()) {
    case "GAME_SESSION_REQUIRED":
    case "PLAYER_REQUIRED":
    case "ACCOUNT_TYPE_REQUIRED":
    case "LEDGER_AMOUNT_REQUIRED":
    case "INVALID_CURRENCY_CODE":
    case "INVALID_LEDGER_ENTRY_TYPE":
    case "SOURCE_DOMAIN_REQUIRED":
    case "SOURCE_ACTION_REQUIRED":
    case "INVALID_CREATED_BY_TYPE":
      return {
        code: "invalid_ledger_adjustment",
        message: "Ledger adjustment request is invalid.",
        status: 400,
        retryable: false,
      };

    case "PLAYER_NOT_FOUND":
      return {
        code: "player_not_found",
        message: "Player was not found for this game session.",
        status: 404,
        retryable: false,
      };

    default:
      return {
        code: "ledger_adjustment_failed",
        message: "Ledger adjustment failed.",
        status: 500,
        retryable: false,
      };
  }
}
