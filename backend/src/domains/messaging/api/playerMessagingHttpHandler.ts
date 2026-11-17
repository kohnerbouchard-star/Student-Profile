import { readPlayerMessageInbox } from "../application/readPlayerMessageInbox.ts";
import { createSupabasePlayerMessageInboxReadRepository } from "../infrastructure/supabasePlayerMessageInboxReadRepository.ts";
import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import { EdgeActivationError, jsonError } from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  type PlayerRequestScope,
  resolveActivePlayerSession,
  resolvePlayerRequestScope,
} from "../../players/index.ts";
import type { PlayerMessagingRoute } from "./playerMessagingRoutePaths.ts";
import type {
  RawThread,
  SendRow,
  ReadRow,
} from "./playerMessagingResponseProjection.ts";
import {
  messagingError,
  mapRpcError,
  privateJsonResponse,
  normalizeThread,
  normalizeInbox,
  normalizeSendRow,
  normalizeReadRow,
} from "./playerMessagingResponseProjection.ts";
import type { ReadRoute } from "./playerMessagingRequestParser.ts";
import {
  parseReadRequest,
  parseSendCommand,
  invalidResult,
} from "./playerMessagingRequestParser.ts";

export interface PlayerMessagingHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: typeof readSupabaseEnv;
  readonly hashSessionToken?: (token: string) => Promise<string>;
  readonly resolvePlayerSession?: (
    client: EdgeSupabaseClient,
    tokenHash: string,
  ) => ReturnType<typeof resolveActivePlayerSession>;
  readonly now?: () => Date;
}

export async function handlePlayerMessagingRequest(
  request: Request,
  route: PlayerMessagingRoute,
  dependencies: PlayerMessagingHttpHandlerDependencies,
): Promise<Response> {
  const methodError = validateMethod(request.method, route.kind);
  if (methodError) return methodError;
  if (route.kind === "malformed") {
    return messagingError(400, "invalid_player_message_request", "Player messaging route is malformed.");
  }
  if (request.headers.has("x-stock-market-runner-secret")) {
    return messagingError(400, "stock_runner_secret_not_allowed", "Player messaging requests must not send a runner secret.");
  }

  try {
    const envResult = (dependencies.readSupabaseEnv ?? readSupabaseEnv)();
    if (!envResult.ok) {
      return messagingError(500, "missing_edge_runtime_config", "Classroom API runtime configuration is incomplete.");
    }
    const client = dependencies.createServiceClient(envResult.value);
    const now = dependencies.now?.() ?? new Date();
    const scope = await resolvePlayerRequestScope(request, {
      hashSessionToken: dependencies.hashSessionToken ?? sha256Hex,
      resolvePlayerSession: (tokenHash) =>
        (dependencies.resolvePlayerSession ?? resolveActivePlayerSession)(client, tokenHash),
      now: () => now,
    });

    switch (route.kind) {
      case "list":
      case "search":
      case "thread":
        return await handleRead(request, route, client, scope);
      case "send":
        return await handleSend(request, route.threadId, client, scope.gameId, scope.playerUuid);
      case "markRead":
        if (!route.threadId) {
          return messagingError(400, "invalid_player_message_request", "A valid public message thread ID is required.");
        }
        return await handleReadReceipt(request, route.threadId, client, scope.gameId, scope.playerUuid, now);
      default:
        return messagingError(400, "invalid_player_message_request", "Player messaging route is malformed.");
    }
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    return messagingError(500, "player_messaging_failed", "Player messaging request failed.");
  }
}

async function handleRead(
  request: Request,
  route: ReadRoute,
  client: EdgeSupabaseClient,
  scope: PlayerRequestScope,
): Promise<Response> {
  const readRequest = parseReadRequest(request, route);
  if (!readRequest.ok) return readRequest.response;

  if (route.kind === "thread") {
    const response = await client.rpc<RawThread>("read_player_message_thread_v1", {
      p_game_session_id: scope.gameId,
      p_player_id: scope.playerUuid,
      p_thread_public_id: route.threadId,
      p_message_limit: readRequest.limits.messageLimit,
    });
    if (response.error) return mapRpcError(response.error);
    return privateJsonResponse(200, {
      ok: true,
      data: { thread: normalizeThread(response.data) },
    });
  }

  const response = await readPlayerMessageInbox(scope, {
    threadLimit: readRequest.limits.threadLimit,
    messageLimit: readRequest.limits.messageLimit,
    query: route.kind === "search" ? readRequest.query : null,
    beforeUpdatedAt: readRequest.cursor?.beforeUpdatedAt ?? null,
    beforeThreadId: readRequest.cursor?.beforeThreadId ?? null,
  }, createSupabasePlayerMessageInboxReadRepository(client));
  if (response.error) return mapRpcError(response.error);
  const inbox = normalizeInbox(response.data);

  if (route.kind === "search") {
    return privateJsonResponse(200, {
      ok: true,
      data: Object.freeze({ query: readRequest.query, ...inbox }),
    });
  }
  return privateJsonResponse(200, { ok: true, data: inbox });
}

async function handleSend(
  request: Request,
  threadId: string,
  client: EdgeSupabaseClient,
  gameId: string,
  playerId: string,
): Promise<Response> {
  const command = await parseSendCommand(request);
  if (!command.ok) return command.response;
  const response = await client.rpc<readonly SendRow[]>("send_player_message_atomic_v1", {
    p_game_session_id: gameId,
    p_player_id: playerId,
    p_thread_public_id: threadId,
    p_body: command.body,
    p_idempotency_key: command.idempotencyKey,
  });
  if (response.error) return mapRpcError(response.error);
  const result = normalizeSendRow(response.data?.[0], threadId);
  return privateJsonResponse(result.outcome === "applied" ? 201 : 200, { ok: true, data: result });
}

async function handleReadReceipt(
  request: Request,
  threadId: string,
  client: EdgeSupabaseClient,
  gameId: string,
  playerId: string,
  now: Date,
): Promise<Response> {
  if (new URL(request.url).searchParams.size) {
    return invalidResult("Message read receipts do not accept query parameters.").response;
  }
  const response = await client.rpc<readonly ReadRow[]>("mark_player_message_thread_read_v1", {
    p_game_session_id: gameId,
    p_player_id: playerId,
    p_thread_public_id: threadId,
    p_read_at: now.toISOString(),
  });
  if (response.error) return mapRpcError(response.error);
  return privateJsonResponse(200, {
    ok: true,
    data: normalizeReadRow(response.data?.[0], threadId),
  });
}

function validateMethod(method: string, kind: PlayerMessagingRoute["kind"]): Response | null {
  if ((kind === "list" || kind === "search" || kind === "thread") && method !== "GET") {
    return messagingError(405, "method_not_allowed", "Use GET to load player messages.");
  }
  if ((kind === "send" || kind === "markRead") && method !== "POST") {
    return messagingError(405, "method_not_allowed", "Use POST for this player messaging action.");
  }
  return null;
}
