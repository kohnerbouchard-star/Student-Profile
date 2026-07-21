import {
  handleMessagingOperation as handleCoreMessagingOperation,
  type MessagingOperationResult,
} from "./messagingOperationsCore.ts";

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

const THREAD = /^thr_[0-9a-f]{32}$/;
const MESSAGE = /^msg_[0-9a-f]{32}$/;
const ACTION = /^mda_[0-9a-f]{32}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type { MessagingOperationResult } from "./messagingOperationsCore.ts";

export async function handleMessagingOperation(
  service: AdminService,
  input: {
    readonly request: Request;
    readonly gameId: string;
    readonly staffUserId: string;
    readonly suffix: string;
  },
): Promise<MessagingOperationResult> {
  if (input.suffix === "/messages/policy") {
    return handlePolicy(service, input);
  }

  if (
    input.suffix === "/messages/threads" &&
    input.request.method === "POST"
  ) {
    const validation = await validateCreateRequestText(input.request);
    if (validation) return validation;
  }

  const threadAction = input.suffix.match(
    /^\/messages\/threads\/(thr_[0-9a-f]{32})\/(disable|enable|close)$/,
  );
  const messageAction = input.suffix.match(
    /^\/messages\/threads\/(thr_[0-9a-f]{32})\/messages\/(msg_[0-9a-f]{32})\/(hide|unhide)$/,
  );
  if (threadAction || messageAction) {
    if (input.request.method !== "POST") {
      return response(405, "method_not_allowed", "Use POST to moderate Messaging content.");
    }
    const action = threadAction
      ? `${threadAction[2]}_thread`
      : `${messageAction?.[3]}_message`;
    return handleStrictModeration(
      service,
      input,
      (threadAction?.[1] ?? messageAction?.[1]) as string,
      messageAction?.[2] ?? null,
      action,
    );
  }

  return handleCoreMessagingOperation(service, input);
}

async function validateCreateRequestText(
  request: Request,
): Promise<MessagingOperationResult | null> {
  const value = await request.clone().json().catch(() => null);
  if (!record(value)) return null;

  for (const [field, maximum] of [
    ["contractKey", 160],
    ["body", 1000],
  ] as const) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) continue;
    const supplied = value[field];
    if (supplied === null || supplied === undefined || supplied === "") continue;
    if (!safeInputText(supplied, maximum)) {
      return response(
        400,
        "invalid_admin_message_request",
        `Messaging ${field} contains unsafe or invalid text.`,
      );
    }
  }

  if (Object.prototype.hasOwnProperty.call(value, "retentionUntil")) {
    const supplied = value.retentionUntil;
    if (
      supplied !== null && supplied !== undefined && supplied !== "" &&
      (typeof supplied !== "string" || !Number.isFinite(Date.parse(supplied)))
    ) {
      return response(
        400,
        "invalid_admin_message_request",
        "Messaging retentionUntil must be a valid timestamp.",
      );
    }
  }

  return null;
}

function safeInputText(value: unknown, maximum: number): boolean {
  if (typeof value !== "string") return false;
  const result = value.trim();
  return Boolean(result) &&
    result.length <= maximum &&
    !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(result) &&
    !/(?:^|[\s"'(<])(?:javascript|vbscript|data|file):/i.test(result) &&
    (result.match(/https?:\/\/[^\s<>{}\[\]"']+/gi)?.length ?? 0) <= 10 &&
    result.split(/\r?\n/).length <= 50;
}

async function handlePolicy(
  service: AdminService,
  input: {
    readonly request: Request;
    readonly gameId: string;
    readonly staffUserId: string;
  },
): Promise<MessagingOperationResult> {
  if (new URL(input.request.url).searchParams.size) {
    return response(400, "invalid_admin_message_request", "Messaging policy does not accept query parameters.");
  }
  if (input.request.method === "GET") {
    const result = await service.rpc<Record<string, unknown>>(
      "read_admin_message_policy_v1",
      { p_game_session_id: input.gameId, p_staff_user_id: input.staffUserId },
    );
    if (result.error) return rpcError(result.error);
    return { handled: true, status: 200, body: { data: { policy: normalizePolicy(result.data) } } };
  }
  if (input.request.method !== "POST") {
    return response(405, "method_not_allowed", "Use GET or POST for Messaging policy.");
  }
  const value = await input.request.clone().json().catch(() => null);
  if (!record(value) || Object.keys(value).some((key) => ![
    "playerThreadsEnabled", "defaultRetentionDays",
  ].includes(key))) {
    return response(400, "invalid_admin_message_request", "Provide a valid Messaging policy object.");
  }
  const days = Number(value.defaultRetentionDays);
  if (typeof value.playerThreadsEnabled !== "boolean" ||
      !Number.isSafeInteger(days) || days < 1 || days > 730) {
    return response(400, "invalid_admin_message_request", "Messaging policy values are invalid.");
  }
  const result = await service.rpc<Record<string, unknown>>(
    "set_admin_message_policy_v1",
    {
      p_game_session_id: input.gameId,
      p_staff_user_id: input.staffUserId,
      p_player_threads_enabled: value.playerThreadsEnabled,
      p_default_retention_days: days,
    },
  );
  if (result.error) return rpcError(result.error);
  return { handled: true, status: 200, body: { data: { policy: normalizePolicy(result.data) } } };
}

async function handleStrictModeration(
  service: AdminService,
  input: {
    readonly request: Request;
    readonly gameId: string;
    readonly staffUserId: string;
  },
  threadId: string,
  messageId: string | null,
  action: string,
): Promise<MessagingOperationResult> {
  const value = await input.request.clone().json().catch(() => null);
  if (!record(value) || Object.keys(value).some((key) => !["reason", "idempotencyKey"].includes(key))) {
    return response(400, "invalid_admin_message_request", "Provide a valid moderation JSON object.");
  }
  const reason = clean(value.reason);
  const bodyKey = clean(value.idempotencyKey);
  const headerKey = input.request.headers.get("x-idempotency-key")?.trim() ??
    input.request.headers.get("x-request-id")?.trim() ?? "";
  if (bodyKey && headerKey && bodyKey !== headerKey) {
    return response(400, "invalid_admin_message_request", "Header and body idempotency keys must match.");
  }
  const idempotencyKey = bodyKey || headerKey;
  const requiresReason = ["disable_thread", "close_thread", "hide_message"].includes(action);
  if (!THREAD.test(threadId) || (messageId !== null && !MESSAGE.test(messageId)) ||
      !KEY.test(idempotencyKey) || reason.length > 1000 || (requiresReason && !reason)) {
    return response(400, "invalid_admin_message_request", "Moderation fields are invalid.");
  }

  const result = await service.rpc<readonly ModerationRow[]>(
    "moderate_admin_message_atomic_v2",
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
  if (result.error) return rpcError(result.error);
  const row = result.data?.[0];
  if (!record(row)) return response(500, "admin_messaging_failed", "Messaging moderation returned invalid data.");
  const outcome = enumValue(row.moderation_outcome, ["applied", "replayed"]);
  const returnedAction = enumValue(row.moderation_action, [
    "disable_thread", "enable_thread", "close_thread", "hide_message", "unhide_message",
  ]);
  const returnedThread = identifier(row.thread_id, THREAD);
  const returnedMessage = row.message_id === null || row.message_id === undefined
    ? null
    : identifier(row.message_id, MESSAGE);
  if (returnedAction !== action || returnedThread !== threadId || returnedMessage !== messageId) {
    return response(500, "admin_messaging_failed", "Messaging moderation response did not match the command.");
  }
  return {
    handled: true,
    status: 200,
    body: {
      data: {
        outcome,
        actionId: identifier(row.action_id, ACTION),
        threadId: returnedThread,
        messageId: returnedMessage,
        action: returnedAction,
        threadStatus: clean(row.thread_status),
        messageHidden: row.message_hidden === true,
        committedAt: timestamp(row.created_at),
      },
    },
  };
}

function normalizePolicy(value: unknown) {
  if (!record(value) || value.attachmentsEnabled !== false) throw new Error("invalid policy");
  const days = Number(value.defaultRetentionDays);
  const max = Number(value.maxParticipants);
  if (!Number.isSafeInteger(days) || days < 1 || days > 730 ||
      !Number.isSafeInteger(max) || max < 2 || max > 20) throw new Error("invalid policy");
  return Object.freeze({
    playerThreadsEnabled: value.playerThreadsEnabled !== false,
    maxParticipants: max,
    defaultRetentionDays: days,
    attachmentsEnabled: false,
    updatedAt: value.updatedAt ? timestamp(value.updatedAt) : null,
  });
}

function rpcError(error: RpcError): MessagingOperationResult {
  const source = `${error.code ?? ""} ${error.message}`.toUpperCase();
  if (source.includes("IDEMPOTENCY_CONFLICT")) {
    return response(409, "admin_message_idempotency_conflict", "This idempotency key was used for a different Messaging command.");
  }
  if (source.includes("SCOPE_FORBIDDEN")) {
    return response(404, "game_not_found", "That game is not available to this administrator.");
  }
  if (source.includes("42P01") || source.includes("42883") || source.includes("DOES NOT EXIST")) {
    return response(503, "admin_messaging_schema_not_applied", "Messaging is unavailable in this runtime.", true);
  }
  return response(500, "admin_messaging_failed", "Administrator Messaging could not be completed.");
}
function response(status: number, code: string, message: string, retryable = false): MessagingOperationResult {
  return { handled: true, status, body: { code, message, retryable } };
}
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function identifier(value: unknown, pattern: RegExp): string {
  const result = clean(value).toLowerCase();
  if (!pattern.test(result)) throw new Error("invalid identifier");
  return result;
}
function enumValue<const T extends string>(value: unknown, values: readonly T[]): T {
  const result = clean(value) as T;
  if (!values.includes(result)) throw new Error("invalid enum");
  return result;
}
function timestamp(value: unknown): string {
  const result = clean(value);
  const parsed = Date.parse(result);
  if (!Number.isFinite(parsed)) throw new Error("invalid timestamp");
  return new Date(parsed).toISOString();
}
