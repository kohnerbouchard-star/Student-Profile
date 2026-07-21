type ThreadStatus = "active" | "disabled" | "closed";
type ThreadType = "announcement" | "system" | "player" | "contract";
type ModerationAction =
  | "disable_thread"
  | "enable_thread"
  | "close_thread"
  | "hide_message"
  | "unhide_message";

interface RpcError {
  readonly code?: string;
  readonly message: string;
}

interface RpcResponse<T> {
  readonly data: T | null;
  readonly error: RpcError | null;
}

interface AdminService {
  rpc<T>(name: string, args: unknown): PromiseLike<RpcResponse<T>>;
}

interface CreateRow {
  readonly create_outcome?: unknown;
  readonly thread_id?: unknown;
  readonly created_thread_type?: unknown;
  readonly thread_title?: unknown;
  readonly thread_status?: unknown;
  readonly participant_count?: unknown;
  readonly created_at?: unknown;
}

interface ModerationRow {
  readonly moderation_outcome?: unknown;
  readonly action_id?: unknown;
  readonly thread_id?: unknown;
  readonly message_id?: unknown;
  readonly moderation_action?: unknown;
  readonly thread_status?: unknown;
  readonly message_hidden?: unknown;
  readonly created_at?: unknown;
}

interface DeletionRow {
  readonly deletion_outcome?: unknown;
  readonly action_id?: unknown;
  readonly thread_id?: unknown;
  readonly deleted_message_count?: unknown;
  readonly created_at?: unknown;
}

export interface MessagingOperationResult {
  readonly handled: boolean;
  readonly status?: number;
  readonly body?: unknown;
}

const THREAD_ID_PATTERN = /^thr_[0-9a-f]{32}$/;
const MESSAGE_ID_PATTERN = /^msg_[0-9a-f]{32}$/;
const ACTION_ID_PATTERN = /^mda_[0-9a-f]{32}$/;
const PLAYER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const THREAD_TYPES = new Set<ThreadType>([
  "announcement",
  "system",
  "player",
  "contract",
]);
const THREAD_STATUSES = new Set<ThreadStatus>([
  "active",
  "disabled",
  "closed",
]);

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

function normalizeThreadRead(value: unknown): { readonly threads: readonly unknown[] } {
  if (!isRecord(value) || !Array.isArray(value.threads) || value.threads.length > 51) {
    throw new Error("invalid thread read");
  }
  return { threads: value.threads };
}

function normalizeThread(value: unknown) {
  if (!isRecord(value)) throw new Error("invalid thread");
  const id = identifier(value.id, THREAD_ID_PATTERN);
  const type = text(value.type).toLowerCase() as ThreadType;
  const status = text(value.status).toLowerCase() as ThreadStatus;
  if (!THREAD_TYPES.has(type) || !THREAD_STATUSES.has(status)) throw new Error("invalid thread");
  const participants = Array.isArray(value.participants) ? value.participants.slice(0, 500).map((item) => {
    if (!isRecord(item)) throw new Error("invalid participant");
    return Object.freeze({
      reference: optionalOutputText(item.reference, 160),
      displayName: outputText(item.displayName, 160) || "Player",
      rosterLabel: optionalOutputText(item.rosterLabel, 160),
      lastReadAt: optionalTimestamp(item.lastReadAt),
    });
  }) : [];
  const messages = Array.isArray(value.messages) ? value.messages.slice(0, 100).map((item) => {
    if (!isRecord(item)) throw new Error("invalid message");
    return Object.freeze({
      id: identifier(item.id, MESSAGE_ID_PATTERN),
      senderType: text(item.senderType),
      senderName: outputText(item.senderName, 160) || "Unknown sender",
      body: outputText(item.body, 1000),
      hidden: item.hidden === true,
      hiddenReason: optionalOutputText(item.hiddenReason, 1000),
      createdAt: timestamp(item.createdAt),
    });
  }) : [];
  return Object.freeze({
    id,
    type,
    title: outputText(value.title, 160),
    contractKey: optionalOutputText(value.contractKey, 160),
    allowPlayerReplies: value.allowPlayerReplies === true,
    status,
    moderationReason: optionalOutputText(value.moderationReason, 1000),
    retentionUntil: timestamp(value.retentionUntil),
    expired: Date.parse(timestamp(value.retentionUntil)) <= Date.now(),
    createdAt: timestamp(value.createdAt),
    updatedAt: timestamp(value.updatedAt),
    participants: Object.freeze(participants),
    messages: Object.freeze(messages),
  });
}

function normalizeCreateRow(value: CreateRow | undefined) {
  if (!isRecord(value)) throw new Error("invalid create response");
  const outcome = enumValue(value.create_outcome, ["applied", "replayed"]);
  const type = enumValue(value.created_thread_type, [...THREAD_TYPES]);
  const status = enumValue(value.thread_status, [...THREAD_STATUSES]);
  return Object.freeze({
    outcome,
    thread: Object.freeze({
      id: identifier(value.thread_id, THREAD_ID_PATTERN),
      type,
      title: outputText(value.thread_title, 160),
      status,
      participantCount: integer(value.participant_count, 1, 500),
      createdAt: timestamp(value.created_at),
    }),
  });
}

function normalizeModerationRow(
  value: ModerationRow | undefined,
  expectedThreadId: string,
  expectedMessageId: string | null,
  expectedAction: ModerationAction,
) {
  if (!isRecord(value)) throw new Error("invalid moderation response");
  const threadId = identifier(value.thread_id, THREAD_ID_PATTERN);
  const messageId = value.message_id === null || value.message_id === undefined
    ? null
    : identifier(value.message_id, MESSAGE_ID_PATTERN);
  const action = enumValue(value.moderation_action, [
    "disable_thread",
    "enable_thread",
    "close_thread",
    "hide_message",
    "unhide_message",
  ]);
  if (threadId !== expectedThreadId || messageId !== expectedMessageId || action !== expectedAction) {
    throw new Error("moderation identity mismatch");
  }
  return Object.freeze({
    outcome: enumValue(value.moderation_outcome, ["applied", "replayed"]),
    actionId: identifier(value.action_id, ACTION_ID_PATTERN),
    threadId,
    messageId,
    action,
    threadStatus: enumValue(value.thread_status, [...THREAD_STATUSES]),
    messageHidden: value.message_hidden === true,
    createdAt: timestamp(value.created_at),
  });
}

function normalizeDeletionRow(value: DeletionRow | undefined, expectedThreadId: string) {
  if (!isRecord(value)) throw new Error("invalid deletion response");
  const threadId = identifier(value.thread_id, THREAD_ID_PATTERN);
  if (threadId !== expectedThreadId) throw new Error("deletion identity mismatch");
  return Object.freeze({
    outcome: enumValue(value.deletion_outcome, ["applied", "replayed"]),
    actionId: identifier(value.action_id, ACTION_ID_PATTERN),
    threadId,
    deletedMessageCount: integer(value.deleted_message_count, 0, 100000),
    createdAt: timestamp(value.created_at),
  });
}

function threadMatches(thread: ReturnType<typeof normalizeThread>, query: string): boolean {
  const needle = query.toLocaleLowerCase();
  return [
    thread.title,
    thread.contractKey,
    thread.type,
    ...thread.participants.flatMap((participant) => [participant.reference, participant.displayName, participant.rosterLabel]),
    ...thread.messages.flatMap((message) => [message.senderName, message.body]),
  ].some((value) => String(value || "").toLocaleLowerCase().includes(needle));
}

function summarize(threads: readonly { readonly status: ThreadStatus }[]) {
  return Object.freeze({
    returned: threads.length,
    active: threads.filter((thread) => thread.status === "active").length,
    disabled: threads.filter((thread) => thread.status === "disabled").length,
    closed: threads.filter((thread) => thread.status === "closed").length,
  });
}

function rpcError(error: RpcError): MessagingOperationResult {
  const message = error.message.toUpperCase();
  const lower = error.message.toLowerCase();
  if (
    error.code === "42P01" || error.code === "42703" || error.code === "42883" ||
    lower.includes("does not exist") || lower.includes("schema cache")
  ) return errorResult(503, "messaging_schema_not_applied", "Messaging is unavailable in this runtime.", true);
  if (message.includes("SCOPE_FORBIDDEN")) return errorResult(404, "message_thread_not_found", "Message thread was not found.");
  if (message.includes("THREAD_NOT_FOUND") || message.includes("MESSAGE_NOT_FOUND")) return errorResult(404, "message_thread_not_found", "Message thread or message was not found.");
  if (message.includes("IDEMPOTENCY_CONFLICT")) return errorResult(409, "message_idempotency_conflict", "This idempotency key was already used for another action.");
  if (message.includes("PARTICIPANTS_NOT_FOUND")) return errorResult(422, "message_participants_not_found", "No active players matched the requested recipients.");
  if (message.includes("RETENTION_NOT_EXPIRED")) return errorResult(409, "message_retention_not_expired", "Message content cannot be deleted before retention expires.");
  if (message.includes("_INVALID")) return invalid("Messaging request is invalid.");
  return failed();
}

function readIdempotencyKey(request: Request, bodyValue: unknown): string {
  const bodyKey = typeof bodyValue === "string" ? bodyValue.trim() : "";
  const headerKey = request.headers.get("x-idempotency-key")?.trim() ?? request.headers.get("x-request-id")?.trim() ?? "";
  if (bodyKey && headerKey && bodyKey !== headerKey) return "";
  const key = bodyKey || headerKey;
  return IDEMPOTENCY_PATTERN.test(key) ? key : "";
}

function methodNotAllowed(message: string): MessagingOperationResult {
  return errorResult(405, "method_not_allowed", message);
}
function invalid(message: string): MessagingOperationResult {
  return errorResult(400, "invalid_messaging_request", message);
}
function failed(): MessagingOperationResult {
  return errorResult(500, "messaging_failed", "Messaging request could not be completed.");
}
function errorResult(status: number, code: string, message: string, retryable = false): MessagingOperationResult {
  return { handled: true, status, body: { code, message, retryable } };
}
function boundedInteger(value: string | null, fallback: number, minimum: number, maximum: number): number | null {
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function validatedInputText(value: unknown, maximum: number, optional: boolean): string {
  if (value === null || value === undefined || value === "") return optional ? "" : "";
  const result = text(value);
  if (
    !result || result.length > maximum ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(result) ||
    /(?:^|[\s"'(<])(?:javascript|vbscript|data|file):/i.test(result) ||
    (result.match(/https?:\/\/[^\s<>{}\[\]"']+/gi)?.length ?? 0) > 10 ||
    result.split(/\r?\n/).length > 50
  ) return "";
  return result;
}
function outputText(value: unknown, maximum: number): string {
  const result = text(value);
  if (!result || result.length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(result)) {
    throw new Error("invalid text");
  }
  return result;
}
function optionalOutputText(value: unknown, maximum: number): string {
  return value === null || value === undefined || value === "" ? "" : outputText(value, maximum);
}
function timestamp(value: unknown): string {
  const parsed = Date.parse(text(value));
  if (!Number.isFinite(parsed)) throw new Error("invalid timestamp");
  return new Date(parsed).toISOString();
}
function optionalTimestamp(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : timestamp(value);
}
function identifier(value: unknown, pattern: RegExp): string {
  const result = text(value);
  if (!pattern.test(result)) throw new Error("invalid identifier");
  return result;
}
function integer(value: unknown, minimum: number, maximum: number): number {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) throw new Error("invalid integer");
  return result;
}
function enumValue<const T extends string>(value: unknown, values: readonly T[]): T {
  const result = text(value) as T;
  if (!values.includes(result)) throw new Error("invalid enum");
  return result;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
