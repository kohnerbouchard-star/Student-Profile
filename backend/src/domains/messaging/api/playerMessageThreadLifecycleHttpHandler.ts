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
import type { PlayerMessageThreadLifecycleRoute } from "./playerMessageThreadLifecycleRoutePaths.ts";

interface RpcError {
  readonly code?: string;
  readonly message: string;
}
interface CreateRow {
  readonly create_outcome?: unknown;
  readonly thread_id?: unknown;
  readonly message_id?: unknown;
  readonly thread_title?: unknown;
  readonly recipient_reference?: unknown;
  readonly created_at?: unknown;
}

export interface PlayerMessageThreadLifecycleDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: typeof readSupabaseEnv;
  readonly hashSessionToken?: (token: string) => Promise<string>;
  readonly resolvePlayerSession?: (
    client: EdgeSupabaseClient,
    tokenHash: string,
  ) => ReturnType<typeof resolveActivePlayerSession>;
  readonly now?: () => Date;
}

export async function handlePlayerMessageThreadLifecycleRequest(
  request: Request,
  route: PlayerMessageThreadLifecycleRoute,
  dependencies: PlayerMessageThreadLifecycleDependencies,
): Promise<Response> {
  if (route.kind === "malformed") return invalid("Player thread route is malformed.");
  if (route.kind === "policy" && request.method !== "GET") {
    return methodError("Use GET to read Messaging policy.");
  }
  if (route.kind === "createThread" && request.method !== "POST") {
    return methodError("Use POST to create a Player thread.");
  }
  if (request.headers.has("x-stock-market-runner-secret")) {
    return invalid("Messaging requests must not send a runner secret.");
  }
  if (new URL(request.url).searchParams.size) {
    return invalid("Messaging policy and thread creation do not accept query parameters.");
  }

  try {
    const envResult = (dependencies.readSupabaseEnv ?? readSupabaseEnv)();
    if (!envResult.ok) {
      return responseError(500, "missing_edge_runtime_config", "Classroom API runtime configuration is incomplete.");
    }
    const client = dependencies.createServiceClient(envResult.value);
    const now = dependencies.now?.() ?? new Date();
    const scope = await resolvePlayerRequestScope(request, {
      hashSessionToken: dependencies.hashSessionToken ?? sha256Hex,
      resolvePlayerSession: (tokenHash) =>
        (dependencies.resolvePlayerSession ?? resolveActivePlayerSession)(client, tokenHash),
      now: () => now,
    });

    if (route.kind === "policy") {
      const result = await client.rpc<Record<string, unknown>>(
        "read_player_message_policy_v1",
        { p_game_session_id: scope.gameId, p_player_id: scope.playerUuid },
      );
      if (result.error) return mapRpcError(result.error);
      const policy = normalizePolicy(result.data);
      return privateResponse(200, { ok: true, data: { policy } });
    }

    const parsed = await parseCreateCommand(request);
    if (!parsed.ok) return parsed.response;
    const result = await client.rpc<readonly CreateRow[]>(
      "create_player_message_thread_atomic_v1",
      {
        p_game_session_id: scope.gameId,
        p_player_id: scope.playerUuid,
        p_recipient_player_identifier: parsed.command.recipientPlayerId,
        p_title: parsed.command.title,
        p_initial_body: parsed.command.body,
        p_idempotency_key: parsed.command.idempotencyKey,
      },
    );
    if (result.error) return mapRpcError(result.error);
    const value = normalizeCreateRow(result.data?.[0]);
    return privateResponse(value.outcome === "applied" ? 201 : 200, {
      ok: true,
      data: value,
    });
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    return responseError(500, "player_messaging_failed", "Player Messaging request failed.");
  }
}

async function parseCreateCommand(request: Request): Promise<
  | { readonly ok: true; readonly command: Readonly<Record<"recipientPlayerId" | "title" | "body" | "idempotencyKey", string>> }
  | { readonly ok: false; readonly response: Response }
> {
  const value = await request.clone().json().catch(() => null);
  if (!isRecord(value) || Object.keys(value).some((key) => ![
    "recipientPlayerId", "title", "body", "idempotencyKey",
  ].includes(key))) {
    return { ok: false, response: invalid("Provide a valid Player-thread JSON object.") };
  }
  const recipientPlayerId = clean(value.recipientPlayerId);
  const title = clean(value.title);
  const body = clean(value.body);
  const bodyKey = clean(value.idempotencyKey);
  const headerKey = request.headers.get("x-idempotency-key")?.trim() ??
    request.headers.get("x-request-id")?.trim() ?? "";
  if (bodyKey && headerKey && bodyKey !== headerKey) {
    return { ok: false, response: invalid("Request and header idempotency keys must match.") };
  }
  const idempotencyKey = bodyKey || headerKey;
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(recipientPlayerId) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recipientPlayerId) ||
    !safeText(title, 160, 1) ||
    !safeMessage(body) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(idempotencyKey)
  ) {
    return { ok: false, response: invalid("Player-thread fields are invalid.") };
  }
  return { ok: true, command: Object.freeze({ recipientPlayerId, title, body, idempotencyKey }) };
}

function normalizePolicy(value: unknown) {
  if (!isRecord(value)) throw new Error("invalid policy");
  if (value.attachmentsEnabled !== false) throw new Error("attachments must remain disabled");
  const maxParticipants = integer(value.maxParticipants, 2, 20);
  const defaultRetentionDays = integer(value.defaultRetentionDays, 1, 730);
  return Object.freeze({
    playerThreadsEnabled: value.playerThreadsEnabled !== false,
    maxParticipants,
    defaultRetentionDays,
    attachmentsEnabled: false,
  });
}

function normalizeCreateRow(value: unknown) {
  if (!isRecord(value)) throw new Error("invalid create response");
  const outcome = enumText(value.create_outcome, ["applied", "replayed"]);
  return Object.freeze({
    outcome,
    threadId: publicId(value.thread_id, /^thr_[0-9a-f]{32}$/),
    messageId: publicId(value.message_id, /^msg_[0-9a-f]{32}$/),
    title: requiredText(value.thread_title, 160),
    recipientPlayerId: requiredText(value.recipient_reference, 160),
    createdAt: timestamp(value.created_at),
  });
}

function mapRpcError(error: RpcError): Response {
  const source = `${error.code ?? ""} ${error.message}`.toUpperCase();
  if (source.includes("THREADS_DISABLED")) {
    return responseError(423, "player_message_threads_disabled", "Player-created threads are disabled for this game.");
  }
  if (source.includes("RECIPIENT_NOT_FOUND") || source.includes("SCOPE_FORBIDDEN")) {
    return responseError(404, "player_message_recipient_not_found", "The recipient is not available in this game.");
  }
  if (source.includes("IDEMPOTENCY_CONFLICT")) {
    return responseError(409, "player_message_idempotency_conflict", "This idempotency key was used for another thread command.");
  }
  if (source.includes("GAME_NOT_ACTIVE")) {
    return responseError(409, "game_not_active", "Threads cannot be created while the game is not active.");
  }
  if (source.includes("42P01") || source.includes("42883") || source.includes("DOES NOT EXIST")) {
    return responseError(503, "player_messaging_schema_not_applied", "Messaging is unavailable in this runtime.", true);
  }
  if (source.includes("_INVALID")) return invalid("Player-thread request is invalid.");
  return responseError(500, "player_messaging_failed", "Player Messaging request failed.");
}

function privateResponse<T>(status: number, body: T): Response {
  const response = jsonResponse(status, body);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("pragma", "no-cache");
  response.headers.set("vary", "authorization, x-player-session-token");
  return response;
}
function invalid(message: string): Response {
  return responseError(400, "invalid_player_message_request", message);
}
function methodError(message: string): Response {
  return responseError(405, "method_not_allowed", message);
}
function responseError(status: number, code: string, message: string, retryable = false): Response {
  return jsonError(status, { code, message, retryable });
}
function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function safeText(value: string, maximum: number, minimum = 0): boolean {
  return value.length >= minimum && value.length <= maximum &&
    !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value) &&
    !/(?:^|[\s\"'(<])(?:javascript|vbscript|data|file):/i.test(value);
}
function safeMessage(value: string): boolean {
  return safeText(value, 1000, 1) && value.split(/\r?\n/).length <= 50 &&
    (value.match(/https?:\/\/[^\s<>{}\[\]\"']+/gi)?.length ?? 0) <= 10;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function integer(value: unknown, minimum: number, maximum: number): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) throw new Error("invalid integer");
  return result;
}
function requiredText(value: unknown, maximum: number): string {
  const result = clean(value);
  if (!safeText(result, maximum, 1)) throw new Error("invalid text");
  return result;
}
function enumText<const T extends string>(value: unknown, allowed: readonly T[]): T {
  const result = requiredText(value, 64) as T;
  if (!allowed.includes(result)) throw new Error("invalid enum");
  return result;
}
function publicId(value: unknown, pattern: RegExp): string {
  const result = requiredText(value, 64);
  if (!pattern.test(result)) throw new Error("invalid public id");
  return result;
}
function timestamp(value: unknown): string {
  const result = requiredText(value, 64);
  const parsed = Date.parse(result);
  if (!Number.isFinite(parsed)) throw new Error("invalid timestamp");
  return new Date(parsed).toISOString();
}
