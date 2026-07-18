/// <reference lib="dom" />

import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
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
import { resolveActivePlayerSession } from "../../players/api/playerSessionHttpHelpers.ts";
import { resolvePlayerRequestScope } from "../../players/api/playerRequestScope.ts";
import {
  type PlayerStockWatchlistListResponseBody,
  type PlayerStockWatchlistMutationResponseBody,
  type PlayerStockWatchlistRepository,
  type PlayerStockWatchlistRoute,
  PlayerStockWatchlistError,
} from "../contracts/playerStockWatchlistContracts.ts";
import {
  SupabasePlayerStockWatchlistRepository,
} from "../infrastructure/supabasePlayerStockWatchlistRepository.ts";
import { PlayerStockWatchlistService } from "../services/playerStockWatchlistService.ts";
import {
  parsePlayerStockWatchlistListRequest,
  parsePlayerStockWatchlistMutationRequest,
  rejectPlayerStockWatchlistMutationBody,
} from "./playerStockWatchlistRequestParser.ts";

export interface PlayerStockWatchlistHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: typeof readSupabaseEnv;
  readonly hashSessionToken?: (token: string) => Promise<string>;
  readonly resolvePlayerSession?: (
    client: EdgeSupabaseClient,
    tokenHash: string,
  ) => ReturnType<typeof resolveActivePlayerSession>;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerStockWatchlistRepository;
  readonly now?: () => Date;
}

export async function handlePlayerStockWatchlistRequest(
  request: Request,
  route: PlayerStockWatchlistRoute,
  dependencies: PlayerStockWatchlistHttpHandlerDependencies,
): Promise<Response> {
  if (route.kind === "malformed") {
    return jsonError(400, {
      code: "invalid_player_stock_watchlist_request",
      message: "Watchlist paths require the collection or one public ticker.",
      retryable: false,
    });
  }

  if (route.kind === "watchlist" && request.method !== "GET") {
    return methodNotAllowed("Use GET to read the player stock watchlist.");
  }
  if (
    route.kind === "watchlist_asset" &&
    request.method !== "PUT" &&
    request.method !== "DELETE"
  ) {
    return methodNotAllowed(
      "Use PUT to add or DELETE to remove a watchlist asset.",
    );
  }

  if (request.headers.has("x-stock-market-runner-secret")) {
    return jsonError(400, {
      code: "stock_runner_secret_not_allowed",
      message: "Player watchlist requests must not send a runner secret.",
      retryable: false,
    });
  }

  try {
    const query = route.kind === "watchlist"
      ? parsePlayerStockWatchlistListRequest(request, route)
      : null;
    if (route.kind === "watchlist_asset") {
      parsePlayerStockWatchlistMutationRequest(request, route);
    }

    const envResult = (dependencies.readSupabaseEnv ?? readSupabaseEnv)();
    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const client = dependencies.createServiceClient(envResult.value);
    const now = dependencies.now?.() ?? new Date();
    const scope = await resolvePlayerRequestScope(request, {
      hashSessionToken: dependencies.hashSessionToken ?? sha256Hex,
      resolvePlayerSession: (tokenHash) =>
        (dependencies.resolvePlayerSession ?? resolveActivePlayerSession)(
          client,
          tokenHash,
        ),
      now: () => now,
    });

    if (route.kind === "watchlist_asset") {
      await rejectPlayerStockWatchlistMutationBody(request);
    }

    const repository = dependencies.createRepository
      ? dependencies.createRepository(client)
      : new SupabasePlayerStockWatchlistRepository(client as never);
    const service = new PlayerStockWatchlistService(repository);
    const serviceScope = {
      gameId: scope.gameId,
      playerUuid: scope.playerUuid,
      effectiveAt: now.toISOString(),
    };

    if (route.kind === "watchlist") {
      if (!query) {
        throw new PlayerStockWatchlistError(
          "invalid_player_stock_watchlist_request",
          "Watchlist pagination could not be resolved.",
          400,
          false,
        );
      }
      const body = await service.listWatchlist(serviceScope, query);
      return privateJsonResponse<PlayerStockWatchlistListResponseBody>(body);
    }

    const body = await service.setWatchlisted(
      serviceScope,
      route.assetId,
      request.method === "PUT",
    );
    return privateJsonResponse<PlayerStockWatchlistMutationResponseBody>(body);
  } catch (error) {
    if (
      error instanceof EdgeActivationError ||
      error instanceof PlayerStockWatchlistError
    ) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    return jsonError(500, {
      code: "player_stock_watchlist_failed",
      message: "Player stock watchlist request failed.",
      retryable: false,
    });
  }
}

function methodNotAllowed(message: string): Response {
  return jsonError(405, {
    code: "method_not_allowed",
    message,
    retryable: false,
  });
}

function privateJsonResponse<T>(body: T): Response {
  const response = jsonResponse<T>(200, body);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("vary", "authorization, x-player-session-token");
  return response;
}
