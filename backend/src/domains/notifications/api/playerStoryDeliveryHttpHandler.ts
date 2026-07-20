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
import {
  type PlayerRequestScope,
  resolvePlayerRequestScope,
} from "../../players/api/playerRequestScope.ts";
import {
  PLAYER_STORY_DELIVERY_ACTIONS,
  type PlayerStoryDeliveryAction,
  PlayerStoryDeliveryError,
  type PlayerStoryDeliveryListResponseBody,
  PlayerStoryDeliveryPersistenceError,
  type PlayerStoryDeliveryRepository,
  type PlayerStoryDeliveryRoute,
  type PlayerStoryDeliveryStateResponseBody,
} from "../contracts/playerStoryDeliveryContracts.ts";
import { SupabasePlayerStoryDeliveryRepository } from "../infrastructure/supabasePlayerStoryDeliveryRepository.ts";

const MAX_BODY_BYTES = 1024;

export interface PlayerStoryDeliveryHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: typeof readSupabaseEnv;
  readonly resolveScope?: (
    request: Request,
    client: EdgeSupabaseClient,
    effectiveAt: Date,
  ) => Promise<PlayerRequestScope>;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerStoryDeliveryRepository;
  readonly now?: () => Date;
}

export async function handlePlayerStoryDeliveryRequest(
  request: Request,
  route: PlayerStoryDeliveryRoute,
  dependencies: PlayerStoryDeliveryHttpHandlerDependencies,
): Promise<Response> {
  if (route.kind === "list" && request.method !== "GET") {
    return privateMethodNotAllowed("Use GET to load story deliveries.");
  }
  if (route.kind === "state" && request.method !== "POST") {
    return privateMethodNotAllowed("Use POST to update story delivery state.");
  }
  if (route.kind === "malformed") {
    return privateRequestError("Player story delivery route is malformed.");
  }
  if (request.headers.has("x-stock-market-runner-secret")) {
    return privateRequestError("Player story delivery requests must not send a runner secret.", "stock_runner_secret_not_allowed");
  }

  try {
    rejectQueryString(request);
    const action = route.kind === "state"
      ? await readStateAction(request)
      : null;
    const envResult = (dependencies.readSupabaseEnv ?? readSupabaseEnv)();
    if (!envResult.ok) {
      return privateJsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const client = dependencies.createServiceClient(envResult.value);
    const now = dependencies.now?.() ?? new Date();
    const scope = await (dependencies.resolveScope ?? defaultResolveScope)(
      request,
      client,
      now,
    );
    const repository = dependencies.createRepository
      ? dependencies.createRepository(client)
      : new SupabasePlayerStoryDeliveryRepository(client as never);

    if (route.kind === "list") {
      const items = await repository.listPendingDeliveries({
        gameId: scope.gameId,
        playerUuid: scope.playerUuid,
        limit: 10,
      });
      const body: PlayerStoryDeliveryListResponseBody = {
        ok: true,
        generatedAt: now.toISOString(),
        items: items.map((item) => ({
          deliveryId: item.publicDeliveryId,
          notificationId: item.publicNotificationId,
          category: item.category,
          title: item.title,
          summary: item.summary,
          priority: item.priority,
          displayMode: item.displayMode,
          publishedAt: item.publishedAt,
          deliveredAt: item.deliveredAt,
          seenAt: item.seenAt,
          acknowledgedAt: item.acknowledgedAt,
          requiresAcknowledgement: item.requiresAcknowledgement,
          content: item.content,
        })),
        emptyState: items.length === 0
          ? { reason: "story_deliveries_empty" }
          : null,
      };
      return privateJsonResponse(200, body);
    }

    const delivery = await repository.updateDeliveryState({
      gameId: scope.gameId,
      playerUuid: scope.playerUuid,
      publicDeliveryId: route.publicDeliveryId,
      action: action!,
      markedAt: now.toISOString(),
    });
    const body: PlayerStoryDeliveryStateResponseBody = {
      ok: true,
      action: action!,
      processedAt: now.toISOString(),
      delivery: {
        deliveryId: delivery.publicDeliveryId,
        notificationId: delivery.publicNotificationId,
        deliveredAt: delivery.deliveredAt,
        seenAt: delivery.seenAt,
        dismissedAt: delivery.dismissedAt,
        acknowledgedAt: delivery.acknowledgedAt,
        requiresAcknowledgement: delivery.requiresAcknowledgement,
      },
    };
    return privateJsonResponse(200, body);
  } catch (error) {
    if (
      error instanceof EdgeActivationError ||
      error instanceof PlayerStoryDeliveryError
    ) {
      return privateJsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    if (error instanceof PlayerStoryDeliveryPersistenceError) {
      return privateJsonError(503, {
        code: "player_story_delivery_service_unavailable",
        message: "Story deliveries are temporarily unavailable.",
        retryable: true,
      });
    }
    return privateJsonError(500, {
      code: "player_story_delivery_service_unavailable",
      message: "Story delivery request failed.",
      retryable: false,
    });
  }
}

async function defaultResolveScope(
  request: Request,
  client: EdgeSupabaseClient,
  effectiveAt: Date,
): Promise<PlayerRequestScope> {
  return resolvePlayerRequestScope(request, {
    hashSessionToken: sha256Hex,
    resolvePlayerSession: (tokenHash) =>
      resolveActivePlayerSession(client, tokenHash),
    now: () => effectiveAt,
  });
}

function rejectQueryString(request: Request): void {
  if (new URL(request.url).search) {
    throw new PlayerStoryDeliveryError(
      "invalid_player_story_delivery_request",
      "Player story delivery requests do not accept query parameters.",
      400,
      false,
    );
  }
}

async function readStateAction(
  request: Request,
): Promise<PlayerStoryDeliveryAction> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw invalidBody("Story delivery request body must use application/json.");
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw invalidBody("Story delivery request body is too large.");
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      throw invalidBody("Story delivery request body is too large.");
    }
    body = JSON.parse(raw);
  } catch (error) {
    if (error instanceof PlayerStoryDeliveryError) throw error;
    throw invalidBody("Story delivery request body must be valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw invalidBody("Story delivery request body must be a JSON object.");
  }
  const keys = Object.keys(body as Record<string, unknown>);
  if (keys.length !== 1 || keys[0] !== "action") {
    throw invalidBody("Story delivery request body accepts only action.");
  }
  const action = (body as Record<string, unknown>).action;
  if (
    typeof action !== "string" ||
    !PLAYER_STORY_DELIVERY_ACTIONS.includes(
      action as PlayerStoryDeliveryAction,
    )
  ) {
    throw invalidBody("Story delivery action is invalid.");
  }
  return action as PlayerStoryDeliveryAction;
}

function invalidBody(message: string): PlayerStoryDeliveryError {
  return new PlayerStoryDeliveryError(
    "invalid_player_story_delivery_request",
    message,
    400,
    false,
  );
}

function privateRequestError(message: string, code = "invalid_player_story_delivery_request"): Response {
  return privateJsonError(400, { code, message, retryable: false });
}

function privateMethodNotAllowed(message: string): Response {
  return privateJsonError(405, {
    code: "method_not_allowed",
    message,
    retryable: false,
  });
}

function privateJsonResponse<T>(status: number, body: T): Response {
  const response = jsonResponse<T>(status, body);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("pragma", "no-cache");
  response.headers.set("vary", "authorization, x-player-session-token");
  return response;
}

function privateJsonError(
  status: number,
  error: { readonly code: string; readonly message: string; readonly retryable: boolean },
): Response {
  const response = jsonError(status, error);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("pragma", "no-cache");
  response.headers.set("vary", "authorization, x-player-session-token");
  return response;
}
