/// <reference lib="dom" />

import {
  EdgeActivationError,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  invalidPlayerSessionResponse,
  readPlayerSessionTokenFromRequest,
  resolveActivePlayerSession,
} from "../../players/api/playerSessionHttpHelpers.ts";
import {
  readRequestedGameSessionId,
  rejectClientSuppliedPlayerIdentity,
  requireMatchingPlayerGameSession,
} from "../../players/api/playerRequestScope.ts";
import type {
  PlayerNotificationItemDto,
  PlayerNotificationListResponseBody,
  PlayerNotificationReadResponseBody,
  PlayerNotificationRecord,
} from "../contracts/playerNotificationContracts.ts";
import type {
  PlayerNotificationDeliveryStateRecord,
  PlayerNotificationRepository,
} from "../infrastructure/playerNotificationRepository.ts";
import {
  PlayerNotificationPersistenceError,
  SupabasePlayerNotificationRepository,
} from "../infrastructure/supabasePlayerNotificationRepository.ts";
import {
  encodePlayerNotificationCursor,
  parsePlayerNotificationListRequest,
  parsePlayerNotificationReadRequest,
} from "./playerNotificationRequestParser.ts";
import type { PlayerNotificationRoute } from "./playerNotificationRoutePaths.ts";

export interface PlayerNotificationHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: typeof readSupabaseEnv;
  readonly hashSessionToken?: (sessionToken: string) => Promise<string>;
  readonly resolvePlayerSession?: typeof resolveActivePlayerSession;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerNotificationRepository;
  readonly now?: () => string;
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

  if (request.headers.has("x-stock-market-runner-secret")) {
    return jsonError(400, {
      code: "stock_runner_secret_not_allowed",
      message: "Player notification requests must not send a runner secret.",
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

    rejectClientSuppliedPlayerIdentity(request);
    const requestedGameSessionId = readRequestedGameSessionId(request);
    const listRequest = route.kind === "list"
      ? parsePlayerNotificationListRequest(request)
      : null;
    const readRequest = route.kind === "markRead"
      ? await parsePlayerNotificationReadRequest(request)
      : null;
    const sessionToken = readPlayerSessionTokenFromRequest(request);

    if (!sessionToken) {
      return invalidPlayerSessionResponse();
    }

    const serviceClient = dependencies.createServiceClient(envResult.value);
    const sessionTokenHash = await (dependencies.hashSessionToken ?? sha256Hex)(
      sessionToken,
    );
    const sessionResult = await (dependencies.resolvePlayerSession ??
      resolveActivePlayerSession)(serviceClient, sessionTokenHash);

    if (!sessionResult.ok) {
      return jsonError(sessionResult.status, sessionResult.error);
    }

    requireMatchingPlayerGameSession(
      requestedGameSessionId,
      sessionResult.session.game_session_id,
    );

    const repository = dependencies.createRepository
      ? dependencies.createRepository(serviceClient)
      : new SupabasePlayerNotificationRepository(serviceClient as never);
    const now = dependencies.now ?? (() => new Date().toISOString());

    if (route.kind === "list" && listRequest) {
      const page = await repository.listPlayerNotifications({
        gameSessionId: sessionResult.session.game_session_id,
        playerId: sessionResult.session.player_id,
        status: listRequest.status,
        limit: listRequest.limit,
        cursor: listRequest.cursor,
      });

      if (
        page.records.some((record) =>
          record.gameSessionId !== sessionResult.session.game_session_id ||
          record.playerId !== sessionResult.session.player_id
        )
      ) {
        return notificationScopeViolationResponse();
      }

      return jsonResponse<PlayerNotificationListResponseBody>(200, {
        ok: true,
        gameSession: {
          id: sessionResult.gameSession.id,
          name: sessionResult.gameSession.name,
          status: sessionResult.gameSession.status,
        },
        player: {
          id: sessionResult.player.id,
          displayName: sessionResult.player.display_name,
          rosterLabel: sessionResult.player.roster_label ?? null,
          status: sessionResult.player.status,
        },
        generatedAt: now(),
        filter: {
          status: listRequest.status,
          limit: listRequest.limit,
        },
        page: {
          hasMore: page.hasMore,
          nextCursor: page.nextCursor
            ? encodePlayerNotificationCursor(page.nextCursor)
            : null,
        },
        items: page.records.map(toPlayerNotificationItemDto),
      });
    }

    if (route.kind === "markRead" && readRequest) {
      return await markPlayerNotificationsRead({
        repository,
        gameSessionId: sessionResult.session.game_session_id,
        playerId: sessionResult.session.player_id,
        deliveryIds: readRequest.deliveryIds,
        processedAt: now(),
      });
    }

    return jsonError(500, {
      code: "player_notification_route_state_invalid",
      message: "Player notification request failed.",
      retryable: false,
    });
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    if (error instanceof PlayerNotificationPersistenceError) {
      return jsonError(500, {
        code: error.code,
        message: error.message,
        retryable: false,
      });
    }

    return jsonError(500, {
      code: route.kind === "markRead"
        ? "player_notification_mark_read_failed"
        : "player_notification_read_failed",
      message: route.kind === "markRead"
        ? "Notifications could not be marked read."
        : "Player notifications could not be loaded.",
      retryable: false,
    });
  }
}

async function markPlayerNotificationsRead(input: {
  readonly repository: PlayerNotificationRepository;
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly deliveryIds: readonly string[];
  readonly processedAt: string;
}): Promise<Response> {
  const existing = await input.repository.readPlayerDeliveriesByIds({
    gameSessionId: input.gameSessionId,
    playerId: input.playerId,
    deliveryIds: input.deliveryIds,
  });

  if (hasScopeViolation(existing, input.gameSessionId, input.playerId)) {
    return notificationScopeViolationResponse();
  }

  if (!hasExactDeliverySet(existing, input.deliveryIds)) {
    return jsonError(404, {
      code: "player_notification_deliveries_not_found",
      message:
        "One or more notification deliveries were not found for the authenticated player.",
      retryable: false,
    });
  }

  const unreadIds = existing
    .filter((delivery) => delivery.seenAt === null)
    .map((delivery) => delivery.deliveryId);
  const updated = await input.repository.markPlayerDeliveriesRead({
    gameSessionId: input.gameSessionId,
    playerId: input.playerId,
    deliveryIds: unreadIds,
    seenAt: input.processedAt,
  });

  if (
    hasScopeViolation(updated, input.gameSessionId, input.playerId) ||
    updated.some((delivery) =>
      !unreadIds.includes(delivery.deliveryId) || delivery.seenAt === null
    )
  ) {
    return notificationScopeViolationResponse();
  }

  const finalDeliveries = await input.repository.readPlayerDeliveriesByIds({
    gameSessionId: input.gameSessionId,
    playerId: input.playerId,
    deliveryIds: input.deliveryIds,
  });

  if (
    !hasExactDeliverySet(finalDeliveries, input.deliveryIds) ||
    finalDeliveries.some((delivery) => delivery.seenAt === null)
  ) {
    return jsonError(409, {
      code: "player_notification_read_conflict",
      message: "Notification delivery state changed during the request.",
      retryable: true,
    });
  }

  if (hasScopeViolation(finalDeliveries, input.gameSessionId, input.playerId)) {
    return notificationScopeViolationResponse();
  }

  const finalById = new Map(
    finalDeliveries.map((delivery) => [delivery.deliveryId, delivery]),
  );
  const updatedIds = new Set(updated.map((delivery) => delivery.deliveryId));
  const ordered = input.deliveryIds.map((deliveryId) =>
    finalById.get(deliveryId) as PlayerNotificationDeliveryStateRecord
  );

  return jsonResponse<PlayerNotificationReadResponseBody>(200, {
    ok: true,
    message: "Notifications marked read.",
    requestedCount: input.deliveryIds.length,
    newlyReadCount: updatedIds.size,
    alreadyReadCount: input.deliveryIds.length - updatedIds.size,
    processedAt: input.processedAt,
    deliveries: ordered.map((delivery) => ({
      deliveryId: delivery.deliveryId,
      notificationId: delivery.notificationId,
      seenAt: delivery.seenAt as string,
    })),
  });
}

function toPlayerNotificationItemDto(
  record: PlayerNotificationRecord,
): PlayerNotificationItemDto {
  return {
    id: record.deliveryId,
    deliveryId: record.deliveryId,
    notificationId: record.notificationId,
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    notificationType: record.notificationType,
    title: record.title,
    summary: record.summary,
    priority: record.priority,
    displayMode: record.displayMode,
    status: record.dismissedAt
      ? "dismissed"
      : record.seenAt
      ? "read"
      : "unread",
    publishedAt: record.publishedAt,
    deliveredAt: record.deliveredAt,
    seenAt: record.seenAt,
    dismissedAt: record.dismissedAt,
    acknowledgedAt: record.acknowledgedAt,
  };
}

function hasExactDeliverySet(
  records: readonly PlayerNotificationDeliveryStateRecord[],
  expectedIds: readonly string[],
): boolean {
  const actualIds = new Set(records.map((record) => record.deliveryId));

  return actualIds.size === expectedIds.length &&
    expectedIds.every((deliveryId) => actualIds.has(deliveryId));
}

function hasScopeViolation(
  records: readonly PlayerNotificationDeliveryStateRecord[],
  gameSessionId: string,
  playerId: string,
): boolean {
  return records.some((record) =>
    record.gameSessionId !== gameSessionId || record.playerId !== playerId
  );
}

function notificationScopeViolationResponse(): Response {
  return jsonError(500, {
    code: "player_notification_scope_violation",
    message: "Player notification request failed.",
    retryable: false,
  });
}
