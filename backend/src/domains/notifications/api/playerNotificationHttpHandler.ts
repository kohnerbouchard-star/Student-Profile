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
  PlayerNotificationError,
  type PlayerNotificationListResponseBody,
  type PlayerNotificationRepository,
  type PlayerNotificationRoute,
} from "../contracts/playerNotificationContracts.ts";
import { SupabasePlayerNotificationRepository } from "../infrastructure/supabasePlayerNotificationRepository.ts";
import { PlayerNotificationService } from "../services/playerNotificationService.ts";
import {
  encodePlayerNotificationCursor,
  parsePlayerNotificationListRequest,
  parsePlayerNotificationReadRequest,
} from "./playerNotificationRequestParser.ts";

export interface PlayerNotificationHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: typeof readSupabaseEnv;
  readonly hashSessionToken?: (token: string) => Promise<string>;
  readonly resolvePlayerSession?: (
    client: EdgeSupabaseClient,
    tokenHash: string,
  ) => ReturnType<typeof resolveActivePlayerSession>;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerNotificationRepository;
  readonly now?: () => Date;
}

export async function handlePlayerNotificationRequest(
  request: Request,
  route: PlayerNotificationRoute,
  dependencies: PlayerNotificationHttpHandlerDependencies,
): Promise<Response> {
  if (route.kind === "list" && request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to load player notifications.",
      retryable: false,
    });
  }
  if (route.kind === "markRead" && request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to mark player notifications read.",
      retryable: false,
    });
  }
  if (route.kind === "malformed") {
    return jsonError(400, {
      code: "invalid_player_notification_request",
      message: "Player notification route is malformed.",
      retryable: false,
    });
  }
  if (request.headers.has("x-stock-market-runner-secret")) {
    return jsonError(400, {
      code: "stock_runner_secret_not_allowed",
      message: "Player notification requests must not send a runner secret.",
      retryable: false,
    });
  }

  try {
    const listQuery = route.kind === "list"
      ? parsePlayerNotificationListRequest(request, route)
      : null;
    const readCommand = route.kind === "markRead"
      ? await parsePlayerNotificationReadRequest(request, route)
      : null;

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
      : new SupabasePlayerNotificationRepository(client as never);
    const service = new PlayerNotificationService(repository);
    const serviceScope = {
      gameId: scope.gameId,
      playerUuid: scope.playerUuid,
      effectiveAt: now.toISOString(),
    };

    if (listQuery) {
      const result = await service.listNotifications(serviceScope, listQuery);
      const body: PlayerNotificationListResponseBody = {
        ok: true,
        generatedAt: serviceScope.effectiveAt,
        availability: "available",
        filter: {
          status: listQuery.status,
          limit: listQuery.limit,
        },        page: {
        returned: result.items.length,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor
          ? encodePlayerNotificationCursor(result.nextCursor)
          : null,
      },
      summary: {
        unreadCount: result.unreadCount,
      },
      items: result.items,
        emptyState: result.items.length === 0
          ? { reason: "notifications_empty" }
          : null,
      };
      return privateJsonResponse(200, body);
    }

    if (readCommand) {
      const body = await service.markNotificationsRead(
        serviceScope,
        readCommand,
      );
      return privateJsonResponse(200, body);
    }

    throw new PlayerNotificationError(
      "invalid_player_notification_request",
      "Player notification route state is invalid.",
      400,
      false,
    );
  } catch (error) {
    if (
      error instanceof EdgeActivationError ||
      error instanceof PlayerNotificationError
    ) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    return jsonError(500, {
      code: "player_notification_read_failed",
      message: "Player notification request failed.",
      retryable: false,
    });
  }
}

function privateJsonResponse<T>(status: number, body: T): Response {
  const response = jsonResponse<T>(status, body);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("vary", "authorization, x-player-session-token");
  return response;
}
