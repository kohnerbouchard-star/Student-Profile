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
import { resolveActivePlayerSession } from "../../players/index.ts";
import {
  type PlayerRequestScope,
  resolvePlayerRequestScope,
} from "../../players/index.ts";
import type { PlayerMarketplaceFundingRepository } from "../contracts/playerMarketplaceFundingContracts.ts";
import {
  type MarketplaceCommittedResult,
  PlayerMarketplaceError,
  PlayerMarketplacePersistenceError,
  type PlayerMarketplaceRepository,
} from "../contracts/playerMarketplaceContracts.ts";
import { SupabasePlayerMarketplaceFundingRepository } from "../infrastructure/supabasePlayerMarketplaceFundingRepository.ts";
import { SupabasePlayerMarketplaceRepository } from "../infrastructure/supabasePlayerMarketplaceRepository.ts";
import {
  readMarketplaceClientTimestamp,
  readMarketplaceFundingAllocations,
} from "./playerMarketplaceFundingHttpInputs.ts";
import type { PlayerMarketplaceRoute } from "./playerMarketplaceRoutePaths.ts";

import {
  strictJsonObject,
  exactKeys,
  itemKey,
  idempotency,
  currency,
  condition,
  positiveInteger,
  nullableInteger,
  positiveNumber,
  boundedText,
  invalid,
} from "./playerMarketplaceRequestInputs.ts";

export interface PlayerMarketplaceHttpDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly resolveScope?: (
    request: Request,
    client: EdgeSupabaseClient,
  ) => Promise<PlayerRequestScope>;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerMarketplaceRepository;
  readonly createFundingRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerMarketplaceFundingRepository;
  readonly now?: () => Date;
}

export async function handlePlayerMarketplaceRequest(
  request: Request,
  route: PlayerMarketplaceRoute,
  dependencies: PlayerMarketplaceHttpDependencies,
): Promise<Response> {
  if (route.kind === "malformed") {
    return privateError(
      400,
      "invalid_player_marketplace_request",
      "Marketplace route is malformed.",
    );
  }
  const allowed = route.kind === "collection"
    ? new Set(["GET", "POST"])
    : new Set(["POST"]);
  if (!allowed.has(request.method)) {
    return privateError(
      405,
      "method_not_allowed",
      "Marketplace method is not allowed.",
    );
  }
  if (request.headers.has("x-stock-market-runner-secret")) {
    return privateError(
      400,
      "stock_runner_secret_not_allowed",
      "Marketplace requests must not send a runner secret.",
    );
  }

  try {
    rejectClientScope(request);
    const envResult = (dependencies.readEnvironment ?? readSupabaseEnv)();
    if (!envResult.ok) {
      return privateError(
        500,
        "missing_edge_runtime_config",
        "Classroom API runtime configuration is incomplete.",
      );
    }
    const client = dependencies.createServiceClient(envResult.value);
    const scope = await (dependencies.resolveScope ?? resolveScope)(request, client);
    const repository = dependencies.createRepository
      ? dependencies.createRepository(client)
      : new SupabasePlayerMarketplaceRepository(client as never);

    if (request.method === "GET") {
      return privateResponse(200, {
        ok: true,
        marketplace: await repository.read({
          gameId: scope.gameId,
          playerUuid: scope.playerUuid,
        }),
      });
    }

    if (route.kind === "purchase" && route.action === "retired") {
      return privateError(
        410,
        "player_marketplace_purchase_retired",
        "Create a Marketplace funding quote and confirm that reservation instead.",
      );
    }

    const body = await strictJsonObject(request);

    if (route.kind === "purchase" && route.action === "quote") {
      exactKeys(body, [
        "quantity",
        "expectedVersion",
        "allocations",
        "idempotencyKey",
      ]);
      const fundingRepository = dependencies.createFundingRepository
        ? dependencies.createFundingRepository(client)
        : new SupabasePlayerMarketplaceFundingRepository(client as never);
      const reservation = await fundingRepository.createQuote({
        gameSessionId: scope.gameId,
        playerId: scope.playerUuid,
        listingKey: route.listingKey,
        quantity: positiveInteger(body.quantity, "quantity", 1_000_000),
        expectedVersion: positiveInteger(
          body.expectedVersion,
          "expectedVersion",
          Number.MAX_SAFE_INTEGER,
        ),
        allocations: readMarketplaceFundingAllocations(body.allocations),
        idempotencyKey: idempotency(body.idempotencyKey),
        effectiveAt: (dependencies.now ?? (() => new Date()))().toISOString(),
      });
      return privateResponse(reservation.replayed ? 200 : 201, {
        ok: true,
        outcome: reservation.replayed ? "replayed" : "applied",
        reservation,
        committed: true,
        refreshRequired: false,
      });
    }

    if (route.kind === "purchase" && route.action === "settlement") {
      exactKeys(body, ["idempotencyKey", "clientSubmittedAt"]);
      const fundingRepository = dependencies.createFundingRepository
        ? dependencies.createFundingRepository(client)
        : new SupabasePlayerMarketplaceFundingRepository(client as never);
      const order = await fundingRepository.settle({
        gameSessionId: scope.gameId,
        playerId: scope.playerUuid,
        reservationKey: route.reservationKey,
        idempotencyKey: idempotency(body.idempotencyKey),
        clientSubmittedAt: readMarketplaceClientTimestamp(
          body.clientSubmittedAt,
        ),
      });
      return privateResponse(200, {
        ok: true,
        outcome: order.replayed ? "replayed" : "applied",
        order,
        committed: true,
        refreshRequired: true,
      });
    }

    let result: MarketplaceCommittedResult;
    let status = 200;
    if (route.kind === "collection") {
      exactKeys(body, [
        "itemKey",
        "quantity",
        "unitPrice",
        "currencyCode",
        "condition",
        "durationHours",
        "idempotencyKey",
      ]);
      result = await repository.createListing({
        gameSessionId: scope.gameId,
        playerId: scope.playerUuid,
        itemKey: itemKey(body.itemKey),
        quantity: positiveInteger(body.quantity, "quantity", 1_000_000),
        unitPrice: positiveNumber(
          body.unitPrice,
          "unitPrice",
          1_000_000_000_000,
        ),
        currencyCode: currency(body.currencyCode),
        condition: condition(body.condition),
        durationHours: nullableInteger(
          body.durationHours,
          "durationHours",
          1,
          720,
        ),
        idempotencyKey: idempotency(body.idempotencyKey),
      });
      status = result.outcome === "applied" ? 201 : 200;
    } else if (route.kind === "activate") {
      exactKeys(body, ["expectedVersion", "idempotencyKey"]);
      result = await repository.activateListing({
        gameSessionId: scope.gameId,
        playerId: scope.playerUuid,
        listingKey: route.listingKey,
        expectedVersion: positiveInteger(
          body.expectedVersion,
          "expectedVersion",
          Number.MAX_SAFE_INTEGER,
        ),
        idempotencyKey: idempotency(body.idempotencyKey),
      });
    } else if (route.kind === "cancel") {
      exactKeys(body, ["expectedVersion", "idempotencyKey"]);
      result = await repository.cancel({
        gameSessionId: scope.gameId,
        playerId: scope.playerUuid,
        listingKey: route.listingKey,
        expectedVersion: positiveInteger(
          body.expectedVersion,
          "expectedVersion",
          Number.MAX_SAFE_INTEGER,
        ),
        idempotencyKey: idempotency(body.idempotencyKey),
      });
    } else if (route.kind === "dispute") {
      exactKeys(body, ["reason", "idempotencyKey"]);
      result = await repository.openDispute({
        gameSessionId: scope.gameId,
        playerId: scope.playerUuid,
        orderKey: route.orderKey,
        reason: boundedText(body.reason, "reason", 10, 1000),
        idempotencyKey: idempotency(body.idempotencyKey),
      });
      status = result.outcome === "applied" ? 201 : 200;
    } else {
      throw invalid("Marketplace route is malformed.");
    }

    return privateResponse(status, {
      ok: true,
      outcome: result.outcome,
      target: {
        id: result.targetId,
        status: result.status,
        version: result.version,
        committedAt: result.committedAt,
      },
      committed: true,
      refreshRequired: true,
    });
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      return privateError(
        error.status,
        error.code,
        error.message,
        error.retryable,
      );
    }
    if (error instanceof PlayerMarketplaceError) {
      return privateError(
        error.status,
        error.code,
        error.message,
        error.retryable,
      );
    }
    if (error instanceof PlayerMarketplacePersistenceError) {
      return privateError(
        503,
        "player_marketplace_service_unavailable",
        "Marketplace is temporarily unavailable.",
        true,
      );
    }
    return privateError(
      500,
      "player_marketplace_service_unavailable",
      "Marketplace request failed.",
    );
  }
}

function resolveScope(request: Request, client: EdgeSupabaseClient) {
  return resolvePlayerRequestScope(request, {
    hashSessionToken: sha256Hex,
    resolvePlayerSession: (tokenHash) => resolveActivePlayerSession(client, tokenHash),
  });
}

function rejectClientScope(request: Request): void {
  const url = new URL(request.url);
  if (url.search) {
    throw invalid("Marketplace routes do not accept query parameters.");
  }
  for (const header of [
    "x-player-id",
    "x-player-session-id",
    "x-game-session-id",
  ]) {
    if (request.headers.has(header)) {
      throw invalid(
        "Marketplace ownership is derived from the authenticated Player session.",
      );
    }
  }
}

function privateResponse<T>(status: number, body: T): Response {
  const response = jsonResponse(status, body);
  privateHeaders(response);
  return response;
}

function privateError(
  status: number,
  code: string,
  message: string,
  retryable = false,
): Response {
  const response = jsonError(status, { code, message, retryable });
  privateHeaders(response);
  return response;
}

function privateHeaders(response: Response): void {
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("pragma", "no-cache");
  response.headers.set("vary", "authorization, x-player-session-token");
}
