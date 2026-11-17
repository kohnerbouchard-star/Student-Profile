import type { JsonValue } from "../../../supabase/tableTypes.ts";
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
  GameSessionStorylineRow,
  StoryEventOverrideRow,
  StoryEventResolutionRow,
  StoryFlagRow,
  StorylineEventRow,
  StorylineTableName,
  SupabaseStorylineClient,
  SupabaseStorylineQueryResponse,
} from "./storylineRows.ts";
import {
  FLAG_WRITE_SELECT,
  GAME_SESSION_STORYLINE_SELECT,
  IMPACT_SELECT,
  POLICY_SELECT,
  STORY_EVENT_OVERRIDE_SELECT,
  STORY_EVENT_RESOLUTION_SELECT,
  STORY_FLAG_SELECT,
  STORYLINE_EVENT_SELECT,
} from "./storylineRows.ts";
import {
  isAutomaticCandidate,
  toGameSessionStorylineRecord,
  toStoryEventResolutionRecord,
  toStorylineEventCandidateRecord,
  toWriteResult,
} from "./storylineRowProjection.ts";

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
      .order("act", { ascending: true })
      .order("sequence", { ascending: true });

    assertNoError(eventResponse, "storyline_events", "select");

    const overrideResponse = await this.client
      .from("game_session_story_event_overrides")
      .select(STORY_EVENT_OVERRIDE_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("enabled", true);

    assertNoError(
      overrideResponse,
      "game_session_story_event_overrides",
      "select",
    );

    const enabledOverrideEventIds = new Set(
      (overrideResponse.data ?? []).map((row) =>
        String((row as StoryEventOverrideRow).storyline_event_id)
      ),
    );

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
      .filter((row) => row.is_active || enabledOverrideEventIds.has(row.id))
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
