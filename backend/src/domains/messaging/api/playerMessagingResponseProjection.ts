import type { RawInbox } from "../contracts/playerMessageInboxRead.ts";
export type { RawInbox } from "../contracts/playerMessageInboxRead.ts";
import { jsonError, jsonResponse } from "../../../platform/supabase/edgeResponse.ts";

interface RpcError { readonly code?: string; readonly message: string }

interface RawMessage {
  readonly id?: unknown;
  readonly senderType?: unknown;
  readonly senderName?: unknown;
  readonly senderReference?: unknown;
  readonly body?: unknown;
  readonly moderated?: unknown;
  readonly self?: unknown;
  readonly createdAt?: unknown;
}

export interface RawThread {
  readonly id?: unknown;
  readonly type?: unknown;
  readonly title?: unknown;
  readonly contractKey?: unknown;
  readonly status?: unknown;
  readonly allowPlayerReplies?: unknown;
  readonly participantCount?: unknown;
  readonly unreadCount?: unknown;
  readonly updatedAt?: unknown;
  readonly retentionUntil?: unknown;
  readonly messages?: unknown;
}

export interface SendRow {
  readonly send_outcome?: unknown;
  readonly thread_id?: unknown;
  readonly message_id?: unknown;
  readonly sender_name?: unknown;
  readonly message_body?: unknown;
  readonly created_at?: unknown;
}

export interface ReadRow {
  readonly thread_id?: unknown;
  readonly read_at?: unknown;
  readonly unread_count?: unknown;
}

export interface InboxCursor { readonly beforeUpdatedAt: string; readonly beforeThreadId: string }

export function parseInboxCursor(value: string | null): InboxCursor | null | undefined {
  if (value === null || value === "") return null;
  if (value.length > 128 || hasUnsafeText(value)) return undefined;
  const separator = value.lastIndexOf("|");
  if (separator <= 0) return undefined;
  const beforeUpdatedAt = value.slice(0, separator);
  const beforeThreadId = value.slice(separator + 1);
  if (!/^thr_[0-9a-f]{32}$/.test(beforeThreadId)) return undefined;
  const timestamp = Date.parse(beforeUpdatedAt);
  if (!Number.isFinite(timestamp)) return undefined;
  return Object.freeze({
    beforeUpdatedAt: new Date(timestamp).toISOString(),
    beforeThreadId,
  });
}

export function normalizeInbox(value: RawInbox | null) {
  if (!isRecord(value)) throw new Error("invalid inbox response");
  const rawThreads = Array.isArray(value.threads) ? value.threads : null;
  const unread = safeInteger(value.unreadCount, 0, 100000);
  const pageUnread = safeInteger(value.pageUnreadCount, 0, 100000);
  const nextCursor = value.nextCursor === null || value.nextCursor === undefined
    ? ""
    : requiredText(value.nextCursor, 128);
  if (!rawThreads || rawThreads.length > 50 || unread === null || pageUnread === null) {
    throw new Error("invalid inbox response");
  }
  const threads = rawThreads.map(normalizeThread);
  if (threads.reduce((sum, thread) => sum + thread.unread, 0) !== pageUnread) {
    throw new Error("inconsistent page unread count");
  }
  if (nextCursor && parseInboxCursor(nextCursor) === undefined) {
    throw new Error("invalid next cursor");
  }
  return Object.freeze({
    unread,
    pageUnread,
    nextCursor,
    threads: Object.freeze(threads),
  });
}

export function normalizeThread(value: unknown) {
  if (!isRecord(value)) throw new Error("invalid thread");
  const id = publicId(value.id, /^thr_[0-9a-f]{32}$/);
  const type = enumText(value.type, ["announcement", "system", "player", "contract"]);
  const title = requiredText(value.title, 160);
  const status = enumText(value.status, ["active", "disabled", "closed"]);
  const unread = safeInteger(value.unreadCount, 0, 100000);
  const participantCount = safeInteger(value.participantCount, 1, 500);
  const updatedAt = isoTimestamp(value.updatedAt);
  const retentionUntil = isoTimestamp(value.retentionUntil);
  const rawMessages = Array.isArray(value.messages) ? value.messages : null;
  if (unread === null || participantCount === null || !rawMessages || rawMessages.length > 100) throw new Error("invalid thread");
  const messages = rawMessages.map(normalizeMessage);
  const last = messages.at(-1);
  const tone = type === "announcement" ? "amber" : type === "system" ? "cyan" : type === "contract" ? "purple" : "green";
  return Object.freeze({
    id,
    type: type === "announcement" ? "Administrator announcement" : type === "system" ? "System message" : type === "contract" ? "Contract thread" : "Player thread",
    threadType: type,
    title,
    contractKey: optionalText(value.contractKey, 160),
    status: status === "active" ? "Online" : status === "disabled" ? "Disabled" : "Closed",
    rawStatus: status,
    allowPlayerReplies: value.allowPlayerReplies === true,
    members: `${participantCount} participant${participantCount === 1 ? "" : "s"}`,
    participantCount,
    unread,
    preview: last?.body ?? "No messages yet.",
    time: updatedAt,
    updatedAt,
    retentionUntil,
    initials: initials(title),
    tone,
    messages: Object.freeze(messages),
  });
}

function normalizeMessage(value: unknown) {
  if (!isRecord(value)) throw new Error("invalid message");
  const sender = requiredText(value.senderName, 160);
  const time = isoTimestamp(value.createdAt);
  return Object.freeze({
    id: publicId(value.id, /^msg_[0-9a-f]{32}$/),
    senderType: enumText(value.senderType, ["player", "staff_user", "system"]),
    sender,
    senderReference: optionalText(value.senderReference, 160),
    initials: initials(sender),
    body: requiredText(value.body, 1000),
    time,
    createdAt: time,
    moderated: value.moderated === true,
    self: value.self === true,
    attachment: "",
  });
}

export function normalizeSendRow(value: SendRow | undefined, expectedThreadId: string) {
  if (!isRecord(value)) throw new Error("invalid send response");
  const outcome = enumText(value.send_outcome, ["applied", "replayed"]);
  const threadId = publicId(value.thread_id, /^thr_[0-9a-f]{32}$/);
  if (threadId !== expectedThreadId) throw new Error("thread identity mismatch");
  return Object.freeze({
    outcome,
    threadId,
    message: Object.freeze({
      id: publicId(value.message_id, /^msg_[0-9a-f]{32}$/),
      sender: requiredText(value.sender_name, 160),
      body: requiredText(value.message_body, 1000),
      createdAt: isoTimestamp(value.created_at),
      self: true,
    }),
  });
}

export function normalizeReadRow(value: ReadRow | undefined, expectedThreadId: string) {
  if (!isRecord(value)) throw new Error("invalid read response");
  const threadId = publicId(value.thread_id, /^thr_[0-9a-f]{32}$/);
  if (threadId !== expectedThreadId || safeInteger(value.unread_count, 0, 0) !== 0) throw new Error("read identity mismatch");
  return Object.freeze({ threadId, readAt: isoTimestamp(value.read_at), unreadCount: 0 });
}

export function mapRpcError(error: RpcError): Response {
  const message = error.message.toUpperCase();
  const lower = error.message.toLowerCase();
  if (error.code === "42P01" || error.code === "42703" || error.code === "42883" || lower.includes("does not exist") || lower.includes("schema cache")) {
    return messagingError(503, "player_messaging_schema_not_applied", "Messaging is unavailable in this runtime.", true);
  }
  if (message.includes("PLAYER_MESSAGE_THREAD_NOT_FOUND") || message.includes("PLAYER_MESSAGES_SCOPE_FORBIDDEN")) {
    return messagingError(404, "player_message_thread_not_found", "Message thread was not found.");
  }
  if (message.includes("PLAYER_MESSAGE_IDEMPOTENCY_CONFLICT")) {
    return messagingError(409, "player_message_idempotency_conflict", "This idempotency key was already used for another message.");
  }
  if (message.includes("PLAYER_MESSAGE_GAME_NOT_ACTIVE")) {
    return messagingError(409, "game_not_active", "Messages cannot be sent while the game is not active.");
  }
  if (message.includes("PLAYER_MESSAGE_THREAD_DISABLED") || message.includes("PLAYER_MESSAGE_REPLIES_DISABLED")) {
    return messagingError(423, "player_message_thread_locked", "This message thread does not accept replies.");
  }
  if (message.includes("_INVALID")) return messagingError(400, "invalid_player_message_request", "Player messaging request is invalid.");
  return messagingError(500, "player_messaging_failed", "Player messaging request failed.");
}

export function privateJsonResponse<T>(status: number, body: T): Response {
  const response = jsonResponse<T>(status, body);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("pragma", "no-cache");
  response.headers.set("vary", "authorization, x-player-session-token");
  return response;
}

export function messagingError(status: number, code: string, message: string, retryable = false): Response {
  return jsonError(status, { code, message, retryable });
}

export function hasUnsafeText(value: string): boolean {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value) || /(?:^|[\s"'(<])(?:javascript|vbscript|data|file):/i.test(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value: unknown, maximum: number): string {
  if (typeof value !== "string") throw new Error("invalid text");
  const result = value.trim();
  if (!result || result.length > maximum || hasUnsafeText(result)) throw new Error("invalid text");
  return result;
}

function optionalText(value: unknown, maximum: number): string {
  if (value === null || value === undefined || value === "") return "";
  return requiredText(value, maximum);
}

function enumText<const T extends string>(value: unknown, values: readonly T[]): T {
  const result = requiredText(value, 64) as T;
  if (!values.includes(result)) throw new Error("invalid enum");
  return result;
}

function publicId(value: unknown, pattern: RegExp): string {
  const result = requiredText(value, 64);
  if (!pattern.test(result)) throw new Error("invalid public id");
  return result;
}

function safeInteger(value: unknown, minimum: number, maximum: number): number | null {
  const result = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(result) && result >= minimum && result <= maximum ? result : null;
}

function isoTimestamp(value: unknown): string {
  const source = requiredText(value, 64);
  const timestamp = Date.parse(source);
  if (!Number.isFinite(timestamp)) throw new Error("invalid timestamp");
  return new Date(timestamp).toISOString();
}

function initials(value: string): string {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "M";
}
