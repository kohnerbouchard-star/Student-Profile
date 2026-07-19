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
} from "../../../platform/supabase/edgeParsing.ts";
import {
  IdempotentStaffLedgerAdjustmentError,
  recordIdempotentStaffLedgerAdjustment,
} from "../services/idempotentStaffLedgerAdjustment.ts";

interface StaffLedgerAdjustmentDependencies {
  readonly resolveStaffForRequest: (
    request: Request,
    env: SupabaseEnv,
    options: { readonly missingMessage: string },
  ) => Promise<
    | {
        readonly ok: true;
        readonly staff: { readonly id: string };
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
  readonly outcome: "applied" | "replayed";
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
        missingMessage:
          "A verified Supabase Auth user is required to create ledger adjustments.",
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

    const idempotencyKey = readIdempotencyKey(request);
    const body = await readStaffLedgerAdjustmentRequestBody(request);
    const playerResponse = await staffResult.serviceClient
      .from("players")
      .select("id,display_name,roster_label,status")
      .eq("game_session_id", gameSessionId)
      .eq("id", playerId)
      .maybeSingle();

    if (playerResponse.error) {
      return ledgerFailure();
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

    const ledger = await recordIdempotentStaffLedgerAdjustment(
      staffResult.serviceClient,
      {
        gameSessionId,
        playerId,
        staffUserId: staffResult.staff.id,
        routeKey: "staff.players.ledger_adjustment",
        idempotencyKey,
        accountType: body.accountType,
        amount: body.amount,
        currencyCode: body.currencyCode,
        entryType: body.amount > 0 ? "credit" : "debit",
        sourceDomain: "ledger",
        sourceAction: "staff_player_balance_adjustment",
        sourceId: null,
        auditMetadata: {
          requestId: idempotencyKey,
          reason: body.reason,
          source: "classroom_api_edge_staff_ledger_adjustment",
        },
      },
    );

    return jsonResponse<StaffLedgerAdjustmentSuccessBody>(200, {
      ok: true,
      outcome: ledger.outcome,
      player: {
        id: player.id,
        displayName: player.display_name,
        rosterLabel: player.roster_label ?? null,
        status: player.status,
      },
      ledgerEntry: {
        id: ledger.ledgerEntryId,
        accountType: ledger.accountType,
        amount: body.amount,
        balance: ledger.balance,
        currencyCode: ledger.currencyCode,
        createdAt: ledger.createdAt,
      },
    });
  } catch (error) {
    if (error instanceof IdempotentStaffLedgerAdjustmentError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: false,
      });
    }
    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    return ledgerFailure();
  }
}

function readIdempotencyKey(request: Request): string {
  const key = String(
    request.headers.get("x-idempotency-key") ||
      request.headers.get("x-request-id") ||
      "",
  ).trim();
  if (!key) {
    throw new EdgeActivationError(
      "ledger_idempotency_key_required",
      "X-Idempotency-Key is required for ledger adjustments.",
      400,
      false,
    );
  }
  if (key.length > 200) {
    throw new EdgeActivationError(
      "ledger_idempotency_key_invalid",
      "X-Idempotency-Key must not exceed 200 characters.",
      400,
      false,
    );
  }
  return key;
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
    currencyCode: normalizeCurrencyCode(
      parseOptionalText(value.currencyCode) ?? "ECO",
    ),
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

function ledgerFailure(): Response {
  return jsonError(500, {
    code: "ledger_adjustment_failed",
    message: "Ledger adjustment failed.",
    retryable: false,
  });
}
