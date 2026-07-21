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
import type { PlayerMessagingRoute } from "./playerMessagingRoutePaths.ts";

interface RpcError {
  readonly code?: string;
  readonly message: string;
}

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

interface RawThread {
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

interface RawInbox {
  readonly unreadCount?: unknown;
  readonly threads?: unknown;
}

interface SendRow {
  readonly send_outcome?: unknown;
  readonly thread_id?: unknown;
  readonly message_id?: unknown;
  readonly sender_name?: unknown;
  readonly message_body?: unknown;
  readonly created_at?: unknown;
}

interface ReadRow {
  readonly thread_id?: unknown;
  readonly read_at?: unknown;
  readonly unread_count?: unknown;
}

interface InboxLimits {
  readonly threadLimit: number;
  readonly messageLimit: number;
}

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
    return messagingError(
      400,
      "invalid_player_message_request",
      "Player messaging route is malformed.",
    );
  }
  if (request.headers.has("x-stock-market-runner-secret")) {
    return messagingError(
      400,
      "stock_runner_secret_not_allowed",
      "Player messaging requests must not send a runner secret.",
    );
  }

  try {
    const envResult = (dependencies.readSupabaseEnv ?? readSupabaseEnv)();
    if (!envResult.ok) {
      return messagingError(
        500,
        "missing_edge_runtime_config",
        "Classroom API runtime configuration is incomplete.",
      );
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

    if (["list", "search", "thread"].includes(route.kind)) {
      const readRequest = parseReadRequest(request, route);
      if (!readRequest.ok) return readRequest.response;
      const response = await client.rpc<RawInbox>("read_player_messages_v1", {
        p_game_session_id: scope.gameId,
        p_player_id: scope.playerUuid,
        p_thread_limit: readRequest.limits.threadLimit,
        p_message_limit: readRequest.limits.messageLimit,
      });
      if (response.error) return mapRpcError(response.error);
      const inbox = normalizeInbox(response.data);

      if (route.kind === "thread") {
        const thread = inbox.threads.find((item) => item.id === route.threadId);
        return thread
          ? privateJsonResponse(200, { ok: true, data: { thread } })
          : messagingError(
            404,
            "player_message_thread_not_found",
            "Message thread was not found.",
          );
      }

      if (route.kind === "search") {
        const threads = inbox.threads.filter((thread) =>
          threadMatches(thread, readRequest.query)
        );
        return privateJsonResponse(200, {
          ok: true,
          data: Object.freeze({
            query: readRequest.query,
            unread: threads.reduce((sum, thread) => sum + thread.unread, 0),
            threads: Object.freeze(threads),
          }),
        });
      }

      return privateJsonResponse(200, { ok: true, data: inbox });
    }

    if (route.kind === "send") {
      const command = await parseSendCommand(request);
      if (!command.ok) return command.response;
      const response = await client.rpc<readonly SendRow[]>(
        "send_player_message_atomic_v1",
        {
          p_game_session_id: scope.gameId,
          p_player_id: scope.playerUuid,
          p_thread_public_id: route.threadId,
          p_body: command.body,
          p_idempotency_key: command.idempotencyKey,
        },
      );
      if (response.error) return mapRpcError(response.error);
      const row = response.data?.[0];
      const result = normalizeSendRow(row, route.threadId);
      return privateJsonResponse(result.outcome === "applied" ? 201 : 200, {
        ok: true,
        data: result,
      });
    }

    if (new URL(request.url).searchParams.size) {
      return invalidResult("Message read receipts do not accept query parameters.").response;
    }
    const response = await client.rpc<readonly ReadRow[]>(
      "mark_player_message_thread_read_v1",
      {
        p_game_session_id: scope.gameId,
        p_player_id: scope.playerUuid,
        p_thread_public_id: route.threadId,
        p_read_at: now.toISOString(),
      },
    );
    if (response.error) return mapRpcError(response.error);
    return privateJsonResponse(200, {
      ok: true,
      data: normalizeReadRow(response.data?.[0], route.threadId),
    });
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    return messagingError(
      500,
      "player_messaging_failed",
      "Player messaging request failed.",
    );
  }
}

function validateMethod(
  method: string,
  kind: PlayerMessagingRoute["kind"],
): Response | null {
  if (["list", "search", "thread"].includes(kind) && method !== "GET") {
    return messagingError(405, "method_not_allowed", "Use GET to load player messages.");
  }
  if ((kind === "send" || kind === "markRead") && method !== "POST") {
    return messagingError(405, "method_not_allowed", "Use POST for this player messaging action.");
  }
  return null;
}

function parseReadRequest(
  request: Request,
  route: Extract<PlayerMessagingRoute, { readonly kind: "list" | "search" | "thread" }>,
):
  | { readonly ok: true; readonly limits: InboxLimits; readonly query: string }
  | { readonly ok: false; readonly response: Response } {
  const url = new URL(request.url);
  if (route.kind === "thread") {
    return url.searchParams.size
      ? invalidResult("Message thread reads do not accept query parameters.")
      : {
        ok: true,
        limits: { threadLimit: 50, messageLimit: 100 },
        query: "",
      };
  }

  const allowed = new Set(
    route.kind === "search"
      ? ["q", "threadLimit", "messageLimit"]
      : ["threadLimit", "messageLimit"],
  );
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) {
      return invalidResult(`Unsupported or repeated query parameter: ${key}.`);
    }
  }
  const threadLimit = boundedInteger(url.searchParams.get("threadLimit"), 25, 1, 50);
  const messageLimit = boundedInteger(url.searchParams.get("messageLimit"), 50, 1, 100);
  if (threadLimit === null || messageLimit === null) {
    return invalidResult("Message pagination is invalid.");
  }
  const query = route.kind === "search"
    ? String(url.searchParams.get("q") ?? "").trim()
    : "";
  if (
    route.kind === "search" &&
    (!query || query.length > 100 || hasUnsafeText(query))
  ) {
    return invalidResult("Message search requires 1 to 100 safe text characters.");
  }
  return { ok: true, limits: { threadLimit, messageLimit }, query };
}

async function parseSendCommand(request: Request): Promise<
  | { readonly ok: true; readonly body: string; readonly idempotencyKey: string }
  | { readonly ok: false; readonly response: Response }
> {
  if (new URL(request.url).searchParams.size) {
    return invalidResult("Message send does not accept query parameters.");
  }
  const value = await request.clone().json().catch(() => null);
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !["body", "idempotencyKey"].includes(key))
  ) {
    return invalidResult("Provide a valid message JSON object.");
  }
  const body = typeof value.body === "string" ? value.body.trim() : "";
  if (
    !body ||
    body.length > 1000 ||
    body.split(/\r?\n/).length > 50 ||
    hasUnsafeText(body) ||
    countHttpLinks(body) > 10
  ) {
    return invalidResult(
      "Message body must contain 1 to 1000 safe text characters, at most 50 lines, and no more than 10 links.",
    );
  }
  const bodyKey = typeof value.idempotencyKey === "string"
    ? value.idempotencyKey.trim()
    : "";
  const headerKey = request.headers.get("x-idempotency-key")?.trim() ??
    request.headers.get("x-request-id")?.trim() ?? "";
  if (bodyKey && headerKey && bodyKey !== headerKey) {
    return invalidResult("Request and header idempotency keys must match.");
  }
  const idempotencyKey = bodyKey || headerKey;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(idempotencyKey)) {
    return invalidResult("A safe idempotency key is required.");
  }
  return { ok: true, body, idempotencyKey };
}

function normalizeInbox(value: RawInbox | null) {
  if (!isRecord(value)) throw new Error("invalid inbox response");
  const rawThreads = Array.isArray(value.threads) ? value.threads : null;
  const unread = safeInteger(value.unreadCount, 0, 100000);
  if (!rawThreads || rawThreads.length > 50 || unread === null) {
    throw new Error("invalid inbox response");
  }
  const threads = rawThreads.map((item) => normalizeThread(item));
  if (threads.reduce((sum, thread) => sum + thread.unread, 0) !== unread) {
    throw new Error("inconsistent unread count");
  }
  return Object.freeze({ unread, threads: Object.freeze(threads) });
}

function normalizeThread(value: unknown) {
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
  if (unread === null || participantCount === null || !rawMessages || rawMessages.length > 100) {
    throw new Error("invalid thread");
  }
  const messages = rawMessages.map((message) => normalizeMessage(message));
  const last = messages.at(-1);
  const tone = type === "announcement"
    ? "amber"
    : type === "system"
    ? "cyan"
    : type === "contract"
    ? "purple"
    : "green";
  return Object.freeze({
    id,
    type: type === "announcement"
      ? "Administrator announcement"
      : type === "system"
      ? "System message"
      : type === "contract"
      ? "Contract thread"
      : "Player thread",
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
  const id = publicId(value.id, /^msg_[0-9a-f]{32}$/);
  const senderType = enumText(value.senderType, ["player", "staff_user", "system"]);
  const sender = requiredText(value.senderName, 160);
  const body = requiredText(value.body, 1000);
  const time = isoTimestamp(value.createdAt);
  return Object.freeze({
    id,
    senderType,
    sender,
    senderReference: optionalText(value.senderReference, 160),
    initials: initials(sender),
    body,
    time,
    createdAt: time,
    moderated: value.moderated === true,
    self: value.self === true,
    attachment: "",
  });
}

function normalizeSendRow(value: SendRow | undefined, expectedThreadId: string) {
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

function normalizeReadRow(value: ReadRow | undefined, expectedThreadId: string) {
  if (!isRecord(value)) throw new Error("invalid read response");
  const threadId = publicId(value.thread_id, /^thr_[0-9a-f]{32}$/);
  if (threadId !== expectedThreadId || safeInteger(value.unread_count, 0, 0) !== 0) {
    throw new Error("read identity mismatch");
  }
  return Object.freeze({
    threadId,
    readAt: isoTimestamp(value.read_at),
    unreadCount: 0,
  });
}

function threadMatches(
  thread: ReturnType<typeof normalizeThread>,
  query: string,
): boolean {
  const needle = query.toLocaleLowerCase();
  return [thread.title, thread.contractKey, thread.type, ...thread.messages.flatMap((message) => [message.sender, message.body])]
    .some((value) => String(value || "").toLocaleLowerCase().includes(needle));
}

function mapRpcError(error: RpcError): Response {
  const message = error.message.toUpperCase();
  const lower = error.message.toLowerCase();
  if (
    error.code === "42P01" || error.code === "42703" || error.code === "42883" ||
    lower.includes("does not exist") || lower.includes("schema cache")
  ) {
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
  if (message.includes("_INVALID")) {
    return messagingError(400, "invalid_player_message_request", "Player messaging request is invalid.");
  }
  return messagingError(500, "player_messaging_failed", "Player messaging request failed.");
}

function privateJsonResponse<T>(status: number, body: T): Response {
  const response = jsonResponse<T>(status, body);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("vary", "authorization, x-player-session-token");
  return response;
}

function messagingError(
  status: number,
  code: string,
  message: string,
  retryable = false,
): Response {
  return jsonError(status, { code, message, retryable });
}

function invalidResult(message: string) {
  return {
    ok: false as const,
    response: messagingError(400, "invalid_player_message_request", message),
  };
}

function boundedInteger(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function hasUnsafeText(value: string): boolean {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value) ||
    /(?:^|[\s"'(<])(?:javascript|vbscript|data|file):/i.test(value);
}

function countHttpLinks(value: string): number {
  return value.match(/https?:\/\/[^\s<>{}\[\]"']+/gi)?.length ?? 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value: unknown, maximum: number): string {
  if (typeof value !== "string") throw new Error("invalid text");
  const result = value.trim();
  if (!result || result.length > maximum || hasUnsafeText(result)) {
    throw new Error("invalid text");
  }
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
  return Number.isSafeInteger(result) && result >= minimum && result <= maximum
    ? result
    : null;
}

function isoTimestamp(value: unknown): string {
  const source = requiredText(value, 64);
  const timestamp = Date.parse(source);
  if (!Number.isFinite(timestamp)) throw new Error("invalid timestamp");
  return new Date(timestamp).toISOString();
}

function initials(value: string): string {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) =>
    part[0]?.toUpperCase() ?? ""
  ).join("") || "M";
}
