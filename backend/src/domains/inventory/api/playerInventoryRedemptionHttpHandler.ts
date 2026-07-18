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
  PlayerInventoryRedemptionError,
  type PlayerInventoryRedemptionRepository,
  type PlayerInventoryRedemptionRoute,
} from "../contracts/playerInventoryRedemptionContracts.ts";
import { SupabasePlayerInventoryRedemptionRepository } from "../infrastructure/supabasePlayerInventoryRedemptionRepository.ts";
import {
  parsePlayerInventoryRedemptionCommand,
  parsePlayerInventoryRedemptionRead,
} from "./playerInventoryRedemptionRequestParser.ts";

export interface PlayerInventoryRedemptionHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: typeof readSupabaseEnv;
  readonly hashSessionToken?: (token: string) => Promise<string>;
  readonly resolvePlayerSession?: (
    client: EdgeSupabaseClient,
    tokenHash: string,
  ) => ReturnType<typeof resolveActivePlayerSession>;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerInventoryRedemptionRepository;
  readonly now?: () => Date;
}

export async function handlePlayerInventoryRedemptionRequest(
  request: Request,
  route: PlayerInventoryRedemptionRoute,
  dependencies: PlayerInventoryRedemptionHttpHandlerDependencies,
): Promise<Response> {
  if (route.kind === "malformed") {
    return errorResponse(
      new PlayerInventoryRedemptionError(
        "invalid_player_inventory_redemption_request",
        "Inventory redemption path is malformed.",
        400,
        false,
      ),
    );
  }
  const expectedMethod = route.kind === "request" ? "POST" : "GET";
  if (request.method !== expectedMethod) {
    return jsonError(405, {
      code: "method_not_allowed",
      message: route.kind === "request"
        ? "Use POST to request inventory redemption."
        : "Use GET to read inventory redemptions.",
      retryable: false,
    });
  }

  try {
    const parsed = route.kind === "request"
      ? await parsePlayerInventoryRedemptionCommand(request, route)
      : parsePlayerInventoryRedemptionRead(request, route);
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
      : new SupabasePlayerInventoryRedemptionRepository(client as never);

    if (route.kind === "request") {
      const result = await repository.request({
        gameId: scope.gameId,
        playerUuid: scope.playerUuid,
        itemId: route.itemId,
        command: parsed as Awaited<
          ReturnType<typeof parsePlayerInventoryRedemptionCommand>
        >,
      });
      return privateResponse(result.outcome === "created" ? 201 : 200, {
        ok: true,
        outcome: result.outcome,
        generatedAt: now.toISOString(),
        redemption: result.redemption,
      });
    }

    const query = parsed as ReturnType<
      typeof parsePlayerInventoryRedemptionRead
    >;
    const rows = await repository.read({
      gameId: scope.gameId,
      playerUuid: scope.playerUuid,
      ...query,
      requestId: route.kind === "item" ? route.requestId : null,
    });
    if (route.kind === "item") {
      if (!rows[0]) {
        throw new PlayerInventoryRedemptionError(
          "player_inventory_redemption_not_found",
          "Inventory redemption request was not found.",
          404,
          false,
        );
      }
      return privateResponse(200, {
        ok: true,
        generatedAt: now.toISOString(),
        redemption: rows[0],
      });
    }
    return privateResponse(200, {
      ok: true,
      generatedAt: now.toISOString(),
      requests: rows,
      page: { limit: query.limit, offset: query.offset, returned: rows.length },
    });
  } catch (error) {
    if (
      error instanceof EdgeActivationError ||
      error instanceof PlayerInventoryRedemptionError
    ) {
      return errorResponse(error);
    }
    return errorResponse(
      new PlayerInventoryRedemptionError(
        "player_inventory_redemption_failed",
        "Inventory redemption could not be completed.",
        500,
        false,
      ),
    );
  }
}

function errorResponse(
  error: EdgeActivationError | PlayerInventoryRedemptionError,
): Response {
  return jsonError(error.status, {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
  });
}

function privateResponse(status: number, body: unknown): Response {
  const response = jsonResponse(status, body);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("vary", "authorization, x-player-session-token");
  return response;
}
