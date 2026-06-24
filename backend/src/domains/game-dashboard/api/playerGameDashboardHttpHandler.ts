import {
  EdgeActivationError,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  invalidPlayerSessionResponse,
  readPlayerSessionTokenFromRequest,
  resolveActivePlayerSession,
} from "../../players/api/playerSessionHttpHelpers.ts";
import {
  GAME_PUBLIC_REALTIME_EVENTS,
  type PlayerGameDashboardRepository,
  type PlayerGameDashboardResponseBody,
} from "../contracts/playerGameDashboardContracts.ts";
import {
  PlayerGameDashboardError,
} from "../contracts/playerGameDashboardContracts.ts";
import {
  SupabasePlayerGameDashboardRepository,
} from "../infrastructure/supabasePlayerGameDashboardRepository.ts";

interface PlayerGameDashboardHttpDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: () =>
    | { readonly ok: true; readonly value: SupabaseEnv }
    | { readonly ok: false; readonly missing: readonly string[] };
  readonly hashSessionToken?: (sessionToken: string) => Promise<string>;
  readonly resolvePlayerSession?: (
    serviceClient: EdgeSupabaseClient,
    sessionTokenHash: string,
  ) => ReturnType<typeof resolveActivePlayerSession>;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerGameDashboardRepository;
}

export async function handlePlayerGameDashboardRequest(
  request: Request,
  dependencies: PlayerGameDashboardHttpDependencies,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to load the player game dashboard.",
      retryable: false,
    });
  }

  if (request.headers.has("x-stock-market-runner-secret")) {
    return jsonError(400, {
      code: "stock_runner_secret_not_allowed",
      message: "Player dashboard reads must not send the stock market runner secret.",
      retryable: false,
    });
  }

  try {
    const envResult = (dependencies.readSupabaseEnv ?? readSupabaseEnv)();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const url = new URL(request.url);
    rejectClientSuppliedIdentity(url.searchParams, request.headers);
    const gameSessionId = readDashboardGameSessionId(url.searchParams);
    const sessionToken = readPlayerSessionTokenFromRequest(request);

    if (!sessionToken) {
      return invalidPlayerSessionResponse();
    }

    const serviceClient = dependencies.createServiceClient(envResult.value);
    const sessionTokenHash = await (dependencies.hashSessionToken ?? sha256Hex)(
      sessionToken,
    );
    const sessionResult = await (dependencies.resolvePlayerSession ??
      resolveActivePlayerSession)(serviceClient, sessionTokenHash);

    if (!sessionResult.ok) {
      return jsonError(sessionResult.status, sessionResult.error);
    }

    if (sessionResult.session.game_session_id !== gameSessionId) {
      throw new EdgeActivationError(
        "invalid_player_session_scope",
        "Requested game session does not match the authenticated player session.",
        401,
        false,
      );
    }

    const repository = dependencies.createRepository
      ? dependencies.createRepository(serviceClient)
      : new SupabasePlayerGameDashboardRepository(serviceClient as any);
    const snapshot = await repository.read({
      gameSessionId,
      playerSessionId: sessionResult.session.id,
      playerId: sessionResult.player.id,
      playerDisplayName: sessionResult.player.display_name,
      playerRosterLabel: sessionResult.player.roster_label,
    });

    return jsonResponse<PlayerGameDashboardResponseBody>(200, {
      ok: true,
      ...snapshot,
      realtime: {
        publicChannel: `game:${gameSessionId}:public`,
        lastSequence: null,
        events: GAME_PUBLIC_REALTIME_EVENTS,
      },
    });
  } catch (error) {
    if (error instanceof PlayerGameDashboardError) {
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

    return jsonError(500, {
      code: "game_dashboard_read_failed",
      message: "Player game dashboard could not be loaded.",
      retryable: false,
    });
  }
}

function readDashboardGameSessionId(searchParams: URLSearchParams): string {
  const values = searchParams.getAll("gameSessionId");

  if (values.length !== 1) {
    throw invalidRequest("Exactly one gameSessionId query parameter is required.");
  }

  const value = values[0]?.trim() ?? "";

  if (!value) {
    throw invalidRequest("gameSessionId is required.");
  }

  return value;
}

function rejectClientSuppliedIdentity(
  searchParams: URLSearchParams,
  headers: Headers,
): void {
  for (const fieldName of [
    "playerId",
    "playerIds",
    "playerSessionId",
    "playerSessionIds",
    "sessionId",
    "sessionIds",
  ]) {
    if (searchParams.has(fieldName)) {
      throw invalidRequest(
        "Player dashboard derives player identity from x-player-session-token.",
      );
    }
  }

  for (const headerName of [
    "x-player-id",
    "x-player-session-id",
    "x-player-session",
  ]) {
    if (headers.has(headerName)) {
      throw invalidRequest(
        "Player dashboard derives player identity from x-player-session-token.",
      );
    }
  }
}

function invalidRequest(message: string): EdgeActivationError {
  return new EdgeActivationError(
    "invalid_game_dashboard_request",
    message,
    400,
    false,
  );
}
