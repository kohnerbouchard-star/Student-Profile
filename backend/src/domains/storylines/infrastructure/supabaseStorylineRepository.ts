import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
import type {
  StoryFlagWriteInput,
  StoryPlayerImpactWriteInput,
  StoryPolicyWriteInput,
  StoryWriteResult,
} from "../contracts/storyEffectExecutionContracts.ts";
import type {
  CreateStoryEventResolutionInput,
  CreateStoryEventResolutionResult,
  GameSessionStorylineRecord,
  ListUnresolvedActiveStorylineEventsInput,
  StoryEventResolutionRecord,
  StorylineEventCandidateRecord,
  StorylineRepository,
} from "../contracts/storylineRepositoryContracts.ts";
import { StorylineRepositoryError } from "../contracts/storylineRepositoryContracts.ts";
import type {
  GameSessionStorylineStatus,
  StoryEventResolutionStatus,
  StoryPriority,
  StoryTriggerType,
} from "../contracts/storylineContracts.ts";

type StorylineTableName =
  | "game_session_storylines"
  | "storyline_events"
  | "story_event_resolutions"
  | "player_story_impacts"
  | "game_session_policies"
  | "game_session_story_flags";

interface SupabaseStorylineQueryError {
  readonly message: string;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

interface SupabaseStorylineQueryResponse<T = unknown> {
  readonly data: T | null;
  readonly error: SupabaseStorylineQueryError | null;
}

interface SupabaseStorylineClient {
  from(tableName: StorylineTableName): SupabaseStorylineQueryBuilder;
}

interface SupabaseStorylineQueryBuilder {
  select(columns: string): SupabaseStorylineFilterBuilder;
  insert(row: unknown): SupabaseStorylineInsertBuilder;
  upsert(
    row: unknown,
    options?: { readonly onConflict?: string },
  ): SupabaseStorylineInsertBuilder;
}

interface SupabaseStorylineFilterBuilder
  extends PromiseLike<SupabaseStorylineQueryResponse<unknown[]>> {
  eq(column: string, value: unknown): SupabaseStorylineFilterBuilder;
  in(
    column: string,
    values: readonly unknown[],
  ): SupabaseStorylineFilterBuilder;
  order(
    column: string,
    options?: { readonly ascending?: boolean },
  ): SupabaseStorylineFilterBuilder;
  maybeSingle(): PromiseLike<SupabaseStorylineQueryResponse<unknown>>;
}

interface SupabaseStorylineInsertBuilder {
  select(columns: string): SupabaseStorylineInsertSelectBuilder;
}

interface SupabaseStorylineInsertSelectBuilder {
  maybeSingle(): PromiseLike<SupabaseStorylineQueryResponse<unknown>>;
}

interface GameSessionStorylineRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly storyline_id: string;
  readonly status: GameSessionStorylineStatus | string;
  readonly story_started_at: string;
  readonly paused_at?: string | null;
  readonly accumulated_pause_seconds: number | string;
  readonly time_scale: number | string;
  readonly created_at: string;
}

interface StorylineEventRow {
  readonly id: string;
  readonly storyline_id: string;
  readonly event_key: string;
  readonly title: string;
  readonly description: string;
  readonly act: number | string;
  readonly sequence: number | string;
  readonly trigger_type: StoryTriggerType;
  readonly scheduled_offset_seconds?: number | string | null;
  readonly scheduled_at?: string | null;
  readonly scheduled_market_tick?: number | string | null;
  readonly trigger_condition: JsonObject;
  readonly reveal_payload: JsonObject;
  readonly public_news_payload: JsonObject;
  readonly player_rules: readonly JsonObject[];
  readonly policy_payloads: readonly JsonObject[];
  readonly flag_payloads: readonly JsonObject[];
  readonly contract_unlock_payloads: readonly JsonObject[];
  readonly priority: StoryPriority | string;
  readonly is_active: boolean;
  readonly created_at: string;
}

interface StoryEventResolutionRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly storyline_event_id: string;
  readonly resolved_at: string;
  readonly resolved_market_tick?: number | string | null;
  readonly status: StoryEventResolutionStatus | string;
  readonly result_payload: JsonObject;
  readonly created_at: string;
}

interface StoryFlagRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly flag_key: string;
  readonly value: JsonValue;
  readonly source_story_event_id?: string | null;
  readonly created_at: string;
}

const GAME_SESSION_STORYLINE_SELECT = [
  "id",
  "game_session_id",
  "storyline_id",
  "status",
  "story_started_at",
  "paused_at",
  "accumulated_pause_seconds",
  "time_scale",
  "created_at",
].join(",");

const STORYLINE_EVENT_SELECT = [
  "id",
  "storyline_id",
  "event_key",
  "title",
  "description",
  "act",
  "sequence",
  "trigger_type",
  "scheduled_offset_seconds",
  "scheduled_at",
  "scheduled_market_tick",
  "trigger_condition",
  "reveal_payload",
  "public_news_payload",
  "player_rules",
  "policy_payloads",
  "flag_payloads",
  "contract_unlock_payloads",
  "priority",
  "is_active",
  "created_at",
].join(",");

const STORY_EVENT_RESOLUTION_SELECT = [
  "id",
  "game_session_id",
  "storyline_event_id",
  "resolved_at",
  "resolved_market_tick",
  "status",
  "result_payload",
  "created_at",
].join(",");

const STORY_FLAG_SELECT = [
  "id",
  "game_session_id",
  "flag_key",
  "value",
  "source_story_event_id",
  "created_at",
].join(",");

const POLICY_SELECT = "id";
const IMPACT_SELECT = "id";
const FLAG_WRITE_SELECT = "id";

export class SupabaseStorylineRepository implements StorylineRepository {
  constructor(private readonly client: SupabaseStorylineClient) {}

  async listActiveGameSessionStorylines(
    gameSessionId: string,
  ): Promise<readonly GameSessionStorylineRecord[]> {
    const response = await this.client
      .from("game_session_storylines")
      .select(GAME_SESSION_STORYLINE_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("status", "active")
      .order("created_at", { ascending: true });

    assertNoError(response, "game_session_storylines", "select");

    return (response.data ?? []).map((row) =>
      toGameSessionStorylineRecord(row as GameSessionStorylineRow)
    );
  }

  async listUnresolvedActiveStorylineEvents(
    input: ListUnresolvedActiveStorylineEventsInput,
  ): Promise<readonly StorylineEventCandidateRecord[]> {
    const activations = await this.listActiveGameSessionStorylines(
      input.gameSessionId,
    );

    if (activations.length === 0) {
      return [];
    }

    const storylineIds = activations.map((activation) =>
      activation.storylineId
    );
    const eventResponse = await this.client
      .from("storyline_events")
      .select(STORYLINE_EVENT_SELECT)
      .in("storyline_id", storylineIds)
      .eq("is_active", true)
      .order("act", { ascending: true })
      .order("sequence", { ascending: true });

    assertNoError(eventResponse, "storyline_events", "select");

    const resolutionResponse = await this.client
      .from("story_event_resolutions")
      .select("storyline_event_id")
      .eq("game_session_id", input.gameSessionId);

    assertNoError(
      resolutionResponse,
      "story_event_resolutions",
      "select",
    );

    const resolvedEventIds = new Set(
      (resolutionResponse.data ?? []).map((row) =>
        String(
          (row as { readonly storyline_event_id: string }).storyline_event_id,
        )
      ),
    );
    const activationByStorylineId = new Map(
      activations.map((activation) => [activation.storylineId, activation]),
    );

    return (eventResponse.data ?? [])
      .map((row) => row as StorylineEventRow)
      .filter((row) => !resolvedEventIds.has(row.id))
      .flatMap((row) => {
        const activation = activationByStorylineId.get(row.storyline_id);

        if (!activation || !isAutomaticCandidate(row, activation, input)) {
          return [];
        }

        return [toStorylineEventCandidateRecord(row, activation)];
      });
  }

  async createStoryEventResolution(
    input: CreateStoryEventResolutionInput,
  ): Promise<CreateStoryEventResolutionResult> {
    const row = {
      game_session_id: input.gameSessionId,
      storyline_event_id: input.storylineEventId,
      resolved_at: input.resolvedAt,
      resolved_market_tick: input.resolvedMarketTick ?? null,
      status: input.status ?? "resolved",
      result_payload: input.resultPayload ?? {},
    };

    const response = await this.client
      .from("story_event_resolutions")
      .insert(row)
      .select(STORY_EVENT_RESOLUTION_SELECT)
      .maybeSingle();

    if (response.error?.code === "23505") {
      const existing = await this.readExistingResolution(input);

      return {
        status: "existing",
        resolution: existing,
      };
    }

    assertNoError(response, "story_event_resolutions", "insert");

    if (!response.data) {
      throw repositoryError(
        "story_resolution_insert_missing_row",
        "Story event resolution insert returned no row.",
        "story_event_resolutions",
        "insert",
      );
    }

    return {
      status: "inserted",
      resolution: toStoryEventResolutionRecord(
        response.data as StoryEventResolutionRow,
      ),
    };
  }

  async createPlayerStoryImpact(
    input: StoryPlayerImpactWriteInput,
  ): Promise<StoryWriteResult> {
    const response = await this.client
      .from("player_story_impacts")
      .insert({
        game_session_id: input.gameSessionId,
        player_id: input.playerId,
        storyline_event_id: input.storylineEventId,
        effect_type: input.effectType,
        impact_label: input.impactLabel,
        impact_reason: input.impactReason,
        amount: input.amount,
        payload: input.payload,
      })
      .select(IMPACT_SELECT)
      .maybeSingle();

    assertNoError(response, "player_story_impacts", "insert");

    return toWriteResult(response.data);
  }

  createPlayerImpact(
    input: StoryPlayerImpactWriteInput,
  ): Promise<StoryWriteResult> {
    return this.createPlayerStoryImpact(input);
  }

  async upsertGameSessionPolicy(
    input: StoryPolicyWriteInput,
  ): Promise<StoryWriteResult> {
    const response = await this.client
      .from("game_session_policies")
      .upsert({
        game_session_id: input.gameSessionId,
        policy_key: input.policyKey,
        policy_type: input.policyType,
        scope_type: input.scopeType,
        scope_key: input.scopeKey,
        starts_at: input.startsAt,
        expires_at: input.expiresAt,
        payload: input.payload,
        source_story_event_id: input.sourceStoryEventId,
        is_active: true,
      }, { onConflict: "game_session_id,policy_key" })
      .select(POLICY_SELECT)
      .maybeSingle();

    assertNoError(response, "game_session_policies", "upsert");

    return toWriteResult(response.data);
  }

  upsertPolicy(input: StoryPolicyWriteInput): Promise<StoryWriteResult> {
    return this.upsertGameSessionPolicy(input);
  }

  async setGameSessionStoryFlag(
    input: StoryFlagWriteInput,
  ): Promise<StoryWriteResult> {
    const response = await this.client
      .from("game_session_story_flags")
      .upsert({
        game_session_id: input.gameSessionId,
        flag_key: input.flagKey,
        value: input.value,
        source_story_event_id: input.sourceStoryEventId,
      }, { onConflict: "game_session_id,flag_key" })
      .select(FLAG_WRITE_SELECT)
      .maybeSingle();

    assertNoError(response, "game_session_story_flags", "upsert");

    return toWriteResult(response.data);
  }

  setStoryFlag(input: StoryFlagWriteInput): Promise<StoryWriteResult> {
    return this.setGameSessionStoryFlag(input);
  }

  async listGameSessionStoryFlags(
    gameSessionId: string,
  ): Promise<Record<string, JsonValue>> {
    const response = await this.client
      .from("game_session_story_flags")
      .select(STORY_FLAG_SELECT)
      .eq("game_session_id", gameSessionId)
      .order("created_at", { ascending: true });

    assertNoError(response, "game_session_story_flags", "select");

    const flags: Record<string, JsonValue> = {};

    for (const row of response.data ?? []) {
      const flag = row as StoryFlagRow;
      flags[flag.flag_key] = flag.value;
    }

    return flags;
  }

  private async readExistingResolution(
    input: CreateStoryEventResolutionInput,
  ): Promise<StoryEventResolutionRecord> {
    const response = await this.client
      .from("story_event_resolutions")
      .select(STORY_EVENT_RESOLUTION_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("storyline_event_id", input.storylineEventId)
      .maybeSingle();

    assertNoError(response, "story_event_resolutions", "select");

    if (!response.data) {
      throw repositoryError(
        "story_resolution_conflict_missing_row",
        "Story event resolution already exists but could not be loaded.",
        "story_event_resolutions",
        "select",
      );
    }

    return toStoryEventResolutionRecord(
      response.data as StoryEventResolutionRow,
    );
  }
}

function isAutomaticCandidate(
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

function toGameSessionStorylineRecord(
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

function toStorylineEventCandidateRecord(
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

function toStoryEventResolutionRecord(
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

function toWriteResult(data: unknown | null): StoryWriteResult {
  const id = (data as { readonly id?: string } | null)?.id;

  return id ? { id } : {};
}

function assertNoError(
  response: SupabaseStorylineQueryResponse<unknown>,
  tableName: StorylineTableName,
  operation: string,
): void {
  if (response.error) {
    throw repositoryError(
      "storyline_repository_query_failed",
      response.error.message || "Storyline repository query failed.",
      tableName,
      operation,
    );
  }
}

function repositoryError(
  code: string,
  message: string,
  tableName: StorylineTableName,
  operation: string,
): StorylineRepositoryError {
  return new StorylineRepositoryError(code, message, tableName, operation);
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
