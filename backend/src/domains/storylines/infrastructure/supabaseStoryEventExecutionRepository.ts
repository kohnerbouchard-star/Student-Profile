import type { JsonObject } from "../../../supabase/tableTypes.ts";
import type {
  ClaimStoryEventExecutionInput,
  FailStoryEventExecutionInput,
  FinalizeStoryEventExecutionInput,
  StoryEventExecutionClaimOutcome,
  StoryEventExecutionClaimResult,
  StoryEventExecutionFailureResult,
  StoryEventExecutionFinalizeResult,
  StoryEventExecutionRepository,
} from "../contracts/storyEventExecutionContracts.ts";
import { StoryEventExecutionRepositoryError } from "../contracts/storyEventExecutionContracts.ts";

interface RpcError {
  readonly code?: string;
  readonly message: string;
}

interface RpcResponse<T> {
  readonly data: T | null;
  readonly error: RpcError | null;
}

interface StoryEventExecutionRpcClient {
  rpc<T = unknown>(
    functionName: string,
    args?: Readonly<Record<string, unknown>>,
  ): PromiseLike<RpcResponse<T>>;
}

interface ClaimRow {
  readonly claim_outcome: string;
  readonly claim_id?: string | null;
  readonly lease_token?: string | null;
  readonly lease_expires_at?: string | null;
  readonly effective_at: string;
  readonly effective_market_tick?: number | string | null;
  readonly attempt_count: number | string;
  readonly execution_plan: JsonObject;
  readonly resolution_id?: string | null;
}

interface FailureRow {
  readonly claim_outcome: string;
  readonly claim_id: string;
  readonly attempt_count: number | string;
}

interface FinalizeRow {
  readonly finalize_outcome: string;
  readonly claim_id: string;
  readonly resolution_id: string;
  readonly attempt_count: number | string;
}

export class SupabaseStoryEventExecutionRepository
  implements StoryEventExecutionRepository {
  constructor(private readonly client: StoryEventExecutionRpcClient) {}

  async claim(
    input: ClaimStoryEventExecutionInput,
  ): Promise<StoryEventExecutionClaimResult> {
    const response = await this.client.rpc<readonly ClaimRow[]>(
      "claim_story_event_execution_v1",
      {
        p_game_session_id: input.gameSessionId,
        p_storyline_event_id: input.storylineEventId,
        p_effective_at: input.effectiveAt,
        p_effective_market_tick: input.effectiveMarketTick,
        p_execution_plan: input.executionPlan,
        p_lease_seconds: input.leaseSeconds ?? 120,
      },
    );

    if (response.error) {
      throw repositoryError("claim", response.error);
    }

    const row = readSingleRow(response.data, "claim");
    const outcome = readClaimOutcome(row.claim_outcome);
    const attemptCount = readNonNegativeInteger(row.attempt_count, "attempt_count");
    const effectiveMarketTick = readNullableNonNegativeInteger(
      row.effective_market_tick,
      "effective_market_tick",
    );

    if (!isJsonObject(row.execution_plan)) {
      throw invalidResponse("claim", "execution_plan must be a JSON object.");
    }

    if (!isIsoDateTime(row.effective_at)) {
      throw invalidResponse("claim", "effective_at must be an ISO timestamp.");
    }

    if (
      outcome === "acquired" &&
      (!isNonEmptyText(row.claim_id) ||
        !isNonEmptyText(row.lease_token) ||
        !isIsoDateTime(row.lease_expires_at) ||
        effectiveMarketTick === null ||
        attemptCount < 1)
    ) {
      throw invalidResponse("claim", "acquired claim is incomplete.");
    }

    if (
      outcome === "already_resolved" &&
      !isNonEmptyText(row.resolution_id)
    ) {
      throw invalidResponse("claim", "resolved claim is missing resolution_id.");
    }

    return {
      outcome,
      claimId: readNullableText(row.claim_id),
      leaseToken: readNullableText(row.lease_token),
      leaseExpiresAt: readNullableIsoDateTime(row.lease_expires_at),
      effectiveAt: row.effective_at,
      effectiveMarketTick,
      attemptCount,
      executionPlan: row.execution_plan,
      resolutionId: readNullableText(row.resolution_id),
    };
  }

  async fail(
    input: FailStoryEventExecutionInput,
  ): Promise<StoryEventExecutionFailureResult> {
    const response = await this.client.rpc<readonly FailureRow[]>(
      "fail_story_event_execution_v1",
      {
        p_game_session_id: input.gameSessionId,
        p_storyline_event_id: input.storylineEventId,
        p_lease_token: input.leaseToken,
        p_error_message: input.errorMessage,
      },
    );

    if (response.error) {
      throw repositoryError("fail", response.error);
    }

    const row = readSingleRow(response.data, "fail");
    if (
      row.claim_outcome !== "retryable_failed" &&
      row.claim_outcome !== "already_resolved"
    ) {
      throw invalidResponse("fail", "claim_outcome is invalid.");
    }
    if (!isNonEmptyText(row.claim_id)) {
      throw invalidResponse("fail", "claim_id is required.");
    }

    return {
      outcome: row.claim_outcome,
      claimId: row.claim_id,
      attemptCount: readPositiveInteger(row.attempt_count, "attempt_count"),
    };
  }

  async finalize(
    input: FinalizeStoryEventExecutionInput,
  ): Promise<StoryEventExecutionFinalizeResult> {
    const response = await this.client.rpc<readonly FinalizeRow[]>(
      "finalize_story_event_execution_v1",
      {
        p_game_session_id: input.gameSessionId,
        p_storyline_event_id: input.storylineEventId,
        p_lease_token: input.leaseToken,
        p_result_payload: input.resultPayload,
      },
    );

    if (response.error) {
      throw repositoryError("finalize", response.error);
    }

    const row = readSingleRow(response.data, "finalize");
    if (
      row.finalize_outcome !== "finalized" &&
      row.finalize_outcome !== "already_resolved"
    ) {
      throw invalidResponse("finalize", "finalize_outcome is invalid.");
    }
    if (!isNonEmptyText(row.claim_id) || !isNonEmptyText(row.resolution_id)) {
      throw invalidResponse("finalize", "finalize result identifiers are required.");
    }

    return {
      outcome: row.finalize_outcome,
      claimId: row.claim_id,
      resolutionId: row.resolution_id,
      attemptCount: readPositiveInteger(row.attempt_count, "attempt_count"),
    };
  }
}

function readClaimOutcome(value: string): StoryEventExecutionClaimOutcome {
  if (
    value === "absent" ||
    value === "acquired" ||
    value === "busy" ||
    value === "already_resolved"
  ) {
    return value;
  }

  throw invalidResponse("claim", "claim_outcome is invalid.");
}

function readSingleRow<T>(
  value: readonly T[] | null,
  operation: "claim" | "fail" | "finalize",
): T {
  const row = Array.isArray(value) ? value[0] : null;
  if (!row) {
    throw invalidResponse(operation, "RPC returned no row.");
  }
  return row;
}

function readPositiveInteger(value: number | string, fieldName: string): number {
  const parsed = readNonNegativeInteger(value, fieldName);
  if (parsed < 1) {
    throw invalidResponse("claim", `${fieldName} must be positive.`);
  }
  return parsed;
}

function readNonNegativeInteger(value: number | string, fieldName: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw invalidResponse("claim", `${fieldName} must be a non-negative integer.`);
  }
  return parsed;
}

function readNullableNonNegativeInteger(
  value: number | string | null | undefined,
  fieldName: string,
): number | null {
  if (value === null || value === undefined) return null;
  return readNonNegativeInteger(value, fieldName);
}

function readNullableText(value: string | null | undefined): string | null {
  return isNonEmptyText(value) ? value : null;
}

function readNullableIsoDateTime(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (!isIsoDateTime(value)) {
    throw invalidResponse("claim", "lease_expires_at must be an ISO timestamp.");
  }
  return value;
}

function isIsoDateTime(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    Number.isFinite(Date.parse(value));
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function repositoryError(
  operation: "claim" | "fail" | "finalize",
  error: RpcError,
): StoryEventExecutionRepositoryError {
  return new StoryEventExecutionRepositoryError(
    `story_event_execution_${operation}_failed`,
    error.message || `Story event execution ${operation} failed.`,
    operation,
  );
}

function invalidResponse(
  operation: "claim" | "fail" | "finalize",
  message: string,
): StoryEventExecutionRepositoryError {
  return new StoryEventExecutionRepositoryError(
    `story_event_execution_${operation}_invalid_response`,
    message,
    operation,
  );
}
