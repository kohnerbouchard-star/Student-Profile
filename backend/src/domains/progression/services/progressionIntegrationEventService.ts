import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import {
  PROGRESSION_EVENT_ID_PATTERN,
  PROGRESSION_EVENT_SOURCE_DOMAIN,
  PROGRESSION_EVENT_TYPES,
  PROGRESSION_IDEMPOTENCY_PATTERN,
  PROGRESSION_SOURCE_DOMAINS,
  PROGRESSION_SOURCE_PUBLIC_ID_PATTERN,
  PROGRESSION_UUID_PATTERN,
  ProgressionError,
  type ProgressionEventResultV1,
  type TrustedProgressionEventV1,
} from "../contracts/progressionContracts.ts";

const MAX_EVENT_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

interface ProgressionEventRpcRow {
  readonly event_outcome?: unknown;
  readonly event_id?: unknown;
  readonly experience_awarded?: unknown;
  readonly resulting_experience?: unknown;
  readonly resulting_level?: unknown;
  readonly achievements_completed?: unknown;
}

export interface ProgressionEventValidationOptions {
  readonly now?: Date;
}

export async function recordTrustedProgressionEventV1(
  client: EdgeSupabaseClient,
  event: TrustedProgressionEventV1,
  options: ProgressionEventValidationOptions = {},
): Promise<ProgressionEventResultV1> {
  validateEvent(event, options.now ?? new Date());
  const response = await client.rpc<readonly ProgressionEventRpcRow[]>(
    "record_progression_integration_event_v1",
    {
      p_game_session_id: event.gameId,
      p_player_id: event.playerUuid,
      p_source_domain: event.sourceDomain,
      p_event_type: event.eventType,
      p_source_public_id: event.sourcePublicId,
      p_idempotency_key: event.idempotencyKey,
      p_occurred_at: event.occurredAt,
    },
  );
  if (response.error) throw mapRpcError(response.error.message);
  const row = response.data?.[0];
  if (!row) throw failed();
  const outcome = text(row.event_outcome);
  const eventId = text(row.event_id);
  const experienceAwarded = integer(row.experience_awarded);
  const resultingExperience = integer(row.resulting_experience);
  const resultingLevel = integer(row.resulting_level);
  const achievementsCompleted = integer(row.achievements_completed);
  if (
    !["applied", "capped", "replayed"].includes(outcome) ||
    !PROGRESSION_EVENT_ID_PATTERN.test(eventId) ||
    experienceAwarded < 0 || experienceAwarded > 5000 ||
    resultingExperience < 0 || resultingExperience > 1_000_000_000 ||
    resultingLevel < 1 || resultingLevel > 20 ||
    achievementsCompleted < 0 || achievementsCompleted > 100
  ) throw failed();
  return {
    outcome: outcome as ProgressionEventResultV1["outcome"],
    eventId,
    experienceAwarded,
    resultingExperience,
    resultingLevel,
    achievementsCompleted,
  };
}

function validateEvent(event: TrustedProgressionEventV1, now: Date): void {
  const occurredAt = Date.parse(event.occurredAt);
  const nowMs = now.getTime();
  if (
    !PROGRESSION_UUID_PATTERN.test(event.gameId) ||
    !PROGRESSION_UUID_PATTERN.test(event.playerUuid) ||
    !PROGRESSION_SOURCE_DOMAINS.includes(event.sourceDomain) ||
    !PROGRESSION_EVENT_TYPES.includes(event.eventType) ||
    PROGRESSION_EVENT_SOURCE_DOMAIN[event.eventType] !== event.sourceDomain ||
    !PROGRESSION_SOURCE_PUBLIC_ID_PATTERN.test(event.sourcePublicId) ||
    !PROGRESSION_IDEMPOTENCY_PATTERN.test(event.idempotencyKey) ||
    !Number.isFinite(occurredAt) ||
    !Number.isFinite(nowMs) ||
    occurredAt < nowMs - MAX_EVENT_AGE_MS ||
    occurredAt > nowMs + FUTURE_TOLERANCE_MS
  ) {
    throw new ProgressionError(
      "progression_event_invalid",
      "Progression event contract is invalid.",
      400,
    );
  }
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
  const mappings: readonly [string, string, string, number, boolean][] = [
    ["PROGRESSION_IDEMPOTENCY_CONFLICT", "progression_idempotency_conflict", "This idempotency key was used for another Progression event.", 409, false],
    ["PROGRESSION_SOURCE_EVENT_CONFLICT", "progression_source_event_conflict", "This source event was previously recorded with different immutable details.", 409, false],
    ["PROGRESSION_EVENT_SOURCE_MISMATCH", "progression_event_invalid", "Progression event source and type do not match.", 400, false],
    ["PROGRESSION_EVENT_TYPE_UNSUPPORTED", "progression_event_type_unsupported", "Progression event type is not registered.", 400, false],
    ["PROGRESSION_PLAYER_NOT_FOUND", "progression_player_not_found", "Progression Player was not found.", 404, false],
    ["GAME_SESSION_DISABLED", "progression_game_paused", "Progression awards are paused for this game.", 409, true],
    ["GAME_SESSION_ARCHIVED", "progression_game_ended", "Progression awards are closed because this game has ended.", 409, false],
    ["GAME_SESSION_NOT_ACTIVE", "progression_game_unavailable", "Progression awards are unavailable for this game.", 409, false],
    ["GAME_SESSION_NOT_FOUND", "progression_game_unavailable", "Progression awards are unavailable for this game.", 409, false],
  ];
  for (const [token, code, safeMessage, status, retryable] of mappings) {
    if (upper.includes(token)) {
      return new ProgressionError(code, safeMessage, status, retryable);
    }
  }
  if (upper.includes("PROGRESSION_EVENT_INVALID")) {
    return new ProgressionError(
      "progression_event_invalid",
      "Progression event contract is invalid.",
      400,
    );
  }
  return failed();
}

function failed(): ProgressionError {
  return new ProgressionError(
    "progression_event_failed",
    "Progression event could not be recorded.",
    500,
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function integer(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) ? parsed : -1;
}
