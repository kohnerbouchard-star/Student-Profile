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
  type PlayerStockAssetListRepository,
  type PlayerStockAssetListResponseBody,
  type PlayerStockAssetListRoute,
  PlayerStockAssetListError,
} from "../contracts/playerStockAssetListContracts.ts";
import {
  SupabasePlayerStockAssetListRepository,
} from "../infrastructure/supabasePlayerStockAssetListRepository.ts";
import { PlayerStockAssetListService } from "../services/playerStockAssetListService.ts";
import { parsePlayerStockAssetListRequest } from "./playerStockAssetListRequestParser.ts";

export interface PlayerStockAssetListHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: typeof readSupabaseEnv;
  readonly hashSessionToken?: (token: string) => Promise<string>;
  readonly resolvePlayerSession?: (
    client: EdgeSupabaseClient,
    tokenHash: string,
  ) => ReturnType<typeof resolveActivePlayerSession>;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerStockAssetListRepository;
  readonly now?: () => Date;
}

export async function handlePlayerStockAssetListRequest(
  request: Request,
  route: PlayerStockAssetListRoute,
  dependencies: PlayerStockAssetListHttpHandlerDependencies,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to load player-visible stock assets.",
      retryable: false,
    });
  }

  if (request.headers.has("x-stock-market-runner-secret")) {
    return jsonError(400, {
      code: "stock_runner_secret_not_allowed",
      message: "Player market reads must not send a stock market runner secret.",
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
    const query = parsePlayerStockAssetListRequest(request, route);
    const repository = dependencies.createRepository
      ? dependencies.createRepository(client)
      : new SupabasePlayerStockAssetListRepository(client as never);
    const service = new PlayerStockAssetListService(repository);
    const body = await service.listAssets(
      {
        gameId: scope.gameId,
        playerUuid: scope.playerUuid,
        effectiveAt: now.toISOString(),
      },
      query,
    );
    const response = jsonResponse<PlayerStockAssetListResponseBody>(200, body);
    response.headers.set("cache-control", "private, no-store");
    response.headers.set("vary", "authorization, x-player-session-token");
    return response;
  } catch (error) {
    if (
      error instanceof EdgeActivationError ||
      error instanceof PlayerStockAssetListError
    ) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    return jsonError(500, {
      code: "player_stock_asset_list_failed",
      message: "Player stock assets could not be loaded.",
      retryable: false,
    });
  }
}
