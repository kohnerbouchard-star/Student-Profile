import {
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  type SupabaseEnv,
  readSupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import { extractBearerToken } from "../../../platform/supabase/edgeAuth.ts";
import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import { readBalanceNumber } from "../../../platform/supabase/edgeParsing.ts";
import { invalidPlayerSessionResponse } from "./playerSessionHttpHelpers.ts";

interface PlayerSessionBootstrapDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
}

interface AccountBalanceRow {
  readonly account_type: string;
  readonly balance: number | string;
  readonly currency_code: string;
}

interface PlayerSessionBootstrapBody {
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
  readonly session: {
    readonly id: string;
    readonly status: "active";
    readonly expiresAt: string;
  };
  readonly balances: readonly {
    readonly accountType: string;
    readonly balance: number;
    readonly currencyCode: string;
  }[];
  readonly attendance: {
    readonly status: "not_configured";
  };
  readonly availableActions: readonly string[];
}

export async function handlePlayerSessionBootstrapRequest(
  request: Request,
  dependencies: PlayerSessionBootstrapDependencies,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to load player session data.",
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

    const sessionToken = extractBearerToken(request.headers.get("authorization"));

    if (!sessionToken) {
      return invalidPlayerSessionResponse();
    }

    const sessionTokenHash = await sha256Hex(sessionToken);
    const serviceClient = dependencies.createServiceClient(envResult.value);

    const sessionResponse = await serviceClient
      .from("player_sessions")
      .select("id,game_session_id,player_id,status,expires_at,revoked_at")
      .eq("session_token_hash", sessionTokenHash)
      .maybeSingle();

    if (sessionResponse.error) {
      return jsonError(500, {
        code: "player_session_bootstrap_failed",
        message: "Player session bootstrap failed.",
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

    const gameResponse = await serviceClient
      .from("game_sessions")
      .select("id,name,status")
      .eq("id", session.game_session_id)
      .eq("status", "active")
      .maybeSingle();

    if (gameResponse.error) {
      return jsonError(500, {
        code: "player_session_bootstrap_failed",
        message: "Player session bootstrap failed.",
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
        code: "player_session_bootstrap_failed",
        message: "Player session bootstrap failed.",
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
        code: "player_session_bootstrap_failed",
        message: "Player session bootstrap failed.",
        retryable: false,
      });
    }

    const balances = (balancesResponse.data ?? []) as AccountBalanceRow[];

    return jsonResponse<PlayerSessionBootstrapBody>(200, {
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
      session: {
        id: session.id,
        status: "active",
        expiresAt: session.expires_at,
      },
      balances: balances.map((balanceRow) => ({
        accountType: balanceRow.account_type,
        balance: readBalanceNumber(balanceRow.balance),
        currencyCode: balanceRow.currency_code,
      })),
      attendance: {
        status: "not_configured",
      },
      availableActions: [
        "dashboard.view",
        "ledger.view",
      ],
    });
  } catch {
    return jsonError(500, {
      code: "player_session_bootstrap_failed",
      message: "Player session bootstrap failed.",
      retryable: false,
    });
  }
}
