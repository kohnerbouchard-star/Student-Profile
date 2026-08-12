import type {
  StoryCurrencyVolatilityWriteInput,
  StoryEffectCurrencyWriter,
  StoryEffectWorldWriter,
  StoryWorldLocationStateWriteInput,
  StoryWorldRouteStateWriteInput,
  StoryWriteResult,
} from "../contracts/storyEffectExecutionContracts.ts";

interface DatabaseError {
  readonly code?: string;
  readonly message: string;
}

interface DatabaseResult<T> {
  readonly data: T | null;
  readonly error: DatabaseError | null;
}

interface QueryBuilder<T> {
  select(columns?: string): QueryBuilder<T>;
  eq(column: string, value: unknown): QueryBuilder<T>;
  maybeSingle(): Promise<DatabaseResult<T>>;
}

interface TableBuilder<T> {
  select(columns?: string): QueryBuilder<T>;
}

export interface StoryWorldFxSupabaseClient {
  from<T = Record<string, unknown>>(table: string): TableBuilder<T>;
  rpc<T = Record<string, unknown>>(
    functionName: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<DatabaseResult<T[]>>;
}

interface WorldRuntimeRevisionRow {
  readonly revision: number;
}

export class SupabaseStoryWorldFxWriter
  implements StoryEffectWorldWriter, StoryEffectCurrencyWriter {
  constructor(private readonly client: StoryWorldFxSupabaseClient) {}

  async applyRouteState(
    input: StoryWorldRouteStateWriteInput,
  ): Promise<StoryWriteResult> {
    await this.applyWorldMutation(
      "apply_world_route_state_v1",
      input.gameSessionId,
      input.idempotencyKey,
      (revision) => ({
        p_game_session_id: input.gameSessionId,
        p_expected_revision: revision,
        p_command_key: input.idempotencyKey,
        p_public_route_ids: [...input.routeIds],
        p_status: input.status,
        p_reason: input.reason,
        p_cost_multiplier_basis_points: input.costMultiplierBasisPoints,
        p_duration_multiplier_basis_points: input.durationMultiplierBasisPoints,
        p_applied_at: input.appliedAt,
      }),
    );

    return { id: `world-route:${input.idempotencyKey}` };
  }

  async applyLocationState(
    input: StoryWorldLocationStateWriteInput,
  ): Promise<StoryWriteResult> {
    await this.applyWorldMutation(
      "apply_world_location_state_v1",
      input.gameSessionId,
      input.idempotencyKey,
      (revision) => ({
        p_game_session_id: input.gameSessionId,
        p_expected_revision: revision,
        p_command_key: input.idempotencyKey,
        p_public_location_ids: [...input.locationIds],
        p_availability: input.availability,
        p_applied_at: input.appliedAt,
      }),
    );

    return { id: `world-location:${input.idempotencyKey}` };
  }

  async applyCurrencyVolatility(
    input: StoryCurrencyVolatilityWriteInput,
  ): Promise<StoryWriteResult> {
    const result = await this.client.rpc(
      "apply_story_currency_volatility_v1",
      {
        p_game_session_id: input.gameSessionId,
        p_command_key: input.idempotencyKey,
        p_adjustments_basis_points: input.adjustmentsBasisPoints,
        p_effective_at: input.appliedAt,
      },
    );

    if (result.error) {
      throw new Error(
        `Story currency volatility failed: ${result.error.code ?? "database_error"}.`,
      );
    }

    return { id: `currency-volatility:${input.idempotencyKey}` };
  }

  private async applyWorldMutation(
    rpcName: "apply_world_route_state_v1" | "apply_world_location_state_v1",
    gameSessionId: string,
    commandKey: string,
    args: (revision: number) => Readonly<Record<string, unknown>>,
  ): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const revision = await this.readWorldRevision(gameSessionId);
      const result = await this.client.rpc(rpcName, args(revision));

      if (!result.error) {
        return;
      }

      if (result.error.code === "40001" && attempt === 0) {
        continue;
      }

      throw new Error(
        `Story World mutation ${commandKey} failed: ${
          result.error.code ?? "database_error"
        }.`,
      );
    }
  }

  private async readWorldRevision(gameSessionId: string): Promise<number> {
    const result = await this.client.from<WorldRuntimeRevisionRow>(
      "world_runtime_instances",
    )
      .select("revision")
      .eq("game_session_id", gameSessionId)
      .maybeSingle();

    if (result.error || !result.data) {
      throw new Error(
        `Story World runtime revision is unavailable: ${
          result.error?.code ?? "not_found"
        }.`,
      );
    }

    const revision = Number(result.data.revision);
    if (!Number.isSafeInteger(revision) || revision < 0) {
      throw new Error("Story World runtime revision is invalid.");
    }

    return revision;
  }
}
