import {
  type AdminService,
  type MessagingOperationResult,
  type ModerationAction,
  THREAD_STATUSES,
  type ThreadStatus,
  type ThreadType,
  PLAYER_ID_PATTERN,
  THREAD_TYPES,
  type CreateRow,
  type ModerationRow,
  type DeletionRow,
} from "./messagingOperationContracts.ts";
import {
  methodNotAllowed,
  invalid,
  boundedInteger,
  validatedInputText,
  rpcError,
  normalizeThreadRead,
  normalizeThread,
  threadMatches,
  summarize,
  failed,
  isRecord,
  text,
  optionalTimestamp,
  readIdempotencyKey,
  normalizeCreateRow,
  normalizeModerationRow,
  normalizeDeletionRow,
} from "./messagingOperationValidation.ts";


export async function handleMessagingOperation(
  service: AdminService,
  input: {
    readonly request: Request;
    readonly gameId: string;
    readonly staffUserId: string;
    readonly suffix: string;
  },
): Promise<MessagingOperationResult> {
  if (input.suffix === "/messages") {
    if (input.request.method !== "GET") {
      return methodNotAllowed("Use GET to load message threads.");
    }
    return await readThreads(service, input);
  }

  if (input.suffix === "/messages/threads") {
    if (input.request.method !== "POST") {
      return methodNotAllowed("Use POST to create a message thread.");
    }
    return await createThread(service, input);
  }

  const threadAction = input.suffix.match(
    /^\/messages\/threads\/(thr_[0-9a-f]{32})\/(disable|enable|close)$/,
  );
  if (threadAction) {
    if (input.request.method !== "POST") {
      return methodNotAllowed("Use POST to moderate a message thread.");
    }
    return await moderate(
      service,
      input,
      threadAction[1],
      null,
      `${threadAction[2]}_thread` as ModerationAction,
    );
  }

  const messageAction = input.suffix.match(
    /^\/messages\/threads\/(thr_[0-9a-f]{32})\/messages\/(msg_[0-9a-f]{32})\/(hide|unhide)$/,
  );
  if (messageAction) {
    if (input.request.method !== "POST") {
      return methodNotAllowed("Use POST to moderate a message.");
    }
    return await moderate(
      service,
      input,
      messageAction[1],
      messageAction[2],
      `${messageAction[3]}_message` as ModerationAction,
    );
  }

  const deleteMatch = input.suffix.match(
    /^\/messages\/threads\/(thr_[0-9a-f]{32})\/delete$/,
  );
  if (deleteMatch) {
    if (input.request.method !== "POST") {
      return methodNotAllowed("Use POST to delete expired message content.");
    }
    return await deleteExpiredThread(service, input, deleteMatch[1]);
  }

  return input.suffix.startsWith("/messages")
    ? invalid("Messaging route is malformed.")
    : { handled: false };
}


async function readThreads(
  service: AdminService,
  input: Parameters<typeof handleMessagingOperation>[1],
): Promise<MessagingOperationResult> {
  try {
    const url = new URL(input.request.url);
    for (const key of url.searchParams.keys()) {
      if (
        !["q", "status", "limit", "offset"].includes(key) ||
        url.searchParams.getAll(key).length !== 1
      ) {
        return invalid(`Unsupported or repeated query parameter: ${key}.`);
      }
    }
    const statusValue = url.searchParams.get("status")?.trim().toLowerCase() ?? "all";
    const status = statusValue === "all"
      ? null
      : THREAD_STATUSES.has(statusValue as ThreadStatus)
      ? statusValue as ThreadStatus
      : undefined;
    const limit = boundedInteger(url.searchParams.get("limit"), 25, 1, 50);
    const offset = boundedInteger(url.searchParams.get("offset"), 0, 0, 10000);
    const query = url.searchParams.has("q")
      ? validatedInputText(url.searchParams.get("q"), 100, false)
      : "";
    if (
      status === undefined || limit === null || offset === null ||
      (url.searchParams.has("q") && !query)
    ) {
      return invalid("Messaging filters, search, or pagination are invalid.");
    }

    const response = await service.rpc<Record<string, unknown>>(
      "read_admin_message_threads_v1",
      {
        p_game_session_id: input.gameId,
        p_staff_user_id: input.staffUserId,
        p_status: status,
        p_limit: query ? 51 : limit + 1,
        p_offset: offset,
      },
    );
    if (response.error) return rpcError(response.error);
    const raw = normalizeThreadRead(response.data);
    const normalized = raw.threads.map(normalizeThread);
    const filtered = query
      ? normalized.filter((thread) => threadMatches(thread, query))
      : normalized;
    const hasMore = filtered.length > limit;
    const threads = filtered.slice(0, limit);
    return {
      handled: true,
      status: 200,
      body: {
        data: {
          threads,
          summary: summarize(threads),
          pagination: {
            limit,
            offset,
            returned: threads.length,
            hasMore,
          },
          filters: { status: status ?? "all", query },
        },
      },
    };
  } catch {
    return failed();
  }
}


async function createThread(
  service: AdminService,
  input: Parameters<typeof handleMessagingOperation>[1],
): Promise<MessagingOperationResult> {
  try {
    if (new URL(input.request.url).searchParams.size) {
      return invalid("Message creation does not accept query parameters.");
    }
    const value = await input.request.clone().json().catch(() => null);
    if (!isRecord(value)) return invalid("Provide a valid message-thread JSON object.");
    const allowed = new Set([
      "type",
      "title",
      "contractKey",
      "allowPlayerReplies",
      "playerIds",
      "targetAllPlayers",
      "body",
      "retentionUntil",
      "idempotencyKey",
    ]);
    if (Object.keys(value).some((key) => !allowed.has(key))) {
      return invalid("Message-thread request contains unsupported fields.");
    }
    const type = text(value.type).toLowerCase() as ThreadType;
    const title = validatedInputText(value.title, 160, false);
    const contractKey = validatedInputText(value.contractKey, 160, true);
    const body = validatedInputText(value.body, 1000, true);
    const targetAllPlayers = value.targetAllPlayers === true;
    const rawPlayerIds = Array.isArray(value.playerIds) ? value.playerIds : [];
    if (rawPlayerIds.length > 500) {
      return invalid("A message thread may target at most 500 explicit players.");
    }
    const parsedPlayerIds = rawPlayerIds.map((item) => text(item));
    if (parsedPlayerIds.some((item) => !PLAYER_ID_PATTERN.test(item))) {
      return invalid("Player recipients must use valid public Player IDs.");
    }
    const playerIds = [...new Set(parsedPlayerIds)];
    const allowPlayerReplies = value.allowPlayerReplies === true;
    const retentionUntil = optionalTimestamp(value.retentionUntil);
    const idempotencyKey = readIdempotencyKey(input.request, value.idempotencyKey);
    if (
      !THREAD_TYPES.has(type) || !title ||
      (type === "contract" && !contractKey) ||
      (type !== "contract" && contractKey) ||
      (["announcement", "system"].includes(type) && allowPlayerReplies) ||
      (!targetAllPlayers && playerIds.length === 0) ||
      !idempotencyKey
    ) {
      return invalid("Message-thread request is invalid.");
    }

    const response = await service.rpc<readonly CreateRow[]>(
      "create_admin_message_thread_atomic_v1",
      {
        p_game_session_id: input.gameId,
        p_staff_user_id: input.staffUserId,
        p_thread_type: type,
        p_title: title,
        p_contract_key: contractKey || null,
        p_allow_player_replies: allowPlayerReplies,
        p_player_identifiers: playerIds,
        p_target_all_players: targetAllPlayers,
        p_initial_body: body || null,
        p_retention_until: retentionUntil,
        p_idempotency_key: idempotencyKey,
      },
    );
    if (response.error) return rpcError(response.error);
    const result = normalizeCreateRow(response.data?.[0]);
    return {
      handled: true,
      status: result.outcome === "applied" ? 201 : 200,
      body: { data: result },
    };
  } catch {
    return failed();
  }
}


async function moderate(
  service: AdminService,
  input: Parameters<typeof handleMessagingOperation>[1],
  threadId: string,
  messageId: string | null,
  action: ModerationAction,
): Promise<MessagingOperationResult> {
  try {
    if (new URL(input.request.url).searchParams.size) {
      return invalid("Message moderation does not accept query parameters.");
    }
    const value = await input.request.clone().json().catch(() => null);
    if (!isRecord(value) || Object.keys(value).some((key) => !["reason", "idempotencyKey"].includes(key))) {
      return invalid("Provide a valid moderation JSON object.");
    }
    const reason = validatedInputText(value.reason, 1000, true);
    const requiresReason = ["disable_thread", "close_thread", "hide_message"].includes(action);
    const idempotencyKey = readIdempotencyKey(input.request, value.idempotencyKey);
    if ((requiresReason && !reason) || !idempotencyKey) {
      return invalid(requiresReason ? "A moderation reason is required." : "A safe idempotency key is required.");
    }

    const response = await service.rpc<readonly ModerationRow[]>(
      "moderate_admin_message_atomic_v1",
      {
        p_game_session_id: input.gameId,
        p_staff_user_id: input.staffUserId,
        p_thread_public_id: threadId,
        p_message_public_id: messageId,
        p_action: action,
        p_reason: reason || null,
        p_idempotency_key: idempotencyKey,
      },
    );
    if (response.error) return rpcError(response.error);
    return {
      handled: true,
      status: 200,
      body: { data: normalizeModerationRow(response.data?.[0], threadId, messageId, action) },
    };
  } catch {
    return failed();
  }
}


async function deleteExpiredThread(
  service: AdminService,
  input: Parameters<typeof handleMessagingOperation>[1],
  threadId: string,
): Promise<MessagingOperationResult> {
  try {
    if (new URL(input.request.url).searchParams.size) {
      return invalid("Retention deletion does not accept query parameters.");
    }
    const value = await input.request.clone().json().catch(() => null);
    if (!isRecord(value) || Object.keys(value).some((key) => !["reason", "idempotencyKey"].includes(key))) {
      return invalid("Provide a valid retention-deletion JSON object.");
    }
    const reason = validatedInputText(value.reason, 1000, false);
    const idempotencyKey = readIdempotencyKey(input.request, value.idempotencyKey);
    if (!reason || !idempotencyKey) {
      return invalid("Retention deletion requires a reason and safe idempotency key.");
    }
    const response = await service.rpc<readonly DeletionRow[]>(
      "delete_expired_admin_message_thread_atomic_v1",
      {
        p_game_session_id: input.gameId,
        p_staff_user_id: input.staffUserId,
        p_thread_public_id: threadId,
        p_reason: reason,
        p_idempotency_key: idempotencyKey,
      },
    );
    if (response.error) return rpcError(response.error);
    return {
      handled: true,
      status: 200,
      body: { data: normalizeDeletionRow(response.data?.[0], threadId) },
    };
  } catch {
    return failed();
  }
}
export type { MessagingOperationResult } from "./messagingOperationContracts.ts";
