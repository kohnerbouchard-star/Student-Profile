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
  GAME_PUBLIC_REALTIME_EVENTS,
  PLAYER_GAME_DASHBOARD_CUTSCENE_ACTIONS,
  type PlayerGameDashboardCutsceneAction,
  type PlayerGameDashboardCutsceneActionRequestBody,
  type PlayerGameDashboardCutsceneActionResponseBody,
  type PlayerGameDashboardCutsceneDeliveryStateDto,
  type PlayerGameDashboardRepository,
  type PlayerGameDashboardResponseBody,
  type PlayerGameDashboardStoryNotificationReader,
  type PlayerGameDashboardStoryNotificationRepository,
  type PlayerGameDashboardUnseenCutsceneDto,
} from "../contracts/playerGameDashboardContracts.ts";
import {
  PlayerGameDashboardError,
} from "../contracts/playerGameDashboardContracts.ts";
import {
  SupabasePlayerGameDashboardRepository,
} from "../infrastructure/supabasePlayerGameDashboardRepository.ts";
import {
  SupabaseStoryNotificationRepository,
} from "../../storylines/infrastructure/supabaseStoryNotificationRepository.ts";
import type {
  StoryNotificationDeliveryRecord,
  StoryNotificationDeliveryWithNotification,
} from "../../storylines/contracts/storyNotificationContracts.ts";
import {
  StoryNotificationRepositoryError,
} from "../../storylines/contracts/storyNotificationContracts.ts";

interface PlayerGameDashboardHttpDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: () =>
    | { readonly ok: true; readonly value: SupabaseEnv }
    | { readonly ok: false; readonly missing: readonly string[] };
  readonly hashSessionToken?: (sessionToken: string) => Promise<string>;
  readonly resolvePlayerSession?: (
    serviceClient: EdgeSupabaseClient,
    sessionTokenHash: string,
  ) => ReturnType<typeof resolveActivePlayerSession>;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerGameDashboardRepository;
  readonly createStoryNotificationRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerGameDashboardStoryNotificationRepository;
  readonly now?: () => string;
}

export async function handlePlayerGameDashboardRequest(
  request: Request,
  dependencies: PlayerGameDashboardHttpDependencies,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message:
        "Use GET to load the player game dashboard or POST to update cutscene delivery state.",
      retryable: false,
    });
  }

  if (request.headers.has("x-stock-market-runner-secret")) {
    return jsonError(400, {
      code: "stock_runner_secret_not_allowed",
      message:
        "Player dashboard requests must not send the stock market runner secret.",
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

    const url = new URL(request.url);
    rejectClientSuppliedIdentity(url.searchParams, request.headers);
    const sessionToken = readPlayerSessionTokenFromRequest(request);

    if (!sessionToken) {
      return invalidPlayerSessionResponse();
    }

    const actionRequest = request.method === "POST"
      ? await readCutsceneActionRequestBody(request)
      : null;
    const gameSessionId = actionRequest?.gameSessionId ??
      readDashboardGameSessionId(url.searchParams);
    const serviceClient = dependencies.createServiceClient(envResult.value);
    const sessionTokenHash = await (dependencies.hashSessionToken ?? sha256Hex)(
      sessionToken,
    );
    const sessionResult = await (dependencies.resolvePlayerSession ??
      resolveActivePlayerSession)(serviceClient, sessionTokenHash);

    if (!sessionResult.ok) {
      return jsonError(sessionResult.status, sessionResult.error);
    }

    if (sessionResult.session.game_session_id !== gameSessionId) {
      throw new EdgeActivationError(
        "invalid_player_session_scope",
        "Requested game session does not match the authenticated player session.",
        401,
        false,
      );
    }

    const createStoryNotificationRepository =
      dependencies.createStoryNotificationRepository;
    const storyNotificationRepository = createStoryNotificationRepository
      ? createStoryNotificationRepository(serviceClient)
      : new SupabaseStoryNotificationRepository(serviceClient as any);

    if (actionRequest) {
      const delivery = await markCutsceneDelivery({
        input: actionRequest,
        playerId: sessionResult.player.id,
        markedAt: (dependencies.now ?? (() => new Date().toISOString()))(),
        repository: storyNotificationRepository,
      });

      return jsonResponse<PlayerGameDashboardCutsceneActionResponseBody>(200, {
        ok: true,
        delivery: toDeliveryStateDto(delivery),
      });
    }

    const repository = dependencies.createRepository
      ? dependencies.createRepository(serviceClient)
      : new SupabasePlayerGameDashboardRepository(serviceClient as any);
    const snapshot = await repository.read({
      gameSessionId,
      playerSessionId: sessionResult.session.id,
      playerId: sessionResult.player.id,
      playerDisplayName: sessionResult.player.display_name,
      playerRosterLabel: sessionResult.player.roster_label,
    });
    const unseenCutscenes = await readUnseenCutscenes({
      repository: storyNotificationRepository,
      gameSessionId,
      playerId: sessionResult.player.id,
    });

    return jsonResponse<PlayerGameDashboardResponseBody>(200, {
      ok: true,
      ...snapshot,
      unseenCutscenes,
      realtime: {
        publicChannel: `game:${gameSessionId}:public`,
        lastSequence: null,
        events: GAME_PUBLIC_REALTIME_EVENTS,
      },
    });
  } catch (error) {
    if (error instanceof PlayerGameDashboardError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: false,
      });
    }

    if (
      request.method === "POST" &&
      error instanceof StoryNotificationRepositoryError
    ) {
      const notFound = error.code === "story_notification_delivery_not_found";

      return jsonError(notFound ? 404 : 500, {
        code: notFound
          ? "game_dashboard_cutscene_delivery_not_found"
          : "game_dashboard_cutscene_action_failed",
        message: notFound
          ? "Cutscene delivery could not be found for the authenticated player."
          : "Cutscene delivery state could not be updated.",
        retryable: false,
      });
    }

    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    const actionFailed = request.method === "POST";

    return jsonError(500, {
      code: actionFailed
        ? "game_dashboard_cutscene_action_failed"
        : "game_dashboard_read_failed",
      message: actionFailed
        ? "Cutscene delivery state could not be updated."
        : "Player game dashboard could not be loaded.",
      retryable: false,
    });
  }
}

async function readCutsceneActionRequestBody(
  request: Request,
): Promise<PlayerGameDashboardCutsceneActionRequestBody> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw invalidRequest("Cutscene action request body must be valid JSON.");
  }

  if (!isRecord(body)) {
    throw invalidRequest("Cutscene action request body must be a JSON object.");
  }

  rejectClientSuppliedBodyIdentity(body);

  const action = readCutsceneAction(body.action);
  const gameSessionId = readRequiredString(body.gameSessionId, "gameSessionId");
  const deliveryId = readRequiredString(body.deliveryId, "deliveryId");

  return {
    action,
    gameSessionId,
    deliveryId,
  };
}

function readDashboardGameSessionId(searchParams: URLSearchParams): string {
  const values = searchParams.getAll("gameSessionId");

  if (values.length !== 1) {
    throw invalidRequest(
      "Exactly one gameSessionId query parameter is required.",
    );
  }

  const value = values[0]?.trim() ?? "";

  if (!value) {
    throw invalidRequest("gameSessionId is required.");
  }

  return value;
}

function rejectClientSuppliedIdentity(
  searchParams: URLSearchParams,
  headers: Headers,
): void {
  for (
    const fieldName of [
      "playerId",
      "playerIds",
      "playerSessionId",
      "playerSessionIds",
      "sessionId",
      "sessionIds",
    ]
  ) {
    if (searchParams.has(fieldName)) {
      throw invalidRequest(
        "Player dashboard derives player identity from x-player-session-token.",
      );
    }
  }

  for (
    const headerName of [
      "x-player-id",
      "x-player-session-id",
      "x-player-session",
    ]
  ) {
    if (headers.has(headerName)) {
      throw invalidRequest(
        "Player dashboard derives player identity from x-player-session-token.",
      );
    }
  }
}

function rejectClientSuppliedBodyIdentity(body: Record<string, unknown>): void {
  for (
    const fieldName of [
      "playerId",
      "playerIds",
      "playerSessionId",
      "playerSessionIds",
      "sessionId",
      "sessionIds",
    ]
  ) {
    if (fieldName in body) {
      throw invalidRequest(
        "Player dashboard derives player identity from x-player-session-token.",
      );
    }
  }
}

function invalidRequest(message: string): EdgeActivationError {
  return new EdgeActivationError(
    "invalid_game_dashboard_request",
    message,
    400,
    false,
  );
}

async function markCutsceneDelivery(input: {
  readonly input: PlayerGameDashboardCutsceneActionRequestBody;
  readonly playerId: string;
  readonly markedAt: string;
  readonly repository: PlayerGameDashboardStoryNotificationRepository;
}): Promise<StoryNotificationDeliveryRecord> {
  const markInput = {
    deliveryId: input.input.deliveryId,
    gameSessionId: input.input.gameSessionId,
    playerId: input.playerId,
    markedAt: input.markedAt,
  };

  if (input.input.action === "mark_cutscene_seen") {
    return input.repository.markNotificationDeliverySeen(markInput);
  }

  if (input.input.action === "mark_cutscene_dismissed") {
    return input.repository.markNotificationDeliveryDismissed(markInput);
  }

  return input.repository.markNotificationDeliveryAcknowledged(markInput);
}

async function readUnseenCutscenes(input: {
  readonly repository: PlayerGameDashboardStoryNotificationReader;
  readonly gameSessionId: string;
  readonly playerId: string;
}): Promise<readonly PlayerGameDashboardUnseenCutsceneDto[]> {
  const deliveries = await input.repository.listUnseenStoryCutsceneDeliveries({
    gameSessionId: input.gameSessionId,
    playerId: input.playerId,
  });

  return deliveries.map(toUnseenCutsceneDto);
}

function toDeliveryStateDto(
  delivery: StoryNotificationDeliveryRecord,
): PlayerGameDashboardCutsceneDeliveryStateDto {
  return {
    deliveryId: delivery.id,
    notificationId: delivery.notificationId,
    deliveredAt: delivery.deliveredAt,
    seenAt: delivery.seenAt,
    dismissedAt: delivery.dismissedAt,
    acknowledgedAt: delivery.acknowledgedAt,
  };
}

function toUnseenCutsceneDto(
  delivery: StoryNotificationDeliveryWithNotification,
): PlayerGameDashboardUnseenCutsceneDto {
  return {
    deliveryId: delivery.id,
    notificationId: delivery.notificationId,
    title: delivery.notification.title,
    summary: delivery.notification.summary,
    priority: delivery.notification.priority,
    displayMode: delivery.notification.displayMode,
    payload: delivery.notification.payload,
    publishedAt: delivery.notification.publishedAt,
    deliveredAt: delivery.deliveredAt,
    requiresAcknowledgement:
      delivery.notification.payload.requiresAcknowledgement === true,
  };
}

function readCutsceneAction(
  value: unknown,
): PlayerGameDashboardCutsceneAction {
  if (
    typeof value === "string" &&
    PLAYER_GAME_DASHBOARD_CUTSCENE_ACTIONS.includes(
      value as PlayerGameDashboardCutsceneAction,
    )
  ) {
    return value as PlayerGameDashboardCutsceneAction;
  }

  throw invalidRequest("Cutscene action is invalid.");
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw invalidRequest(`${fieldName} is required.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw invalidRequest(`${fieldName} is required.`);
  }

  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
