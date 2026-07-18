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
  type PlayerInventoryReadRepository,
  type PlayerInventoryReadResponseBody,
  PlayerInventoryReadError,
  type PlayerInventoryRoute,
} from "../contracts/playerInventoryReadContracts.ts";
import { SupabasePlayerInventoryReadRepository } from "../infrastructure/supabasePlayerInventoryReadRepository.ts";
import { PlayerInventoryReadService } from "../services/playerInventoryReadService.ts";
import { parsePlayerInventoryReadRequest } from "./playerInventoryRequestParser.ts";

export interface PlayerInventoryReadHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: typeof readSupabaseEnv;
  readonly hashSessionToken?: (token: string) => Promise<string>;
  readonly resolvePlayerSession?: (
    client: EdgeSupabaseClient,
    tokenHash: string,
  ) => ReturnType<typeof resolveActivePlayerSession>;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerInventoryReadRepository;
  readonly now?: () => Date;
}

export async function handlePlayerInventoryReadRequest(
  request: Request,
  route: PlayerInventoryRoute,
  dependencies: PlayerInventoryReadHttpHandlerDependencies,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to load player inventory.",
      retryable: false,
    });
  }

  if (request.headers.has("x-stock-market-runner-secret")) {
    return jsonError(400, {
      code: "stock_runner_secret_not_allowed",
      message: "Player inventory reads must not send a stock market runner secret.",
      retryable: false,
    });
  }

  try {
    parsePlayerInventoryReadRequest(request, route);

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

    const repository = dependencies.createRepository
      ? dependencies.createRepository(client)
      : new SupabasePlayerInventoryReadRepository(client as never);
    const service = new PlayerInventoryReadService(repository);
    const body = await service.readInventory({
      gameId: scope.gameId,
      playerUuid: scope.playerUuid,
      effectiveAt: now.toISOString(),
    });

    return playerInventoryJsonResponse(body);
  } catch (error) {
    if (
      error instanceof EdgeActivationError ||
      error instanceof PlayerInventoryReadError
    ) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    return jsonError(500, {
      code: "player_inventory_read_failed",
      message: "Player inventory could not be loaded.",
      retryable: false,
    });
  }
}

function playerInventoryJsonResponse(
  body: PlayerInventoryReadResponseBody,
): Response {
  const response = jsonResponse<PlayerInventoryReadResponseBody>(200, body);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("vary", "authorization, x-player-session-token");
  return response;
}
