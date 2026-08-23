import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import {
  playerBusinessManufacturingCancelRequestSchema,
  playerBusinessManufacturingJobsSchema,
  playerBusinessManufacturingMutationResultSchema,
  playerBusinessManufacturingStartRequestSchema,
  type PlayerBusinessManufacturingJob,
  type PlayerBusinessManufacturingMutationResult,
} from "../contracts/playerBusinessManufacturingContracts.ts";
import { PlayerBusinessError } from "../contracts/playerBusinessContracts.ts";

type Scope = {
  readonly gameSessionId: string;
  readonly playerId: string;
};

export async function readPlayerBusinessManufacturingJobs(
  client: EdgeSupabaseClient,
  scope: Scope,
  businessKey: string,
): Promise<readonly PlayerBusinessManufacturingJob[]> {
  const data = await callRpc(
    client,
    "list_player_business_manufacturing_jobs_v2",
    {
      p_game_session_id: scope.gameSessionId,
      p_player_id: scope.playerId,
      p_business_key: businessKey,
      p_limit: 100,
    },
  );
  const parsed = playerBusinessManufacturingJobsSchema.safeParse(data);
  if (!parsed.success) {
    throw invalidResult("Manufacturing jobs could not be read safely.");
  }
  return parsed.data;
}

export async function startPlayerBusinessManufacturingJob(
  client: EdgeSupabaseClient,
  scope: Scope,
  businessKey: string,
  body: Record<string, unknown>,
): Promise<PlayerBusinessManufacturingMutationResult> {
  const request = playerBusinessManufacturingStartRequestSchema.safeParse(body);
  if (!request.success) {
    throw new PlayerBusinessError(
      "invalid_business_manufacturing_request",
      "Choose a valid product, quantity, and priority.",
      400,
    );
  }
  const data = singleResult(await callRpc(
    client,
    "start_player_business_manufacturing_job_v2",
    {
      p_game_session_id: scope.gameSessionId,
      p_player_id: scope.playerId,
      p_business_key: businessKey,
      p_product_key: request.data.productKey,
      p_quantity: request.data.quantity,
      p_priority: request.data.priority,
      p_idempotency_key: request.data.idempotencyKey,
    },
  ));
  const parsed =
    playerBusinessManufacturingMutationResultSchema.safeParse(data);
  if (!parsed.success) {
    throw invalidResult("Manufacturing start returned an invalid result.");
  }
  return parsed.data;
}

export async function cancelPlayerBusinessManufacturingJob(
  client: EdgeSupabaseClient,
  scope: Scope,
  businessKey: string,
  jobKey: string,
  body: Record<string, unknown>,
): Promise<PlayerBusinessManufacturingMutationResult> {
  const request = playerBusinessManufacturingCancelRequestSchema.safeParse(body);
  if (!request.success) {
    throw new PlayerBusinessError(
      "invalid_business_manufacturing_request",
      "The manufacturing cancellation request is invalid.",
      400,
    );
  }
  const data = singleResult(await callRpc(
    client,
    "cancel_player_business_manufacturing_job_v2",
    {
      p_game_session_id: scope.gameSessionId,
      p_player_id: scope.playerId,
      p_business_key: businessKey,
      p_job_key: jobKey,
      p_idempotency_key: request.data.idempotencyKey,
    },
  ));
  const parsed =
    playerBusinessManufacturingMutationResultSchema.safeParse(data);
  if (!parsed.success) {
    throw invalidResult("Manufacturing cancellation returned an invalid result.");
  }
  return parsed.data;
}

async function callRpc(
  client: EdgeSupabaseClient,
  command: string,
  args: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const response = await client.rpc<unknown>(command, args);
  if (response.error) {
    throw mapManufacturingDatabaseError(response.error.message);
  }
  return response.data;
}

function singleResult(value: unknown): unknown {
  if (
    Array.isArray(value) &&
    value.length === 1 &&
    value[0] &&
    typeof value[0] === "object" &&
    !Array.isArray(value[0])
  ) {
    return value[0];
  }
  return value;
}

function invalidResult(message: string): PlayerBusinessError {
  return new PlayerBusinessError(
    "business_manufacturing_result_invalid",
    message,
    500,
  );
}

function mapManufacturingDatabaseError(message: string): PlayerBusinessError {
  const token = message.trim().split(/\s+/u)[0] || "BUSINESS_MANUFACTURING_FAILED";
  const code = token.split(":", 1)[0] || "BUSINESS_MANUFACTURING_FAILED";
  const notFound = new Set([
    "BUSINESS_NOT_FOUND",
    "BUSINESS_MANUFACTURING_JOB_NOT_FOUND",
    "BUSINESS_MANUFACTURING_PRODUCT_NOT_FOUND",
  ]);
  const invalid = new Set([
    "BUSINESS_KEY_INVALID",
    "BUSINESS_MANUFACTURING_JOB_KEY_INVALID",
    "BUSINESS_MANUFACTURING_PRODUCT_KEY_INVALID",
    "BUSINESS_MANUFACTURING_QUANTITY_INVALID",
    "BUSINESS_MANUFACTURING_PRIORITY_INVALID",
  ]);
  const conflicts = new Set([
    "IDEMPOTENCY_KEY_CONFLICT",
    "BUSINESS_MANUFACTURING_JOB_NOT_CANCELLABLE",
    "BUSINESS_MANUFACTURING_INPUT_QUANTITY_UNAVAILABLE",
    "BUSINESS_MANUFACTURING_LABOR_CAPACITY_UNAVAILABLE",
    "BUSINESS_MANUFACTURING_EQUIPMENT_CAPACITY_UNAVAILABLE",
    "BUSINESS_MANUFACTURING_RECIPE_UNAVAILABLE",
    "BUSINESS_MANUFACTURING_RECIPE_AMBIGUOUS",
    "BUSINESS_MANUFACTURING_OUTPUT_CONFLICT",
  ]);

  if (notFound.has(code)) {
    return new PlayerBusinessError(
      code.toLowerCase(),
      "The requested Business manufacturing resource was not found.",
      404,
    );
  }
  if (invalid.has(code)) {
    return new PlayerBusinessError(
      code.toLowerCase(),
      "The Business manufacturing request is invalid.",
      400,
    );
  }
  if (conflicts.has(code) || code.endsWith("_UNAVAILABLE")) {
    return new PlayerBusinessError(
      code.toLowerCase(),
      "Manufacturing cannot proceed with the current materials, labor, or equipment state.",
      409,
    );
  }
  return new PlayerBusinessError(
    code.toLowerCase(),
    "The Business manufacturing request could not be completed.",
    500,
    false,
  );
}
