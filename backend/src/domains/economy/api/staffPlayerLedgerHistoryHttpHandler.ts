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
import { readBalanceNumber } from "../../../platform/supabase/edgeParsing.ts";
import { readLedgerHistoryLimitQuery } from "./ledgerHistoryHttpHelpers.ts";

interface StaffPlayerLedgerHistoryDependencies {
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

interface StaffPlayerLedgerHistoryBody {
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

export async function handleStaffPlayerLedgerHistoryRequest(
  request: Request,
  gameSessionId: string,
  playerId: string,
  dependencies: StaffPlayerLedgerHistoryDependencies,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to load player ledger history.",
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
        missingMessage: "A verified Supabase Auth user is required to view player ledger history.",
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

    const url = new URL(request.url);
    const limit = readLedgerHistoryLimitQuery(url.searchParams.get("limit"));

    const playerResponse = await staffResult.serviceClient
      .from("players")
      .select("id,display_name,roster_label,status")
      .eq("game_session_id", gameSessionId)
      .eq("id", playerId)
      .maybeSingle();

    if (playerResponse.error) {
      return jsonError(500, {
        code: "admin_player_ledger_history_failed",
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

    if (!player?.id) {
      return jsonError(404, {
        code: "player_not_found",
        message: "Player was not found for this game.",
        retryable: false,
      });
    }

    const balancesResponse = await staffResult.serviceClient
      .from("account_balances")
      .select("account_type,balance,currency_code")
      .eq("game_session_id", gameSessionId)
      .eq("player_id", playerId)
      .order("account_type", { ascending: true });

    if (balancesResponse.error) {
      return jsonError(500, {
        code: "admin_player_ledger_history_failed",
        message: "Player ledger history could not be loaded.",
        retryable: false,
      });
    }

    const ledgerResponse = await staffResult.serviceClient
      .from("ledger_entries")
      .select("id,account_type,amount,currency_code,entry_type,source_domain,source_action,source_id,created_by_type,created_at")
      .eq("game_session_id", gameSessionId)
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (ledgerResponse.error) {
      return jsonError(500, {
        code: "admin_player_ledger_history_failed",
        message: "Player ledger history could not be loaded.",
        retryable: false,
      });
    }

    const balances = (balancesResponse.data ?? []) as AccountBalanceRow[];
    const ledgerRows = (ledgerResponse.data ?? []) as PlayerLedgerEntryRow[];

    return jsonResponse<StaffPlayerLedgerHistoryBody>(200, {
      ok: true,
      gameSession: {
        id: ownershipResult.gameSession.id,
        name: ownershipResult.gameSession.name,
        status: ownershipResult.gameSession.status,
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
      code: "admin_player_ledger_history_failed",
      message: "Player ledger history could not be loaded.",
      retryable: false,
    });
  }
}
