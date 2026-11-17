// Adapter-local query contracts, database rows and select lists.
import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
import type {
  GameSessionStorylineStatus,
  StoryEventResolutionStatus,
  StoryPriority,
  StoryTriggerType,
} from "../contracts/storylineContracts.ts";

export type StorylineTableName =
  | "game_session_storylines"
  | "storyline_events"
  | "game_session_story_event_overrides"
  | "story_event_resolutions"
  | "player_story_impacts"
  | "game_session_policies"
  | "game_session_story_flags";

export interface SupabaseStorylineQueryError {
  readonly message: string;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

export interface SupabaseStorylineQueryResponse<T = unknown> {
  readonly data: T | null;
  readonly error: SupabaseStorylineQueryError | null;
}

export interface SupabaseStorylineClient {
  from(tableName: StorylineTableName): SupabaseStorylineQueryBuilder;
}

export interface SupabaseStorylineQueryBuilder {
  select(columns: string): SupabaseStorylineFilterBuilder;
  insert(row: unknown): SupabaseStorylineInsertBuilder;
  upsert(
    row: unknown,
    options?: { readonly onConflict?: string },
  ): SupabaseStorylineInsertBuilder;
}

export interface SupabaseStorylineFilterBuilder
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

export interface SupabaseStorylineInsertBuilder {
  select(columns: string): SupabaseStorylineInsertSelectBuilder;
}

export interface SupabaseStorylineInsertSelectBuilder {
  maybeSingle(): PromiseLike<SupabaseStorylineQueryResponse<unknown>>;
}

export interface GameSessionStorylineRow {
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

export interface StorylineEventRow {
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

export interface StoryEventOverrideRow {
  readonly storyline_event_id: string;
  readonly enabled: boolean;
}

export interface StoryEventResolutionRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly storyline_event_id: string;
  readonly resolved_at: string;
  readonly resolved_market_tick?: number | string | null;
  readonly status: StoryEventResolutionStatus | string;
  readonly result_payload: JsonObject;
  readonly created_at: string;
}

export interface StoryFlagRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly flag_key: string;
  readonly value: JsonValue;
  readonly source_story_event_id?: string | null;
  readonly created_at: string;
}

export const GAME_SESSION_STORYLINE_SELECT = [
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

export const STORYLINE_EVENT_SELECT = [
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

export const STORY_EVENT_OVERRIDE_SELECT = "storyline_event_id,enabled";

export const STORY_EVENT_RESOLUTION_SELECT = [
  "id",
  "game_session_id",
  "storyline_event_id",
  "resolved_at",
  "resolved_market_tick",
  "status",
  "result_payload",
  "created_at",
].join(",");

export const STORY_FLAG_SELECT = [
  "id",
  "game_session_id",
  "flag_key",
  "value",
  "source_story_event_id",
  "created_at",
].join(",");

export const POLICY_SELECT = "id";
export const IMPACT_SELECT = "id";
export const FLAG_WRITE_SELECT = "id";
