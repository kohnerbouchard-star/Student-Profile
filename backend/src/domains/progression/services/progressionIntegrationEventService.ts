import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import {
  PROGRESSION_EVENT_ID_PATTERN,
  PROGRESSION_EVENT_TYPES,
  PROGRESSION_IDEMPOTENCY_PATTERN,
  PROGRESSION_SOURCE_DOMAINS,
  PROGRESSION_SOURCE_PUBLIC_ID_PATTERN,
  ProgressionError,
  type ProgressionEventResultV1,
  type TrustedProgressionEventV1,
} from "../contracts/progressionContracts.ts";

interface ProgressionEventRpcRow {
  readonly event_outcome?: unknown;
  readonly event_id?: unknown;
  readonly experience_awarded?: unknown;
  readonly resulting_experience?: unknown;
  readonly resulting_level?: unknown;
  readonly achievements_completed?: unknown;
}

export async function recordTrustedProgressionEventV1(
  client: EdgeSupabaseClient,
  event: TrustedProgressionEventV1,
): Promise<ProgressionEventResultV1> {
  validateEvent(event);
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

function validateEvent(event: TrustedProgressionEventV1): void {
  if (
    !event.gameId || !event.playerUuid ||
    !PROGRESSION_SOURCE_DOMAINS.includes(event.sourceDomain) ||
    !PROGRESSION_EVENT_TYPES.includes(event.eventType) ||
    !PROGRESSION_SOURCE_PUBLIC_ID_PATTERN.test(event.sourcePublicId) ||
    !PROGRESSION_IDEMPOTENCY_PATTERN.test(event.idempotencyKey) ||
    !Number.isFinite(Date.parse(event.occurredAt))
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
  if (upper.includes("PROGRESSION_EVENT_TYPE_UNSUPPORTED")) {
    return new ProgressionError(
      "progression_event_type_unsupported",
      "Progression event type is not registered.",
      400,
    );
  }
  if (upper.includes("PROGRESSION_PLAYER_NOT_FOUND")) {
    return new ProgressionError(
      "progression_player_not_found",
      "Progression Player was not found.",
      404,
    );
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
