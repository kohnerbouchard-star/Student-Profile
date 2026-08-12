import type {
  StoryContractCreateWriteInput,
  StoryEffectContractWriter,
  StoryWriteResult,
} from "../contracts/storyEffectExecutionContracts.ts";

interface StoryContractQueryError {
  readonly message: string;
  readonly code?: string;
}

interface StoryContractResponse<T = unknown> {
  readonly data: T | null;
  readonly error: StoryContractQueryError | null;
}

interface StoryContractClient {
  from(tableName: "game_session_contracts"): StoryContractQueryBuilder;
}

interface StoryContractQueryBuilder {
  insert(row: unknown): StoryContractInsertBuilder;
  select(columns: string): StoryContractFilterBuilder;
}

interface StoryContractInsertBuilder {
  select(columns: string): StoryContractInsertSelectBuilder;
}

interface StoryContractInsertSelectBuilder {
  maybeSingle(): PromiseLike<StoryContractResponse<unknown>>;
}

interface StoryContractFilterBuilder
  extends PromiseLike<StoryContractResponse<unknown[]>> {
  eq(column: string, value: unknown): StoryContractFilterBuilder;
}

interface ExistingStoryContractRow {
  readonly id: string;
  readonly contract_key: string;
  readonly source_type: string;
  readonly source_id: string | null;
}

export class SupabaseStoryContractWriter implements StoryEffectContractWriter {
  constructor(private readonly client: StoryContractClient) {}

  async createGameSessionContract(
    input: StoryContractCreateWriteInput,
  ): Promise<StoryWriteResult> {
    const response = await this.client
      .from("game_session_contracts")
      .insert({
        game_session_id: input.gameSessionId,
        contract_template_id: input.contractTemplateId ?? null,
        contract_key: input.contractKey,
        source_type: input.sourceType,
        source_id: input.sourceId ?? null,
        created_by_staff_id: input.createdByStaffId ?? null,
        title: input.title,
        description: input.description,
        instructions: input.instructions,
        category: input.category ?? "story",
        status: input.status ?? "active",
        visibility: input.visibility ?? "public",
        targeting_payload: input.targetingPayload ?? {},
        requirements_payload: input.requirementsPayload ?? {},
        reward_payload: input.rewardPayload ?? {},
        completion_mode: input.completionMode ?? "manual_review",
        published_at: input.publishedAt ?? null,
        deadline_at: input.deadlineAt ?? null,
        expires_at: input.expiresAt ?? null,
        metadata: input.metadata ?? {},
      })
      .select("id")
      .maybeSingle();

    if (response.error?.code === "23505") {
      return await this.readExistingStoryContract(input);
    }

    assertNoError(response, "Story Contract insert failed.");
    return writeResult(response.data, "Story Contract insert returned no row.");
  }

  private async readExistingStoryContract(
    input: StoryContractCreateWriteInput,
  ): Promise<StoryWriteResult> {
    if (input.sourceType !== "story_event" || !input.sourceId) {
      throw new Error("Story Contract conflict is not replayable.");
    }

    const response = await this.client
      .from("game_session_contracts")
      .select("id,contract_key,source_type,source_id")
      .eq("game_session_id", input.gameSessionId)
      .eq("source_type", "story_event")
      .eq("source_id", input.sourceId);

    assertNoError(response, "Story Contract replay lookup failed.");

    const expectedKey = input.contractKey.trim().toLowerCase();
    const existing = (response.data ?? [])
      .map((row) => row as ExistingStoryContractRow)
      .find((row) =>
        row.source_type === "story_event" &&
        row.source_id === input.sourceId &&
        row.contract_key.trim().toLowerCase() === expectedKey
      );

    if (!existing?.id) {
      throw new Error("Story Contract conflict did not match the same Story source.");
    }

    return { id: existing.id };
  }
}

function assertNoError(
  response: StoryContractResponse<unknown>,
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
