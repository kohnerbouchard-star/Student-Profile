import type { EdgeSupabaseClient } from "../../../src/platform/supabase/edgeStaffSession.ts";
import { enforceStaffRateLimit } from "../../../src/security/playerRateLimitService.ts";

interface RpcError {
  readonly code?: string;
  readonly message: string;
}
interface RpcResponse<T> {
  readonly data: T | null;
  readonly error: RpcError | null;
}
interface AdminService extends EdgeSupabaseClient {
  rpc<T>(name: string, args: unknown): PromiseLike<RpcResponse<T>>;
}

export interface ProgressionOperationResult {
  readonly handled: boolean;
  readonly status?: number;
  readonly body?: unknown;
}

const PLAYER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REPUTATION_TYPES = new Set(["country", "career", "story", "relationship"]);

export async function handleProgressionOperation(
  service: AdminService,
  input: {
    readonly request: Request;
    readonly gameId: string;
    readonly staffUserId: string;
    readonly suffix: string;
  },
): Promise<ProgressionOperationResult> {
  if (input.suffix === "/progression") {
    if (input.request.method !== "GET") return methodNotAllowed("Use GET to review Progression.");
    const limited = await rateLimit(service, input, "staff.progression.read", "read");
    return limited ?? await readPlayers(service, input);
  }
  const correction = input.suffix.match(
    /^\/progression\/players\/([A-Za-z0-9][A-Za-z0-9._:-]{0,159})\/corrections$/,
  );
  if (correction) {
    if (input.request.method !== "POST") return methodNotAllowed("Use POST to correct Progression.");
    const limited = await rateLimit(service, input, "staff.progression.correct", "sensitive");
    return limited ?? await correct(service, input, correction[1]);
  }
  return input.suffix.startsWith("/progression")
    ? invalid("Progression route is malformed.")
    : { handled: false };
}

async function rateLimit(
  service: AdminService,
  input: Parameters<typeof handleProgressionOperation>[1],
  action: string,
  profile: "read" | "sensitive",
): Promise<ProgressionOperationResult | null> {
  try {
    const decision = await enforceStaffRateLimit({
      action,
      profile,
      request: input.request,
      staffUuid: input.staffUserId,
      gameUuid: input.gameId,
    }, service);
    if (decision.allowed) return null;
    return {
      handled: true,
      status: 429,
      body: {
        code: "rate_limit_exceeded",
        message: "Too many Progression requests. Try again after the retry window.",
        retryable: true,
        retryAfterSeconds: decision.retryAfterSeconds,
      },
    };
  } catch {
    return {
      handled: true,
      status: 503,
      body: {
        code: "rate_limit_service_unavailable",
        message: "Progression rate limiting is temporarily unavailable.",
        retryable: true,
      },
    };
  }
}

async function readPlayers(
  service: AdminService,
  input: Parameters<typeof handleProgressionOperation>[1],
): Promise<ProgressionOperationResult> {
  try {
    const url = new URL(input.request.url);
    for (const key of url.searchParams.keys()) {
      if (!['limit', 'offset'].includes(key) || url.searchParams.getAll(key).length !== 1) {
        return invalid(`Unsupported or repeated query parameter: ${key}.`);
      }
    }
    const limit = boundedInteger(url.searchParams.get("limit"), 50, 1, 100);
    const offset = boundedInteger(url.searchParams.get("offset"), 0, 0, 10000);
    if (limit === null || offset === null) return invalid("Progression pagination is invalid.");
    const response = await service.rpc<Record<string, unknown>>(
      "read_admin_progression_players_v1",
      {
        p_game_session_id: input.gameId,
        p_staff_user_id: input.staffUserId,
        p_limit: limit,
        p_offset: offset,
      },
    );
    if (response.error) return rpcError(response.error);
    if (!isRecord(response.data) || !Array.isArray(response.data.players)) return failed();
    return {
      handled: true,
      status: 200,
      body: { data: response.data },
    };
  } catch {
    return failed();
  }
}

async function correct(
  service: AdminService,
  input: Parameters<typeof handleProgressionOperation>[1],
  playerId: string,
): Promise<ProgressionOperationResult> {
  try {
    if (!PLAYER_ID_PATTERN.test(playerId) || new URL(input.request.url).searchParams.size) {
      return invalid("Progression correction target is invalid.");
    }
    const value = await input.request.clone().json().catch(() => null);
    if (!isRecord(value)) return invalid("Provide a valid correction JSON object.");
    const allowed = new Set([
      "correctionType",
      "amount",
      "reputationType",
      "reputationScope",
      "reason",
      "idempotencyKey",
    ]);
    if (Object.keys(value).some((key) => !allowed.has(key))) {
      return invalid("Progression correction contains unsupported fields.");
    }
    const correctionType = text(value.correctionType).toLowerCase();
    const amount = Number(value.amount);
    const reputationType = optionalText(value.reputationType).toLowerCase();
    const reputationScope = optionalText(value.reputationScope);
    const reason = text(value.reason);
    const bodyKey = text(value.idempotencyKey);
    const headerKey = input.request.headers.get("x-idempotency-key")?.trim() ??
      input.request.headers.get("x-request-id")?.trim() ?? "";
    if (bodyKey && headerKey && bodyKey !== headerKey) {
      return invalid("Header and body idempotency keys must match.");
    }
    const idempotencyKey = bodyKey || headerKey;
    const isExperience = correctionType === "experience";
    const isReputation = correctionType === "reputation";
    if (
      (!isExperience && !isReputation) || !Number.isSafeInteger(amount) || amount === 0 ||
      amount < -5000 || amount > 5000 || reason.length < 3 || reason.length > 1000 ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(reason) ||
      !IDEMPOTENCY_PATTERN.test(idempotencyKey) ||
      (isExperience && (reputationType || reputationScope)) ||
      (isReputation && (!REPUTATION_TYPES.has(reputationType) || !PLAYER_ID_PATTERN.test(reputationScope)))
    ) return invalid("Progression correction is invalid.");

    const response = await service.rpc<readonly Record<string, unknown>[]>(
      "apply_admin_progression_correction_atomic_v1",
      {
        p_game_session_id: input.gameId,
        p_staff_user_id: input.staffUserId,
        p_player_identifier: playerId,
        p_correction_type: correctionType,
        p_amount: amount,
        p_reputation_type: reputationType || null,
        p_reputation_scope: reputationScope || null,
        p_reason: reason,
        p_idempotency_key: idempotencyKey,
      },
    );
    if (response.error) return rpcError(response.error);
    const row = response.data?.[0];
    if (!isRecord(row)) return failed();
    const outcome = text(row.correction_outcome);
    const correctionId = text(row.correction_id);
    const returnedPlayerId = text(row.player_id);
    const beforeValue = integer(row.before_value);
    const afterValue = integer(row.after_value);
    const createdAt = timestamp(row.created_at);
    if (
      !["applied", "replayed"].includes(outcome) ||
      !/^pcr_[0-9a-f]{32}$/.test(correctionId) ||
      returnedPlayerId !== playerId ||
      beforeValue === null || afterValue === null || !createdAt
    ) return failed();
    return {
      handled: true,
      status: 200,
      body: {
        data: {
          outcome,
          correction: {
            id: correctionId,
            playerId,
            correctionType,
            amount,
            beforeValue,
            afterValue,
            createdAt,
          },
        },
      },
    };
  } catch {
    return failed();
  }
}

function rpcError(error: RpcError): ProgressionOperationResult {
  const upper = error.message.toUpperCase();
  const lower = error.message.toLowerCase();
  if (lower.includes("does not exist") || lower.includes("schema cache")) {
    return errorResult(503, "progression_schema_not_applied", "Progression is unavailable in this runtime.", true);
  }
  if (upper.includes("PROGRESSION_ADMIN_SCOPE_FORBIDDEN") || upper.includes("PROGRESSION_PLAYER_NOT_FOUND")) {
    return errorResult(404, "progression_not_found", "Progression record was not found.");
  }
  if (upper.includes("PROGRESSION_IDEMPOTENCY_CONFLICT")) {
    return errorResult(409, "progression_idempotency_conflict", "This idempotency key was used for another correction.");
  }
  if (upper.includes("PROGRESSION_") && upper.includes("INVALID")) return invalid("Progression request is invalid.");
  return failed();
}

function methodNotAllowed(message: string): ProgressionOperationResult {
  return errorResult(405, "method_not_allowed", message);
}
function invalid(message: string): ProgressionOperationResult {
  return errorResult(400, "invalid_progression_request", message);
}
function failed(): ProgressionOperationResult {
  return errorResult(500, "progression_failed", "Progression operation could not be completed.");
}
function errorResult(status: number, code: string, message: string, retryable = false): ProgressionOperationResult {
  return { handled: true, status, body: { code, message, retryable } };
}
function boundedInteger(value: string | null, fallback: number, min: number, max: number): number | null {
  if (value === null || value === "") return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function optionalText(value: unknown): string {
  return value === null || value === undefined ? "" : text(value);
}
function integer(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
function timestamp(value: unknown): string {
  const parsed = text(value);
  return parsed && Number.isFinite(Date.parse(parsed)) ? parsed : "";
}
