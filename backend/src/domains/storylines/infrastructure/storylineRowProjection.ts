// Pure adapter-local row interpretation; persistence and errors stay in the repository.
import type { StoryWriteResult } from "../contracts/storyEffectExecutionContracts.ts";
import type {
  GameSessionStorylineRecord,
  ListUnresolvedActiveStorylineEventsInput,
  StoryEventResolutionRecord,
  StorylineEventCandidateRecord,
} from "../contracts/storylineRepositoryContracts.ts";
import type {
  GameSessionStorylineRow,
  StoryEventResolutionRow,
  StorylineEventRow,
} from "./storylineRows.ts";

export function isAutomaticCandidate(
  row: StorylineEventRow,
  activation: GameSessionStorylineRecord,
  input: ListUnresolvedActiveStorylineEventsInput,
): boolean {
  if (row.trigger_type === "manual") {
    return false;
  }

  if (row.trigger_type === "condition") {
    return true;
  }

  if (row.trigger_type === "market_tick") {
    return readNullableNumber(row.scheduled_market_tick) !== null &&
      readNullableNumber(row.scheduled_market_tick)! <= input.currentMarketTick;
  }

  if (row.trigger_type === "wall_clock_time") {
    return !!row.scheduled_at &&
      Date.parse(row.scheduled_at) <= Date.parse(input.now);
  }

  const scheduledOffsetSeconds = readNullableNumber(
    row.scheduled_offset_seconds,
  );

  return scheduledOffsetSeconds !== null &&
    scheduledOffsetSeconds <= readStoryElapsedSeconds(activation, input.now);
}

function readStoryElapsedSeconds(
  activation: GameSessionStorylineRecord,
  now: string,
): number {
  const startedAtMs = Date.parse(activation.storyStartedAt);
  const nowMs = Date.parse(now);

  if (Number.isNaN(startedAtMs) || Number.isNaN(nowMs) || nowMs < startedAtMs) {
    return 0;
  }

  const rawElapsedSeconds = Math.floor((nowMs - startedAtMs) / 1000);

  return Math.max(
    0,
    (rawElapsedSeconds - activation.accumulatedPauseSeconds) *
      activation.timeScale,
  );
}

export function toGameSessionStorylineRecord(
  row: GameSessionStorylineRow,
): GameSessionStorylineRecord {
  return {
    id: row.id,
    gameSessionId: row.game_session_id,
    storylineId: row.storyline_id,
    status: row.status,
    storyStartedAt: row.story_started_at,
    pausedAt: row.paused_at ?? null,
    accumulatedPauseSeconds: readNumber(row.accumulated_pause_seconds),
    timeScale: readNumber(row.time_scale),
    createdAt: row.created_at,
  };
}

export function toStorylineEventCandidateRecord(
  row: StorylineEventRow,
  activation: GameSessionStorylineRecord,
): StorylineEventCandidateRecord {
  return {
    id: row.id,
    storylineId: row.storyline_id,
    gameSessionId: activation.gameSessionId,
    gameSessionStorylineId: activation.id,
    storyStartedAt: activation.storyStartedAt,
    accumulatedPauseSeconds: activation.accumulatedPauseSeconds,
    timeScale: activation.timeScale,
    eventKey: row.event_key,
    title: row.title,
    description: row.description,
    act: readNumber(row.act),
    sequence: readNumber(row.sequence),
    triggerType: row.trigger_type,
    scheduledOffsetSeconds: readNullableNumber(row.scheduled_offset_seconds),
    scheduledAt: row.scheduled_at ?? null,
    scheduledMarketTick: readNullableNumber(row.scheduled_market_tick),
    triggerCondition: row.trigger_condition,
    revealPayload: row.reveal_payload,
    publicNewsPayload: row.public_news_payload,
    playerRules: row.player_rules,
    policyPayloads: row.policy_payloads,
    flagPayloads: row.flag_payloads,
    contractUnlockPayloads: row.contract_unlock_payloads,
    priority: row.priority,
    createdAt: row.created_at,
  };
}

export function toStoryEventResolutionRecord(
  row: StoryEventResolutionRow,
): StoryEventResolutionRecord {
  return {
    id: row.id,
    gameSessionId: row.game_session_id,
    storylineEventId: row.storyline_event_id,
    resolvedAt: row.resolved_at,
    resolvedMarketTick: readNullableNumber(row.resolved_market_tick),
    status: row.status,
    resultPayload: row.result_payload,
    createdAt: row.created_at,
  };
}

export function toWriteResult(data: unknown | null): StoryWriteResult {
  const id = (data as { readonly id?: string } | null)?.id;

  return id ? { id } : {};
}

function readNumber(value: number | string): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(numericValue) ? numericValue : 0;
}

function readNullableNumber(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return readNumber(value);
}
