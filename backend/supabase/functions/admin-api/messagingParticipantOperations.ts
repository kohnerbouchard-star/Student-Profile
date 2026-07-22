import type { MessagingOperationResult } from "./messagingOperationsCore.ts";

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
interface ParticipantRow {
  readonly participant_outcome?: unknown;
  readonly action_id?: unknown;
  readonly thread_id?: unknown;
  readonly participant_reference?: unknown;
  readonly participant_action?: unknown;
  readonly participant_count?: unknown;
  readonly created_at?: unknown;
}

const THREAD = /^thr_[0-9a-f]{32}$/;
const ACTION = /^mda_[0-9a-f]{32}$/;
const PLAYER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

type ParticipantAction = "add_participant" | "remove_participant";

export async function handleMessagingParticipantOperation(
  service: AdminService,
  input: {
    readonly request: Request;
    readonly gameId: string;
    readonly staffUserId: string;
    readonly suffix: string;
  },
): Promise<MessagingOperationResult | null> {
  const match = input.suffix.match(
    /^\/messages\/threads\/(thr_[0-9a-f]{32})\/participants\/(add|remove)$/,
  );
  if (!match) return null;
  if (input.request.method !== "POST") {
    return response(405, "method_not_allowed", "Use POST to change Messaging participants.");
  }
  if (new URL(input.request.url).searchParams.size) {
    return response(400, "invalid_admin_message_request", "Participant commands do not accept query parameters.");
  }

  const value = await input.request.clone().json().catch(() => null);
  if (!record(value) || Object.keys(value).some((key) =>
    !["playerId", "reason", "idempotencyKey"].includes(key)
  )) {
    return response(400, "invalid_admin_message_request", "Provide a valid participant command object.");
  }

  const threadId = match[1];
  const action: ParticipantAction = match[2] === "add"
    ? "add_participant"
    : "remove_participant";
  const playerId = clean(value.playerId);
  const reason = clean(value.reason);
  const bodyKey = clean(value.idempotencyKey);
  const headerKey = input.request.headers.get("x-idempotency-key")?.trim() ??
    input.request.headers.get("x-request-id")?.trim() ?? "";
  if (bodyKey && headerKey && bodyKey !== headerKey) {
    return response(400, "invalid_admin_message_request", "Header and body idempotency keys must match.");
  }
  const idempotencyKey = bodyKey || headerKey;
  if (
    !THREAD.test(threadId) ||
    !PLAYER.test(playerId) ||
    UUID.test(playerId) ||
    !KEY.test(idempotencyKey) ||
    reason.length > 1000 ||
    unsafe(reason) ||
    (action === "remove_participant" && !reason)
  ) {
    return response(400, "invalid_admin_message_request", "Participant command fields are invalid.");
  }

  const result = await service.rpc<readonly ParticipantRow[]>(
    "change_admin_message_participant_atomic_v1",
    {
      p_game_session_id: input.gameId,
      p_staff_user_id: input.staffUserId,
      p_thread_public_id: threadId,
      p_participant_reference: playerId,
      p_action: action,
      p_reason: reason || null,
      p_idempotency_key: idempotencyKey,
    },
  );
  if (result.error) return rpcError(result.error);
  const row = result.data?.[0];
  if (!record(row)) {
    return response(500, "admin_messaging_failed", "Participant command returned invalid data.");
  }

  const outcome = enumValue(row.participant_outcome, ["applied", "replayed"]);
  const returnedAction = enumValue(row.participant_action, [
    "add_participant",
    "remove_participant",
  ]);
  const returnedThread = identifier(row.thread_id, THREAD);
  const returnedPlayer = identifier(row.participant_reference, PLAYER);
  const count = integer(row.participant_count, 0, 500);
  if (
    returnedAction !== action ||
    returnedThread !== threadId ||
    returnedPlayer !== playerId ||
    UUID.test(returnedPlayer)
  ) {
    return response(500, "admin_messaging_failed", "Participant command response did not match the request.");
  }

  return {
    handled: true,
    status: 200,
    body: {
      data: {
        outcome,
        actionId: identifier(row.action_id, ACTION),
        threadId: returnedThread,
        playerId: returnedPlayer,
        action: returnedAction,
        participantCount: count,
        committedAt: timestamp(row.created_at),
      },
    },
  };
}

function rpcError(error: RpcError): MessagingOperationResult {
  const source = `${error.code ?? ""} ${error.message}`.toUpperCase();
  if (source.includes("IDEMPOTENCY_CONFLICT")) {
    return response(409, "admin_message_idempotency_conflict", "This idempotency key was used for a different Messaging command.");
  }
  if (source.includes("LAST_PARTICIPANT")) {
    return response(409, "admin_message_last_participant", "A Messaging thread must retain at least one participant.");
  }
  if (source.includes("PARTICIPANT_LIMIT")) {
    return response(409, "admin_message_participant_limit", "The Messaging participant limit has been reached.");
  }
  if (source.includes("PARTICIPANT_NOT_FOUND")) {
    return response(404, "admin_message_participant_not_found", "That participant is not available for this thread.");
  }
  if (source.includes("THREAD_LOCKED") || source.includes("RETENTION_EXPIRED")) {
    return response(409, "admin_message_thread_locked", "That Messaging thread no longer accepts participant changes.");
  }
  if (source.includes("THREAD_NOT_FOUND")) {
    return response(404, "admin_message_thread_not_found", "That Messaging thread was not found.");
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
function unsafe(value: string): boolean {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value) ||
    /(?:^|[\s"'(<])(?:javascript|vbscript|data|file):/i.test(value);
}
function identifier(value: unknown, pattern: RegExp): string {
  const result = clean(value);
  if (!pattern.test(result)) throw new Error("invalid identifier");
  return result;
}
function enumValue<const T extends string>(value: unknown, values: readonly T[]): T {
  const result = clean(value) as T;
  if (!values.includes(result)) throw new Error("invalid enum");
  return result;
}
function integer(value: unknown, minimum: number, maximum: number): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw new Error("invalid integer");
  }
  return result;
}
function timestamp(value: unknown): string {
  const result = clean(value);
  const parsed = Date.parse(result);
  if (!Number.isFinite(parsed)) throw new Error("invalid timestamp");
  return new Date(parsed).toISOString();
}
