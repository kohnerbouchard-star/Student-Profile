/// <reference lib="dom" />

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
import {
  PlayerBusinessError,
  type PlayerBusinessRepository,
  type PlayerBusinessRoute,
} from "../contracts/playerBusinessContracts.ts";
import {
  readBusinessRecipes,
  readBusinessStockroom,
} from "../infrastructure/supabaseBusinessStockroomReadRepository.ts";
import { SupabasePlayerBusinessRepository } from "../infrastructure/supabasePlayerBusinessRepository.ts";
import { executePlayerBusinessMutation } from "./playerBusinessMutationExecutor.ts";
import {
  readBusinessRequestBody,
  validateBusinessRequestEnvelope,
  validateBusinessRequestMethodAndFields,
} from "./playerBusinessRequestValidation.ts";
import {
  createBusinessStoreQuote,
  purchaseBusinessStoreQuote,
} from "./playerBusinessStoreProcurement.ts";

export interface PlayerBusinessRequestScope {
  readonly gameId: string;
  readonly playerUuid: string;
}

export interface PlayerBusinessHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly resolveScope: (
    request: Request,
    client: EdgeSupabaseClient,
    body: Record<string, unknown>,
  ) => Promise<PlayerBusinessRequestScope>;
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerBusinessRepository;
}

export async function handlePlayerBusinessRequest(
  request: Request,
  route: PlayerBusinessRoute,
  dependencies: PlayerBusinessHttpHandlerDependencies,
): Promise<Response> {
  try {
    validateBusinessRequestEnvelope(request);
    const body = await readBusinessRequestBody(
      request,
      route.kind === "businessRead",
    );
    validateBusinessRequestMethodAndFields(route, request.method, body);

    const environment = (dependencies.readEnvironment ?? readSupabaseEnv)();
    if (!environment.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const client = dependencies.createServiceClient(environment.value);
    const scope = await dependencies.resolveScope(request, client, body);
    const repository = dependencies.createRepository
      ? dependencies.createRepository(client)
      : new SupabasePlayerBusinessRepository(client);
    const publicScope = {
      gameSessionId: scope.gameId,
      playerId: scope.playerUuid,
    };

    if (route.kind === "businessRead") {
      if (route.resource === "stockroom") {
        return privateJson(200, {
          items: await readBusinessStockroom(client, publicScope),
        });
      }
      if (route.resource === "recipes") {
        return privateJson(200, {
          recipes: await readBusinessRecipes(client, publicScope),
        });
      }
      return privateJson(200, await repository.readBusiness(publicScope));
    }

    if (route.kind === "businessStoreQuote") {
      return privateJson(200, {
        ok: true,
        quote: await createBusinessStoreQuote(repository, publicScope, body),
        refreshRequired: false,
      });
    }

    if (route.kind === "businessStorePurchase") {
      return privateJson(200, {
        ok: true,
        receipt: await purchaseBusinessStoreQuote(repository, publicScope, body),
        refreshRequired: true,
      });
    }

    const result = await executePlayerBusinessMutation(
      repository,
      route,
      body,
      publicScope,
    );
    return privateJson(200, { ok: true, result, refreshRequired: true });
  } catch (error) {
    if (error instanceof PlayerBusinessError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
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
      code: "player_business_request_failed",
      message: "The Business request could not be completed.",
      retryable: false,
    });
  }
}

function privateJson(status: number, body: unknown): Response {
  return jsonResponse(status, body, {
    "cache-control": "private, no-store, max-age=0",
    "pragma": "no-cache",
    "vary": "authorization, x-player-session-token",
  });
}
