import {
  THREAD_ID_PATTERN,
  type ThreadType,
  type ThreadStatus,
  THREAD_TYPES,
  THREAD_STATUSES,
  MESSAGE_ID_PATTERN,
  type CreateRow,
  type ModerationRow,
  type ModerationAction,
  ACTION_ID_PATTERN,
  type DeletionRow,
  type RpcError,
  type MessagingOperationResult,
  IDEMPOTENCY_PATTERN,
} from "./messagingOperationContracts.ts";


export function normalizeThreadRead(value: unknown): { readonly threads: readonly unknown[] } {
  if (!isRecord(value) || !Array.isArray(value.threads) || value.threads.length > 51) {
    throw new Error("invalid thread read");
  }
  return { threads: value.threads };
}


export function normalizeThread(value: unknown) {
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


export function normalizeCreateRow(value: CreateRow | undefined) {
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


export function normalizeModerationRow(
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


export function normalizeDeletionRow(value: DeletionRow | undefined, expectedThreadId: string) {
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


export function threadMatches(thread: ReturnType<typeof normalizeThread>, query: string): boolean {
  const needle = query.toLocaleLowerCase();
  return [
    thread.title,
    thread.contractKey,
    thread.type,
    ...thread.participants.flatMap((participant) => [participant.reference, participant.displayName, participant.rosterLabel]),
    ...thread.messages.flatMap((message) => [message.senderName, message.body]),
  ].some((value) => String(value || "").toLocaleLowerCase().includes(needle));
}


export function summarize(threads: readonly { readonly status: ThreadStatus }[]) {
  return Object.freeze({
    returned: threads.length,
    active: threads.filter((thread) => thread.status === "active").length,
    disabled: threads.filter((thread) => thread.status === "disabled").length,
    closed: threads.filter((thread) => thread.status === "closed").length,
  });
}


export function rpcError(error: RpcError): MessagingOperationResult {
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


export function readIdempotencyKey(request: Request, bodyValue: unknown): string {
  const bodyKey = typeof bodyValue === "string" ? bodyValue.trim() : "";
  const headerKey = request.headers.get("x-idempotency-key")?.trim() ?? request.headers.get("x-request-id")?.trim() ?? "";
  if (bodyKey && headerKey && bodyKey !== headerKey) return "";
  const key = bodyKey || headerKey;
  return IDEMPOTENCY_PATTERN.test(key) ? key : "";
}


export function methodNotAllowed(message: string): MessagingOperationResult {
  return errorResult(405, "method_not_allowed", message);
}

export function invalid(message: string): MessagingOperationResult {
  return errorResult(400, "invalid_messaging_request", message);
}

export function failed(): MessagingOperationResult {
  return errorResult(500, "messaging_failed", "Messaging request could not be completed.");
}

export function errorResult(status: number, code: string, message: string, retryable = false): MessagingOperationResult {
  return { handled: true, status, body: { code, message, retryable } };
}

export function boundedInteger(value: string | null, fallback: number, minimum: number, maximum: number): number | null {
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

export function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function validatedInputText(value: unknown, maximum: number, optional: boolean): string {
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

export function outputText(value: unknown, maximum: number): string {
  const result = text(value);
  if (!result || result.length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(result)) {
    throw new Error("invalid text");
  }
  return result;
}

export function optionalOutputText(value: unknown, maximum: number): string {
  return value === null || value === undefined || value === "" ? "" : outputText(value, maximum);
}

export function timestamp(value: unknown): string {
  const parsed = Date.parse(text(value));
  if (!Number.isFinite(parsed)) throw new Error("invalid timestamp");
  return new Date(parsed).toISOString();
}

export function optionalTimestamp(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : timestamp(value);
}

export function identifier(value: unknown, pattern: RegExp): string {
  const result = text(value);
  if (!pattern.test(result)) throw new Error("invalid identifier");
  return result;
}

export function integer(value: unknown, minimum: number, maximum: number): number {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) throw new Error("invalid integer");
  return result;
}

export function enumValue<const T extends string>(value: unknown, values: readonly T[]): T {
  const result = text(value) as T;
  if (!values.includes(result)) throw new Error("invalid enum");
  return result;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
