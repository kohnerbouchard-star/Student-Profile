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
  type PlayerWorldCountriesResponseBody,
  type PlayerWorldCountryResponseBody,
  type PlayerWorldNewsResponseBody,
  type PlayerWorldReadRepository,
  type PlayerWorldRoute,
  PlayerWorldReadError,
} from "../contracts/playerWorldReadContracts.ts";
import { SupabasePlayerWorldReadRepository } from "../infrastructure/supabasePlayerWorldReadRepository.ts";
import { PlayerWorldReadService } from "../services/playerWorldReadService.ts";
import {
  encodePlayerWorldNewsCursor,
  parsePlayerWorldReadRequest,
} from "./playerWorldRequestParser.ts";

export interface PlayerWorldReadHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: typeof readSupabaseEnv;
  readonly hashSessionToken?: (token: string) => Promise<string>;
  readonly resolvePlayerSession?: (
    client: EdgeSupabaseClient,
    tokenHash: string,
  ) => ReturnType<typeof resolveActivePlayerSession>;
  readonly createRepository?: (client: EdgeSupabaseClient) => PlayerWorldReadRepository;
  readonly now?: () => Date;
}

export async function handlePlayerWorldReadRequest(
  request: Request,
  route: PlayerWorldRoute,
  dependencies: PlayerWorldReadHttpHandlerDependencies,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to load player world data.",
      retryable: false,
    });
  }

  if (request.headers.has("x-stock-market-runner-secret")) {
    return jsonError(400, {
      code: "stock_runner_secret_not_allowed",
      message: "Player world reads must not send a stock market runner secret.",
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
        (dependencies.resolvePlayerSession ?? resolveActivePlayerSession)(client, tokenHash),
      now: () => now,
    });
    const parsed = parsePlayerWorldReadRequest(request, route);
    const repository = dependencies.createRepository
      ? dependencies.createRepository(client)
      : new SupabasePlayerWorldReadRepository(client as never);
    const service = new PlayerWorldReadService(repository);
    const readScope = {
      gameId: scope.gameId,
      playerUuid: scope.playerUuid,
      effectiveAt: now.toISOString(),
    };

    if (parsed.kind === "countries") {
      const body = await service.listCountries(readScope);
      return jsonResponse<PlayerWorldCountriesResponseBody>(200, body);
    }

    if (parsed.kind === "country") {
      const body = await service.readCountry(readScope, parsed.countryCode ?? "");
      return jsonResponse<PlayerWorldCountryResponseBody>(200, body);
    }

    const result = await service.listNews(readScope, parsed.news!);
    return jsonResponse<PlayerWorldNewsResponseBody>(200, {
      ok: true,
      generatedAt: result.generatedAt,
      availability: "available",
      page: {
        limit: result.limit,
        returned: result.items.length,
        nextCursor: result.nextCursor
          ? encodePlayerWorldNewsCursor(result.nextCursor)
          : null,
      },
      items: result.items,
    });
  } catch (error) {
    if (error instanceof EdgeActivationError || error instanceof PlayerWorldReadError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    return jsonError(500, {
      code: "player_world_read_failed",
      message: "Player world data could not be loaded.",
      retryable: false,
    });
  }
}
