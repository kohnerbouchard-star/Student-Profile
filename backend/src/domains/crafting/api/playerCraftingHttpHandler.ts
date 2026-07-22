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
  type EquipItemCommand,
  type IdempotentCraftingCommand,
  PlayerCraftingError,
  type PlayerCraftingRepository,
  type PlayerCraftingRoute,
  type StartCraftingJobCommand,
  type UseItemEffectCommand,
} from "../contracts/playerCraftingContracts.ts";
import { SupabasePlayerCraftingRepository } from "../infrastructure/supabasePlayerCraftingRepository.ts";
import {
  parsePlayerCraftingCommand,
  validatePlayerCraftingRead,
} from "./playerCraftingRequestParser.ts";

export interface PlayerCraftingHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: typeof readSupabaseEnv;
  readonly hashSessionToken?: (token: string) => Promise<string>;
  readonly resolvePlayerSession?: (
    client: EdgeSupabaseClient,
    tokenHash: string,
  ) => ReturnType<typeof resolveActivePlayerSession>;
  readonly createRepository?: (client: EdgeSupabaseClient) => PlayerCraftingRepository;
  readonly now?: () => Date;
}

export async function handlePlayerCraftingRequest(
  request: Request,
  route: PlayerCraftingRoute,
  dependencies: PlayerCraftingHttpHandlerDependencies,
): Promise<Response> {
  if (route.kind === "malformed") {
    return errorResponse(new PlayerCraftingError(
      "invalid_player_crafting_request",
      "Crafting path is malformed.",
      400,
      false,
    ));
  }

  const expectedMethod = route.kind === "read" ? "GET" : "POST";
  if (request.method !== expectedMethod) {
    return jsonError(405, {
      code: "method_not_allowed",
      message: route.kind === "read"
        ? "Use GET to read crafting."
        : "Use POST for crafting mutations.",
      retryable: false,
    });
  }

  try {
    const command = route.kind === "read"
      ? (validatePlayerCraftingRead(request), null)
      : await parsePlayerCraftingCommand(request, route);
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
      : new SupabasePlayerCraftingRepository(client as never);

    let result: unknown;
    switch (route.kind) {
      case "read":
        result = await repository.read({
          gameId: scope.gameId,
          playerUuid: scope.playerUuid,
        });
        break;
      case "startJob":
        result = await repository.startJob({
          gameId: scope.gameId,
          playerUuid: scope.playerUuid,
          command: command as StartCraftingJobCommand,
        });
        break;
      case "cancelJob":
        result = await repository.cancelJob({
          gameId: scope.gameId,
          playerUuid: scope.playerUuid,
          jobKey: route.jobKey,
          idempotencyKey: (command as IdempotentCraftingCommand).idempotencyKey,
        });
        break;
      case "claimJob":
        result = await repository.claimJob({
          gameId: scope.gameId,
          playerUuid: scope.playerUuid,
          jobKey: route.jobKey,
          idempotencyKey: (command as IdempotentCraftingCommand).idempotencyKey,
        });
        break;
      case "useItem":
        result = await repository.useItem({
          gameId: scope.gameId,
          playerUuid: scope.playerUuid,
          itemKey: route.itemKey,
          targetKey: (command as UseItemEffectCommand).targetKey,
          idempotencyKey: (command as UseItemEffectCommand).idempotencyKey,
        });
        break;
      case "equip":
        result = await repository.equip({
          gameId: scope.gameId,
          playerUuid: scope.playerUuid,
          equipmentKey: route.equipmentKey,
          slot: (command as EquipItemCommand).slot,
          idempotencyKey: (command as EquipItemCommand).idempotencyKey,
        });
        break;
      case "salvage":
        result = await repository.salvage({
          gameId: scope.gameId,
          playerUuid: scope.playerUuid,
          equipmentKey: route.equipmentKey,
          idempotencyKey: (command as IdempotentCraftingCommand).idempotencyKey,
        });
        break;
      default:
        throw new PlayerCraftingError(
          "invalid_player_crafting_request",
          "Crafting path is malformed.",
          400,
          false,
        );
    }

    const mutation = route.kind !== "read";
    return privateResponse(route.kind === "startJob" ? 201 : 200, {
      ok: true,
      generatedAt: now.toISOString(),
      data: result,
      ...(mutation ? { committed: true, refreshRequired: true } : {}),
    });
  } catch (error) {
    if (error instanceof EdgeActivationError || error instanceof PlayerCraftingError) {
      return errorResponse(error);
    }
    return errorResponse(new PlayerCraftingError(
      "player_crafting_failed",
      "Crafting could not be completed.",
      500,
      false,
    ));
  }
}

function errorResponse(error: EdgeActivationError | PlayerCraftingError): Response {
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
