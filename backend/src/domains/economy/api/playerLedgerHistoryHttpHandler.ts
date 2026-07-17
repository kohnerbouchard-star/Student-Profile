import {
  EdgeActivationError,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import { readBalanceNumber } from "../../../platform/supabase/edgeParsing.ts";
import {
  invalidPlayerSessionResponse,
  readPlayerSessionTokenFromRequest,
} from "../../players/api/playerSessionHttpHelpers.ts";
import { readLedgerHistoryLimitQuery } from "./ledgerHistoryHttpHelpers.ts";

interface PlayerLedgerHistoryDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
}

interface AccountBalanceRow {
  readonly account_type: string;
  readonly balance: number | string;
  readonly currency_code: string;
}

interface PlayerLedgerEntryRow {
  readonly id: string;
  readonly account_type: string;
  readonly amount: number | string;
  readonly currency_code: string;
  readonly entry_type: string;
  readonly source_domain: string;
  readonly source_action: string;
  readonly source_id: string | null;
  readonly created_by_type: string;
  readonly created_at: string;
}

interface PlayerLedgerHistoryBody {
  readonly ok: true;
  readonly gameSession: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  };
  readonly player: {
    readonly id: string;
    readonly displayName: string;
    readonly rosterLabel: string | null;
    readonly status: string;
  };
  readonly generatedAt: string;
  readonly currentBalances: readonly {
    readonly accountType: string;
    readonly balance: number;
    readonly currencyCode: string;
  }[];
  readonly ledgerEntries: readonly {
    readonly id: string;
    readonly accountType: string;
    readonly amount: number;
    readonly currencyCode: string;
    readonly entryType: string;
    readonly sourceDomain: string;
    readonly sourceAction: string;
    readonly sourceId: string | null;
    readonly createdByType: string;
    readonly createdAt: string;
  }[];
}

export async function handlePlayerLedgerHistoryRequest(
  request: Request,
  dependencies: PlayerLedgerHistoryDependencies,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to load player ledger history.",
      retryable: false,
    });
  }

  if (request.headers.has("x-stock-market-runner-secret")) {
    return jsonError(400, {
      code: "stock_runner_secret_not_allowed",
      message:
        "Player ledger requests must not send the stock market runner secret.",
      retryable: false,
    });
  }

  try {
    const url = new URL(request.url);
    rejectClientSuppliedIdentity(url.searchParams, request.headers);
    rejectUnexpectedQueryParameters(url.searchParams);
    const requestedGameSessionId = readOptionalGameSessionHeader(
      request.headers,
    );
    const envResult = readSupabaseEnv();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const sessionToken = readPlayerSessionTokenFromRequest(request);

    if (!sessionToken) {
      return invalidPlayerSessionResponse();
    }

    const sessionTokenHash = await sha256Hex(sessionToken);
    const limit = readLedgerHistoryLimitQuery(url.searchParams.get("limit"));
    const serviceClient = dependencies.createServiceClient(envResult.value);

    const sessionResponse = await serviceClient
      .from("player_sessions")
      .select("id,game_session_id,player_id,status,expires_at,revoked_at")
      .eq("session_token_hash", sessionTokenHash)
      .maybeSingle();

    if (sessionResponse.error) {
      return jsonError(500, {
        code: "player_ledger_history_failed",
        message: "Player ledger history could not be loaded.",
        retryable: false,
      });
    }

    const session = sessionResponse.data as {
      readonly id: string;
      readonly game_session_id: string;
      readonly player_id: string;
      readonly status: string;
      readonly expires_at: string;
      readonly revoked_at: string | null;
    } | null;

    if (
      !session?.id ||
      session.status !== "active" ||
      session.revoked_at !== null ||
      Date.parse(session.expires_at) <= Date.now()
    ) {
      return invalidPlayerSessionResponse();
    }

    if (
      requestedGameSessionId &&
      requestedGameSessionId !== session.game_session_id
    ) {
      throw new EdgeActivationError(
        "invalid_player_session_scope",
        "Requested game session does not match the authenticated player session.",
        401,
        false,
      );
    }

    const gameResponse = await serviceClient
      .from("game_sessions")
      .select("id,name,status")
      .eq("id", session.game_session_id)
      .eq("status", "active")
      .maybeSingle();

    if (gameResponse.error) {
      return jsonError(500, {
        code: "player_ledger_history_failed",
        message: "Player ledger history could not be loaded.",
        retryable: false,
      });
    }

    const gameSession = gameResponse.data as {
      readonly id: string;
      readonly name: string;
      readonly status: string;
    } | null;

    if (!gameSession?.id) {
      return invalidPlayerSessionResponse();
    }

    const playerResponse = await serviceClient
      .from("players")
      .select("id,display_name,roster_label,status")
      .eq("game_session_id", session.game_session_id)
      .eq("id", session.player_id)
      .maybeSingle();

    if (playerResponse.error) {
      return jsonError(500, {
        code: "player_ledger_history_failed",
        message: "Player ledger history could not be loaded.",
        retryable: false,
      });
    }

    const player = playerResponse.data as {
      readonly id: string;
      readonly display_name: string;
      readonly roster_label: string | null;
      readonly status: string;
    } | null;

    if (!player?.id || player.status !== "active") {
      return invalidPlayerSessionResponse();
    }

    const balancesResponse = await serviceClient
      .from("account_balances")
      .select("account_type,balance,currency_code")
      .eq("game_session_id", session.game_session_id)
      .eq("player_id", session.player_id)
      .order("account_type", { ascending: true });

    if (balancesResponse.error) {
      return jsonError(500, {
        code: "player_ledger_history_failed",
        message: "Player ledger history could not be loaded.",
        retryable: false,
      });
    }

    const ledgerResponse = await serviceClient
      .from("ledger_entries")
      .select(
        "id,account_type,amount,currency_code,entry_type,source_domain,source_action,source_id,created_by_type,created_at",
      )
      .eq("game_session_id", session.game_session_id)
      .eq("player_id", session.player_id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (ledgerResponse.error) {
      return jsonError(500, {
        code: "player_ledger_history_failed",
        message: "Player ledger history could not be loaded.",
        retryable: false,
      });
    }

    const balances = (balancesResponse.data ?? []) as AccountBalanceRow[];
    const ledgerRows = (ledgerResponse.data ?? []) as PlayerLedgerEntryRow[];

    return jsonResponse<PlayerLedgerHistoryBody>(200, {
      ok: true,
      gameSession: {
        id: gameSession.id,
        name: gameSession.name,
        status: gameSession.status,
      },
      player: {
        id: player.id,
        displayName: player.display_name,
        rosterLabel: player.roster_label ?? null,
        status: player.status,
      },
      generatedAt: new Date().toISOString(),
      currentBalances: balances.map((balanceRow) => ({
        accountType: balanceRow.account_type,
        balance: readBalanceNumber(balanceRow.balance),
        currencyCode: balanceRow.currency_code,
      })),
      ledgerEntries: ledgerRows.map((entry) => ({
        id: entry.id,
        accountType: entry.account_type,
        amount: readBalanceNumber(entry.amount),
        currencyCode: entry.currency_code,
        entryType: entry.entry_type,
        sourceDomain: entry.source_domain,
        sourceAction: entry.source_action,
        sourceId: entry.source_id ?? null,
        createdByType: entry.created_by_type,
        createdAt: entry.created_at,
      })),
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
      code: "player_ledger_history_failed",
      message: "Player ledger history could not be loaded.",
      retryable: false,
    });
  }
}

function rejectClientSuppliedIdentity(
  searchParams: URLSearchParams,
  headers: Headers,
): void {
  for (
    const fieldName of [
      "playerId",
      "playerIds",
      "playerSessionId",
      "playerSessionIds",
      "sessionId",
      "sessionIds",
      "gameSessionId",
      "gameSessionIds",
    ]
  ) {
    if (searchParams.has(fieldName)) {
      throw invalidRequest(
        "Player ledger scope is derived from x-player-session-token.",
      );
    }
  }

  for (
    const headerName of [
      "x-player-id",
      "x-player-session-id",
      "x-player-session",
    ]
  ) {
    if (headers.has(headerName)) {
      throw invalidRequest(
        "Player ledger scope is derived from x-player-session-token.",
      );
    }
  }
}

function rejectUnexpectedQueryParameters(searchParams: URLSearchParams): void {
  let unexpected: string | null = null;
  searchParams.forEach((_value, key) => {
    if (unexpected === null && key !== "limit") unexpected = key;
  });

  if (unexpected !== null) {
    throw invalidRequest(`Unexpected query parameter: ${unexpected}.`);
  }

  if (searchParams.getAll("limit").length > 1) {
    throw invalidRequest("Exactly one limit query parameter is allowed.");
  }
}

function readOptionalGameSessionHeader(headers: Headers): string | null {
  const values = [
    headers.get("x-econovaria-game-session-id")?.trim() ?? "",
    headers.get("x-econovaria-game-id")?.trim() ?? "",
  ].filter(Boolean);
  const uniqueValues = [...new Set(values)];

  if (uniqueValues.length > 1) {
    throw invalidRequest("Game-session headers must identify the same game.");
  }

  return uniqueValues[0] ?? null;
}

function invalidRequest(message: string): EdgeActivationError {
  return new EdgeActivationError(
    "invalid_player_ledger_history_request",
    message,
    400,
    false,
  );
}
