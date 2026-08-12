import type {
  StoryEffectImpactWriter,
  StoryPlayerImpactWriteInput,
  StoryWriteResult,
} from "../contracts/storyEffectExecutionContracts.ts";

interface StoryImpactQueryError {
  readonly message: string;
  readonly code?: string;
}

interface StoryImpactResponse<T = unknown> {
  readonly data: T | null;
  readonly error: StoryImpactQueryError | null;
}

interface StoryImpactClient {
  from(tableName: "player_story_impacts"): StoryImpactQueryBuilder;
}

interface StoryImpactQueryBuilder {
  insert(row: unknown): StoryImpactInsertBuilder;
  select(columns: string): StoryImpactFilterBuilder;
}

interface StoryImpactInsertBuilder {
  select(columns: string): StoryImpactInsertSelectBuilder;
}

interface StoryImpactInsertSelectBuilder {
  maybeSingle(): PromiseLike<StoryImpactResponse<unknown>>;
}

interface StoryImpactFilterBuilder
  extends PromiseLike<StoryImpactResponse<unknown[]>> {
  eq(column: string, value: unknown): StoryImpactFilterBuilder;
  maybeSingle(): PromiseLike<StoryImpactResponse<unknown>>;
}

export class SupabaseStoryImpactWriter implements StoryEffectImpactWriter {
  constructor(private readonly client: StoryImpactClient) {}

  async createPlayerImpact(
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
        idempotency_key: input.idempotencyKey,
      })
      .select("id")
      .maybeSingle();

    if (response.error?.code === "23505") {
      return await this.readExisting(input);
    }

    assertNoError(response, "Story impact insert failed.");
    return writeResult(response.data, "Story impact insert returned no row.");
  }

  private async readExisting(
    input: StoryPlayerImpactWriteInput,
  ): Promise<StoryWriteResult> {
    const response = await this.client
      .from("player_story_impacts")
      .select("id")
      .eq("game_session_id", input.gameSessionId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();

    assertNoError(response, "Story impact replay lookup failed.");
    return writeResult(response.data, "Story impact replay row was not found.");
  }
}

function assertNoError(
  response: StoryImpactResponse<unknown>,
  fallback: string,
): void {
  if (response.error) {
    throw new Error(response.error.message || fallback);
  }
}

function writeResult(value: unknown, fallback: string): StoryWriteResult {
  const id = (value as { readonly id?: unknown } | null)?.id;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(fallback);
  }
  return { id };
}
