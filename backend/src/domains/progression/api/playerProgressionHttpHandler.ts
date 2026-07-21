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
import {
  PROGRESSION_COMMAND_ID_PATTERN,
  PROGRESSION_IDEMPOTENCY_PATTERN,
  PROGRESSION_REWARD_ID_PATTERN,
  PROGRESSION_SKILL_ID_PATTERN,
  ProgressionError,
  type PlayerProgressionRoute,
} from "../contracts/progressionContracts.ts";

interface ProgressionRpcRow {
  readonly unlock_outcome?: unknown;
  readonly claim_outcome?: unknown;
  readonly command_id?: unknown;
  readonly unlock_id?: unknown;
  readonly skill_id?: unknown;
  readonly reward_id?: unknown;
  readonly reward_kind?: unknown;
  readonly amount?: unknown;
  readonly remaining_skill_points?: unknown;
  readonly unlocked_at?: unknown;
  readonly claimed_at?: unknown;
}

export interface PlayerProgressionHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly hashSessionToken?: (token: string) => Promise<string>;
  readonly resolvePlayerSession?: (
    client: EdgeSupabaseClient,
    tokenHash: string,
  ) => ReturnType<typeof resolveActivePlayerSession>;
  readonly now?: () => Date;
}

export async function handlePlayerProgressionRequest(
  request: Request,
  route: PlayerProgressionRoute,
  dependencies: PlayerProgressionHttpHandlerDependencies,
): Promise<Response> {
  if (route.kind === "malformed") {
    return errorResponse(new ProgressionError(
      "invalid_player_progression_request",
      "Progression path is malformed.",
      400,
    ));
  }
  const expectedMethod = route.kind === "read" ? "GET" : "POST";
  if (request.method !== expectedMethod) {
    return jsonError(405, {
      code: "method_not_allowed",
      message: route.kind === "read"
        ? "Use GET to read progression."
        : "Use POST for progression commands.",
      retryable: false,
    });
  }

  try {
    validateRequestShape(request);
    const envResult = (dependencies.readEnvironment ?? readSupabaseEnv)();
    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
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

    if (route.kind === "read") {
      const response = await client.rpc<unknown>("read_player_progression_v1", {
        p_game_session_id: scope.gameId,
        p_player_id: scope.playerUuid,
      });
      if (response.error) throw mapRpcError(response.error.message);
      if (!isRecord(response.data)) throw failed();
      return privateResponse(200, {
        ok: true,
        generatedAt: now.toISOString(),
        progression: response.data,
      });
    }

    const idempotencyKey = await readIdempotencyKey(request);
    const rpc = route.kind === "unlock"
      ? await client.rpc<readonly ProgressionRpcRow[]>(
        "unlock_player_progression_skill_atomic_v1",
        {
          p_game_session_id: scope.gameId,
          p_player_id: scope.playerUuid,
          p_public_skill_id: route.skillId,
          p_idempotency_key: idempotencyKey,
        },
      )
      : await client.rpc<readonly ProgressionRpcRow[]>(
        "claim_player_progression_reward_atomic_v1",
        {
          p_game_session_id: scope.gameId,
          p_player_id: scope.playerUuid,
          p_public_reward_id: route.rewardId,
          p_idempotency_key: idempotencyKey,
        },
      );
    if (rpc.error) throw mapRpcError(rpc.error.message);
    const result = normalizeCommand(route, rpc.data?.[0]);
    return privateResponse(200, {
      ok: true,
      generatedAt: now.toISOString(),
      ...result,
    });
  } catch (error) {
    if (error instanceof EdgeActivationError || error instanceof ProgressionError) {
      return errorResponse(error);
    }
    return errorResponse(failed());
  }
}

function validateRequestShape(request: Request): void {
  if (new URL(request.url).searchParams.size) {
    throw new ProgressionError(
      "invalid_player_progression_request",
      "Progression routes do not accept query parameters.",
      400,
    );
  }
  for (const headerName of [
    "x-econovaria-game-id",
    "x-econovaria-game-session-id",
  ]) {
    if (request.headers.has(headerName)) {
      throw new ProgressionError(
        "invalid_player_progression_request",
        "Progression game scope derives only from the authenticated Player session.",
        400,
      );
    }
  }
}

async function readIdempotencyKey(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new ProgressionError(
      "invalid_player_progression_request",
      "Progression commands require JSON.",
      400,
    );
  }
  const value = await request.clone().json().catch(() => null);
  if (!isRecord(value) || Object.keys(value).some((key) => key !== "idempotencyKey")) {
    throw new ProgressionError(
      "invalid_player_progression_request",
      "Only idempotencyKey is accepted.",
      400,
    );
  }
  const bodyKey = typeof value.idempotencyKey === "string"
    ? value.idempotencyKey.trim()
    : "";
  const headerKey = request.headers.get("x-idempotency-key")?.trim() ??
    request.headers.get("x-request-id")?.trim() ?? "";
  if (bodyKey && headerKey && bodyKey !== headerKey) {
    throw new ProgressionError(
      "invalid_player_progression_request",
      "Header and body idempotency keys must match.",
      400,
    );
  }
  const key = bodyKey || headerKey;
  if (!PROGRESSION_IDEMPOTENCY_PATTERN.test(key)) {
    throw new ProgressionError(
      "invalid_player_progression_request",
      "A safe idempotency key is required.",
      400,
    );
  }
  return key;
}

function normalizeCommand(
  route: Exclude<PlayerProgressionRoute, { readonly kind: "read" | "malformed" }>,
  row: ProgressionRpcRow | undefined,
): Record<string, unknown> {
  if (!row) throw failed();
  const outcome = text(route.kind === "unlock" ? row.unlock_outcome : row.claim_outcome);
  const commandId = text(row.command_id);
  if (!['applied', 'replayed'].includes(outcome) || !PROGRESSION_COMMAND_ID_PATTERN.test(commandId)) {
    throw failed();
  }
  if (route.kind === "unlock") {
    const skillId = text(row.skill_id);
    const unlockId = text(row.unlock_id);
    const remainingSkillPoints = integer(row.remaining_skill_points);
    if (
      skillId !== route.skillId || !PROGRESSION_SKILL_ID_PATTERN.test(skillId) ||
      !/^pun_[0-9a-f]{32}$/.test(unlockId) ||
      remainingSkillPoints < 0 || remainingSkillPoints > 200
    ) throw failed();
    return {
      outcome,
      commandId,
      unlock: {
        id: unlockId,
        skillId,
        remainingSkillPoints,
        unlockedAt: timestamp(row.unlocked_at),
      },
    };
  }
  const rewardId = text(row.reward_id);
  const rewardKind = text(row.reward_kind);
  const amount = integer(row.amount);
  if (
    rewardId !== route.rewardId || !PROGRESSION_REWARD_ID_PATTERN.test(rewardId) ||
    !["skill_points", "reputation", "badge"].includes(rewardKind) ||
    amount < 0 || amount > 20
  ) throw failed();
  return {
    outcome,
    commandId,
    claim: {
      rewardId,
      rewardKind,
      amount,
      claimedAt: timestamp(row.claimed_at),
    },
  };
}

function mapRpcError(message: string): ProgressionError {
  const upper = message.toUpperCase();
  const lower = message.toLowerCase();
  if (lower.includes("does not exist") || lower.includes("schema cache")) {
    return new ProgressionError(
      "progression_schema_not_applied",
      "Progression is unavailable in this runtime.",
      503,
      true,
    );
  }
  const mappings: readonly [string, number, string, string][] = [
    ["PROGRESSION_PLAYER_NOT_FOUND", 404, "progression_not_found", "Progression was not found."],
    ["PROGRESSION_SKILL_NOT_FOUND", 404, "progression_skill_not_found", "Progression skill was not found."],
    ["PROGRESSION_REWARD_NOT_FOUND", 404, "progression_reward_not_found", "Progression reward was not found."],
    ["PROGRESSION_SKILL_ALREADY_UNLOCKED", 409, "progression_skill_already_unlocked", "Progression skill is already unlocked."],
    ["PROGRESSION_REWARD_ALREADY_CLAIMED", 409, "progression_reward_already_claimed", "Progression reward is already claimed."],
    ["PROGRESSION_SKILL_LEVEL_REQUIRED", 409, "progression_level_required", "A higher level is required."],
    ["PROGRESSION_SKILL_PREREQUISITE_REQUIRED", 409, "progression_prerequisite_required", "A prerequisite skill is required."],
    ["PROGRESSION_SKILL_POINTS_INSUFFICIENT", 409, "progression_skill_points_insufficient", "Not enough skill points are available."],
    ["PROGRESSION_IDEMPOTENCY_CONFLICT", 409, "progression_idempotency_conflict", "This idempotency key was used for another command."],
  ];
  for (const [token, status, code, safeMessage] of mappings) {
    if (upper.includes(token)) return new ProgressionError(code, safeMessage, status);
  }
  if (upper.includes("PROGRESSION_") && upper.includes("INVALID")) {
    return new ProgressionError(
      "invalid_player_progression_request",
      "Progression request is invalid.",
      400,
    );
  }
  return failed();
}

function failed(): ProgressionError {
  return new ProgressionError(
    "player_progression_failed",
    "Progression request could not be completed.",
    500,
  );
}

function errorResponse(error: EdgeActivationError | ProgressionError): Response {
  return jsonError(error.status, {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
  });
}

function privateResponse(status: number, body: unknown): Response {
  const response = jsonResponse(status, body);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("vary", "authorization, x-player-session-token");
  return response;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function integer(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) ? parsed : -1;
}
function timestamp(value: unknown): string {
  const parsed = text(value);
  if (!parsed || !Number.isFinite(Date.parse(parsed))) throw failed();
  return parsed;
}
