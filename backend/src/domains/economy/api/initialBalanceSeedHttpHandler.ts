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
  readBalanceNumber,
} from "../../../platform/supabase/edgeParsing.ts";

interface InitialBalanceSeedDependencies {
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

interface InitialBalanceSeedRequestBody {
  readonly amount: number;
  readonly reason: string;
  readonly accountType: string;
  readonly currencyCode: string;
}

interface InitialBalanceSeedSuccessBody {
  readonly ok: true;
  readonly gameSession: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  };
  readonly seed: {
    readonly createdCount: number;
    readonly skippedCount: number;
    readonly accountType: string;
    readonly currencyCode: string;
    readonly amount: number;
    readonly createdAt: string;
  };
}

interface InitialBalanceSeedRpcRow {
  readonly created_count: number;
  readonly skipped_count: number;
  readonly account_type: string;
  readonly currency_code: string;
  readonly seed_amount: number | string;
  readonly created_at: string;
}

export async function handleInitialBalanceSeedRequest(
  request: Request,
  gameSessionId: string,
  dependencies: InitialBalanceSeedDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to seed initial player balances.",
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
        missingMessage: "A verified Supabase Auth user is required to seed initial player balances.",
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

    const body = await readInitialBalanceSeedRequestBody(request);
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

    const seedResponse = await staffResult.serviceClient.rpc(
      "seed_initial_player_balances",
      {
        p_game_session_id: gameSessionId,
        p_amount: body.amount,
        p_account_type: body.accountType,
        p_currency_code: body.currencyCode,
        p_created_by_id: staffResult.staff.id,
        p_reason: body.reason,
        p_request_id: requestId,
      },
    );

    if (seedResponse.error) {
      const safeError = mapInitialBalanceSeedRpcError(seedResponse.error.message);

      return jsonError(safeError.status, {
        code: safeError.code,
        message: safeError.message,
        retryable: safeError.retryable,
      });
    }

    const seedRow = readInitialBalanceSeedRpcRow(seedResponse.data);

    if (!seedRow) {
      return jsonError(500, {
        code: "initial_balance_seed_failed",
        message: "Initial balance seed failed.",
        retryable: false,
      });
    }

    return jsonResponse<InitialBalanceSeedSuccessBody>(200, {
      ok: true,
      gameSession: {
        id: ownershipResult.gameSession.id,
        name: ownershipResult.gameSession.name,
        status: ownershipResult.gameSession.status,
      },
      seed: {
        createdCount: seedRow.created_count,
        skippedCount: seedRow.skipped_count,
        accountType: seedRow.account_type,
        currencyCode: seedRow.currency_code,
        amount: readBalanceNumber(seedRow.seed_amount),
        createdAt: seedRow.created_at,
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
      code: "initial_balance_seed_failed",
      message: "Initial balance seed failed.",
      retryable: false,
    });
  }
}

async function readInitialBalanceSeedRequestBody(
  request: Request,
): Promise<InitialBalanceSeedRequestBody> {
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
    amount: parseInitialBalanceSeedAmount(value.amount),
    reason: parseOptionalText(value.reason) ?? "Initial balance seed",
    accountType: normalizeAccountType(parseOptionalText(value.accountType) ?? "cash"),
    currencyCode: normalizeCurrencyCode(parseOptionalText(value.currencyCode) ?? "ECO"),
  };
}

function parseInitialBalanceSeedAmount(value: unknown): number {
  const amount = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new EdgeActivationError(
      "seed_amount_required",
      "amount must be a positive number.",
      400,
    );
  }

  return Math.round(amount * 100) / 100;
}

function normalizeAccountType(value: string): string {
  const normalizedValue = value.trim().toLowerCase();

  if (!/^[a-z0-9_-]{1,32}$/.test(normalizedValue)) {
    throw new EdgeActivationError(
      "invalid_account_type",
      "accountType must be 1 to 32 letters, numbers, underscores, or hyphens.",
      400,
    );
  }

  return normalizedValue;
}

function readInitialBalanceSeedRpcRow(
  value: unknown,
): InitialBalanceSeedRpcRow | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const row = value[0];

  if (!isRecord(row)) {
    return null;
  }

  if (
    typeof row.created_count !== "number" ||
    typeof row.skipped_count !== "number" ||
    typeof row.account_type !== "string" ||
    typeof row.currency_code !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }

  if (
    typeof row.seed_amount !== "number" &&
    typeof row.seed_amount !== "string"
  ) {
    return null;
  }

  return {
    created_count: row.created_count,
    skipped_count: row.skipped_count,
    account_type: row.account_type,
    currency_code: row.currency_code,
    seed_amount: row.seed_amount,
    created_at: row.created_at,
  };
}

function mapInitialBalanceSeedRpcError(message: string): {
  readonly code: string;
  readonly message: string;
  readonly status: number;
  readonly retryable: boolean;
} {
  switch (message.trim().toUpperCase()) {
    case "GAME_SESSION_REQUIRED":
    case "SEED_AMOUNT_REQUIRED":
    case "ACCOUNT_TYPE_REQUIRED":
    case "INVALID_CURRENCY_CODE":
      return {
        code: "invalid_initial_balance_seed",
        message: "Initial balance seed request is invalid.",
        status: 400,
        retryable: false,
      };

    case "GAME_SESSION_NOT_FOUND":
      return {
        code: "game_session_not_found",
        message: "Game session was not found.",
        status: 404,
        retryable: false,
      };

    default:
      return {
        code: "initial_balance_seed_failed",
        message: "Initial balance seed failed.",
        status: 500,
        retryable: false,
      };
  }
}
