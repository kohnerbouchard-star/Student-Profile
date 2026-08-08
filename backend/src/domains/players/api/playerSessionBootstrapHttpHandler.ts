import {
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
} from "./playerSessionHttpHelpers.ts";
import {
  isBrowserSafePlayerIdentifier,
  type PlayerSessionBootstrapBody,
} from "../contracts/playerBrowserSessionContracts.ts";

interface PlayerSessionBootstrapDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly hashSessionToken?: typeof sha256Hex;
  readonly now?: () => number;
}

interface AccountBalanceRow {
  readonly account_type: string;
  readonly balance: number | string;
  readonly currency_code: string;
}

function normalizedCurrencyCode(value: unknown): string {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{3,8}$/.test(code) ? code : "";
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
    const envResult = (dependencies.readEnvironment ?? readSupabaseEnv)();

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

    const sessionTokenHash = await (dependencies.hashSessionToken ?? sha256Hex)(
      sessionToken,
    );
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
      Date.parse(session.expires_at) <= (dependencies.now ?? Date.now)()
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
      .select("id,display_name,roster_label,player_identifier,status")
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
      readonly player_identifier: string;
      readonly status: string;
    } | null;

    if (
      !player?.id ||
      !isBrowserSafePlayerIdentifier(player.player_identifier) ||
      player.status !== "active"
    ) {
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
    const checkingCurrencyCodes = [
      ...new Set(
        balances
          .filter((balanceRow) =>
            String(balanceRow.account_type).trim().toLowerCase() === "checking"
          )
          .map((balanceRow) => normalizedCurrencyCode(balanceRow.currency_code))
          .filter(Boolean),
      ),
    ];
    let playerCurrencyCode = checkingCurrencyCodes.length === 1
      ? checkingCurrencyCodes[0]
      : "";

    if (!playerCurrencyCode) {
      const assignmentResponse = await serviceClient
        .from("player_country_assignments")
        .select("country_profile_id")
        .eq("game_session_id", session.game_session_id)
        .eq("player_id", session.player_id)
        .eq("status", "active")
        .maybeSingle();

      if (assignmentResponse.error) {
        return jsonError(500, {
          code: "player_session_bootstrap_failed",
          message: "Player session bootstrap failed.",
          retryable: false,
        });
      }

      const assignment = assignmentResponse.data as {
        readonly country_profile_id: string;
      } | null;

      if (!assignment?.country_profile_id) {
        return jsonError(500, {
          code: "player_session_bootstrap_failed",
          message: "Player session bootstrap failed.",
          retryable: false,
        });
      }

      const countryResponse = await serviceClient
        .from("country_profiles")
        .select("currency_code")
        .eq("id", assignment.country_profile_id)
        .eq("status", "active")
        .maybeSingle();

      if (countryResponse.error) {
        return jsonError(500, {
          code: "player_session_bootstrap_failed",
          message: "Player session bootstrap failed.",
          retryable: false,
        });
      }

      const country = countryResponse.data as {
        readonly currency_code: string;
      } | null;
      playerCurrencyCode = normalizedCurrencyCode(country?.currency_code);
    }

    if (!playerCurrencyCode) {
      return jsonError(500, {
        code: "player_session_bootstrap_failed",
        message: "Player session bootstrap failed.",
        retryable: false,
      });
    }

    return jsonResponse<PlayerSessionBootstrapBody>(200, {
      ok: true,
      gameSession: {
        name: gameSession.name,
        status: gameSession.status,
      },
      player: {
        displayName: player.display_name,
        rosterLabel: player.roster_label ?? null,
        playerIdentifier: player.player_identifier,
        status: player.status,
        currencyCode: playerCurrencyCode,
      },
      session: {
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
        "STORE_PURCHASE",
      ],
    }, {
      "cache-control": "private, no-store, max-age=0",
      "pragma": "no-cache",
      "vary": "authorization, x-player-session-token",
    });
  } catch {
    return jsonError(500, {
      code: "player_session_bootstrap_failed",
      message: "Player session bootstrap failed.",
      retryable: false,
    });
  }
}
