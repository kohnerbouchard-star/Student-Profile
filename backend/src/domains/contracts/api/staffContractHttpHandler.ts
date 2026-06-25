/// <reference lib="dom" />

import {
  EdgeActivationError,
  type EdgeErrorBody,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  readOwnedGameSession,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import { isUuid } from "../../../platform/supabase/uuid.ts";
import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
import {
  CONTRACT_COMPLETION_MODES,
  CONTRACT_SOURCE_TYPES,
  CONTRACT_STATUSES,
  CONTRACT_VISIBILITIES,
  type ContractCompletionMode,
  type ContractSourceType,
  type ContractStatus,
  type ContractVisibility,
  parseGameSessionContractConfig,
  PLAYER_CONTRACT_STATUSES,
  type PlayerContractStatus,
} from "../contracts/contractContracts.ts";
import { ContractContractError } from "../contracts/contractContractErrors.ts";
import {
  type StaffContractListResponseBody,
  type StaffContractProgressListResponseBody,
  type StaffContractProgressReviewResponseBody,
  type StaffContractRewardIssueResponseBody,
  type StaffContractWriteResponseBody,
  toPlayerContractProgressDto,
  toStaffContractDto,
  toStaffContractSummaryDto,
} from "../contracts/contractHttpContracts.ts";
import type {
  ContractRepository,
  CreateGameSessionContractInput,
  GameSessionContractRecord,
  PlayerContractProgressRecord,
} from "../contracts/contractRepositoryContracts.ts";
import { ContractRepositoryError } from "../contracts/contractRepositoryContracts.ts";
import { SupabaseContractRepository } from "../infrastructure/supabaseContractRepository.ts";
import {
  alreadyIssuedRewardResult,
  ContractRewardLedgerRpcWriter,
  type ContractRewardLedgerWriter,
  issueContractRewards,
} from "../services/contractRewardService.ts";
import type { StaffContractRoute } from "./contractRoutePaths.ts";

export interface StaffContractHttpHandlerDependencies {
  readonly resolveStaffForRequest: (
    request: Request,
    env: SupabaseEnv,
    options: { readonly missingMessage: string },
  ) => Promise<
    | {
      readonly ok: true;
      readonly staff: {
        readonly id: string;
        readonly email?: string | null;
      };
      readonly serviceClient: EdgeSupabaseClient;
    }
    | {
      readonly ok: false;
      readonly status: number;
      readonly error: EdgeErrorBody["error"];
    }
  >;
  readonly readSupabaseEnv?: typeof readSupabaseEnv;
  readonly createRepository?: (
    serviceClient: EdgeSupabaseClient,
  ) => ContractRepository;
  readonly createRewardLedgerWriter?: (
    serviceClient: EdgeSupabaseClient,
  ) => ContractRewardLedgerWriter;
  readonly now?: () => string;
}

const CREATE_CONTRACT_STATUSES = ["draft", "scheduled", "active"] as const;
const PUBLISHABLE_CONTRACT_STATUSES = ["draft", "scheduled"] as const;
const REVIEW_ACTIONS = ["approve", "reject", "request_revision"] as const;

type ReviewAction = typeof REVIEW_ACTIONS[number];

export async function handleStaffContractRequest(
  request: Request,
  route: StaffContractRoute,
  dependencies: StaffContractHttpHandlerDependencies,
): Promise<Response> {
  if (
    route.kind === "contracts" &&
    request.method !== "GET" &&
    request.method !== "POST"
  ) {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET or POST for staff contracts.",
      retryable: false,
    });
  }

  if (route.kind === "publish" && request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to publish a contract.",
      retryable: false,
    });
  }

  if (route.kind === "progress" && request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to list contract progress.",
      retryable: false,
    });
  }

  if (route.kind === "review" && request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to review contract progress.",
      retryable: false,
    });
  }

  if (route.kind === "issueRewards" && request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to issue contract rewards.",
      retryable: false,
    });
  }

  try {
    const envResult = (dependencies.readSupabaseEnv ?? readSupabaseEnv)();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const staffResult = await dependencies.resolveStaffForRequest(
      request,
      envResult.value,
      {
        missingMessage:
          "A verified Supabase Auth user is required to manage contracts.",
      },
    );

    if (!staffResult.ok) {
      return jsonError(staffResult.status, staffResult.error);
    }

    const ownershipResult = await readOwnedGameSession(
      staffResult.serviceClient,
      route.gameSessionId,
      staffResult.staff.id,
    );

    if (!ownershipResult.ok) {
      return jsonError(ownershipResult.status, ownershipResult.error);
    }

    const repository = dependencies.createRepository
      ? dependencies.createRepository(staffResult.serviceClient)
      : new SupabaseContractRepository(staffResult.serviceClient);
    const now = dependencies.now ?? (() => new Date().toISOString());

    if (route.kind === "contracts" && request.method === "GET") {
      const filters = readListFilters(new URL(request.url));
      const contracts = await repository.listGameSessionContracts({
        gameSessionId: route.gameSessionId,
        statuses: filters.statuses,
        sourceTypes: filters.sourceTypes,
        visibility: filters.visibility,
      });

      return jsonResponse<StaffContractListResponseBody>(200, {
        ok: true,
        contracts: contracts.map(toStaffContractDto),
      });
    }

    if (route.kind === "contracts" && request.method === "POST") {
      const body = await readRequiredJsonObjectBody(request);
      const contract = await repository.createGameSessionContract(
        readCreateContractInput(
          route.gameSessionId,
          staffResult.staff.id,
          body,
        ),
      );

      return jsonResponse<StaffContractWriteResponseBody>(201, {
        ok: true,
        contract: toStaffContractDto(contract),
      });
    }

    if (route.kind === "publish" && request.method === "POST") {
      const body = await readOptionalJsonObjectBody(request);
      const existing = await repository.getGameSessionContractById({
        gameSessionId: route.gameSessionId,
        contractId: route.contractId,
      });

      if (!existing) {
        return jsonError(404, {
          code: "contract_not_found",
          message: "Contract was not found for this game session.",
          retryable: false,
        });
      }

      if (!isAllowedText(existing.status, PUBLISHABLE_CONTRACT_STATUSES)) {
        return jsonError(409, {
          code: "contract_not_publishable",
          message: "Only draft or scheduled contracts can be published.",
          retryable: false,
        });
      }

      const publishedAt = readOptionalIsoDateTimeText(
        body.publishedAt,
        "publishedAt",
      ) ?? now();
      const updated = await repository.updateGameSessionContractStatus({
        gameSessionId: route.gameSessionId,
        contractId: route.contractId,
        status: "active",
        publishedAt,
      });

      if (!updated) {
        return jsonError(404, {
          code: "contract_not_found",
          message: "Contract was not found for this game session.",
          retryable: false,
        });
      }

      return jsonResponse<StaffContractWriteResponseBody>(200, {
        ok: true,
        contract: toStaffContractDto(updated),
      });
    }

    if (route.kind === "progress" && request.method === "GET") {
      return await listStaffContractProgress(
        request,
        route.gameSessionId,
        route.contractId,
        repository,
      );
    }

    if (route.kind === "review" && request.method === "POST") {
      return await reviewStaffContractProgress(
        request,
        route.gameSessionId,
        route.contractId,
        route.progressId,
        repository,
        now(),
      );
    }

    if (route.kind === "issueRewards" && request.method === "POST") {
      const rewardLedgerWriter = dependencies.createRewardLedgerWriter
        ? dependencies.createRewardLedgerWriter(staffResult.serviceClient)
        : new ContractRewardLedgerRpcWriter(staffResult.serviceClient);

      return await issueStaffContractRewards({
        request,
        gameSessionId: route.gameSessionId,
        contractId: route.contractId,
        progressId: route.progressId,
        staffId: staffResult.staff.id,
        repository,
        rewardLedgerWriter,
        issuedAt: now(),
      });
    }

    return jsonError(405, {
      code: "method_not_allowed",
      message: "Contract method is not allowed.",
      retryable: false,
    });
  } catch (error) {
    return contractErrorToResponse(error);
  }
}

function readListFilters(url: URL): {
  readonly statuses?: readonly ContractStatus[];
  readonly sourceTypes?: readonly ContractSourceType[];
  readonly visibility?: ContractVisibility | null;
} {
  return {
    statuses: readEnumQueryValues(
      url.searchParams,
      "status",
      CONTRACT_STATUSES,
      "invalid_contract_status_filter",
    ),
    sourceTypes: readEnumQueryValues(
      url.searchParams,
      "sourceType",
      CONTRACT_SOURCE_TYPES,
      "invalid_contract_source_type_filter",
    ),
    visibility: readOptionalSingleEnumQueryValue(
      url.searchParams,
      "visibility",
      CONTRACT_VISIBILITIES,
      "invalid_contract_visibility_filter",
    ),
  };
}

function readCreateContractInput(
  gameSessionId: string,
  staffUserId: string,
  body: Record<string, unknown>,
): CreateGameSessionContractInput {
  if (hasOwn(body, "createdByStaffId")) {
    throw new EdgeActivationError(
      "created_by_staff_id_not_allowed",
      "createdByStaffId is derived from the staff session.",
      400,
    );
  }

  if (body.sourceType !== undefined && body.sourceType !== "teacher") {
    throw new EdgeActivationError(
      "source_type_not_allowed",
      "Teacher contract routes can only create teacher contracts.",
      400,
    );
  }

  const status = readOptionalCreateStatus(body.status);
  const parsed = parseGameSessionContractConfig({
    gameSessionId,
    contractTemplateId: null,
    contractKey: body.contractKey as string,
    sourceType: "teacher",
    sourceId: null,
    createdByStaffId: staffUserId,
    title: body.title as string,
    description: body.description as string,
    instructions: body.instructions as string,
    category: body.category as string | null | undefined,
    status,
    visibility: body.visibility as ContractVisibility | null | undefined,
    targetingPayload: body.targetingPayload as
      | CreateGameSessionContractInput["targetingPayload"]
      | undefined,
    requirementsPayload: body.requirementsPayload as
      | CreateGameSessionContractInput["requirementsPayload"]
      | undefined,
    rewardPayload: body.rewardPayload as
      | CreateGameSessionContractInput["rewardPayload"]
      | undefined,
    completionMode: body.completionMode as
      | ContractCompletionMode
      | null
      | undefined,
    publishedAt: body.publishedAt as string | null | undefined,
    deadlineAt: body.deadlineAt as string | null | undefined,
    expiresAt: body.expiresAt as string | null | undefined,
    metadata: body.metadata as CreateGameSessionContractInput["metadata"],
  });

  return {
    gameSessionId: parsed.gameSessionId,
    contractTemplateId: parsed.contractTemplateId,
    contractKey: parsed.contractKey,
    sourceType: parsed.sourceType,
    sourceId: parsed.sourceId,
    createdByStaffId: parsed.createdByStaffId,
    title: parsed.title,
    description: parsed.description,
    instructions: parsed.instructions,
    category: parsed.category,
    status: parsed.status,
    visibility: parsed.visibility,
    targetingPayload: parsed.targetingPayload,
    requirementsPayload: parsed.requirementsPayload,
    rewardPayload: parsed.rewardPayload,
    completionMode: parsed.completionMode,
    publishedAt: parsed.publishedAt,
    deadlineAt: parsed.deadlineAt,
    expiresAt: parsed.expiresAt,
    metadata: parsed.metadata,
  };
}

async function listStaffContractProgress(
  request: Request,
  gameSessionId: string,
  contractId: string,
  repository: ContractRepository,
): Promise<Response> {
  const contract = await readRequiredContract(
    repository,
    gameSessionId,
    contractId,
  );
  const filters = readProgressListFilters(new URL(request.url));
  const progress = await repository.listContractProgressForStaff({
    gameSessionId,
    contractId,
    statuses: filters.statuses,
    playerId: filters.playerId,
  });

  return jsonResponse<StaffContractProgressListResponseBody>(200, {
    ok: true,
    contract: toStaffContractSummaryDto(contract),
    progress: progress.map(toPlayerContractProgressDto),
  });
}

async function reviewStaffContractProgress(
  request: Request,
  gameSessionId: string,
  contractId: string,
  progressId: string,
  repository: ContractRepository,
  reviewedAt: string,
): Promise<Response> {
  const body = await readRequiredJsonObjectBody(request);
  rejectClientSuppliedReviewAuthority(body);

  if (body.issueRewardNow === true) {
    throw new EdgeActivationError(
      "issue_reward_now_not_supported",
      "Use the contract rewards issue route after approving progress.",
      400,
    );
  }

  const action = readReviewAction(body.action);
  const resultPayload = readOptionalJsonObject(
    body.resultPayload,
    "resultPayload",
  );
  const [contract, existingProgress] = await Promise.all([
    readRequiredContract(repository, gameSessionId, contractId),
    repository.getContractProgressById({
      gameSessionId,
      contractId,
      progressId,
    }),
  ]);

  if (!existingProgress) {
    return jsonError(404, {
      code: "contract_progress_not_found",
      message: "Contract progress was not found for this contract.",
      retryable: false,
    });
  }

  if (existingProgress.rewardIssuedAt !== null) {
    return jsonError(409, {
      code: "contract_reward_already_issued",
      message: "Contract progress cannot be reviewed after rewards are issued.",
      retryable: false,
    });
  }

  const updated = await repository.reviewPlayerContractProgress({
    gameSessionId,
    contractId,
    progressId,
    status: reviewActionToStatus(action),
    resultPayload,
    completedAt: action === "approve" ? reviewedAt : undefined,
  });

  if (!updated) {
    return jsonError(404, {
      code: "contract_progress_not_found",
      message: "Contract progress was not found for this contract.",
      retryable: false,
    });
  }

  return jsonResponse<StaffContractProgressReviewResponseBody>(200, {
    ok: true,
    contract: toStaffContractSummaryDto(contract),
    progress: toPlayerContractProgressDto(updated),
  });
}

async function issueStaffContractRewards(input: {
  readonly request: Request;
  readonly gameSessionId: string;
  readonly contractId: string;
  readonly progressId: string;
  readonly staffId: string;
  readonly repository: ContractRepository;
  readonly rewardLedgerWriter: ContractRewardLedgerWriter;
  readonly issuedAt: string;
}): Promise<Response> {
  const [contract, progress] = await Promise.all([
    readRequiredContract(
      input.repository,
      input.gameSessionId,
      input.contractId,
    ),
    input.repository.getContractProgressById({
      gameSessionId: input.gameSessionId,
      contractId: input.contractId,
      progressId: input.progressId,
    }),
  ]);

  if (!progress) {
    return jsonError(404, {
      code: "contract_progress_not_found",
      message: "Contract progress was not found for this contract.",
      retryable: false,
    });
  }

  if (progress.rewardIssuedAt !== null) {
    return rewardIssueResponse({
      rewardIssued: false,
      alreadyIssued: true,
      contract,
      progress,
      rewardResult: alreadyIssuedRewardResult(),
    });
  }

  if (progress.status !== "completed") {
    return jsonError(409, {
      code: "contract_progress_not_completed",
      message: "Only completed contract progress can receive rewards.",
      retryable: false,
    });
  }

  const rewardResult = await issueContractRewards({
    gameSessionId: input.gameSessionId,
    contractId: input.contractId,
    progressId: input.progressId,
    playerId: progress.playerId,
    rewardPayload: contract.rewardPayload,
    issuedAt: input.issuedAt,
    staffId: input.staffId,
    requestId: buildContractRewardIdempotencyKey({
      gameSessionId: input.gameSessionId,
      contractId: input.contractId,
      progressId: input.progressId,
    }),
    ledger: input.rewardLedgerWriter,
  });

  if (!rewardResult.ok) {
    return jsonError(
      rewardResult.code === "contract_reward_issue_failed" ? 500 : 400,
      {
        code: rewardResult.code,
        message: rewardResult.message,
        retryable: false,
      },
    );
  }

  const updatedProgress = await input.repository.markContractRewardIssued({
    gameSessionId: input.gameSessionId,
    contractId: input.contractId,
    progressId: input.progressId,
    rewardIssuedAt: input.issuedAt,
  });

  if (!updatedProgress) {
    const latestProgress = await input.repository.getContractProgressById({
      gameSessionId: input.gameSessionId,
      contractId: input.contractId,
      progressId: input.progressId,
    });

    if (latestProgress && latestProgress.rewardIssuedAt !== null) {
      return rewardIssueResponse({
        rewardIssued: false,
        alreadyIssued: true,
        contract,
        progress: latestProgress,
        rewardResult: alreadyIssuedRewardResult(),
      });
    }

    return jsonError(409, {
      code: "contract_reward_mark_failed",
      message: "Contract reward was issued but progress could not be marked.",
      retryable: false,
    });
  }

  return rewardIssueResponse({
    rewardIssued: true,
    alreadyIssued: false,
    contract,
    progress: updatedProgress,
    rewardResult: rewardResult.rewardResult,
  });
}

function buildContractRewardIdempotencyKey(input: {
  readonly gameSessionId: string;
  readonly contractId: string;
  readonly progressId: string;
}): string {
  return [
    "contract_reward",
    input.gameSessionId,
    input.contractId,
    input.progressId,
  ].join(":");
}

function rewardIssueResponse(input: {
  readonly rewardIssued: boolean;
  readonly alreadyIssued: boolean;
  readonly contract: GameSessionContractRecord;
  readonly progress: PlayerContractProgressRecord;
  readonly rewardResult: unknown;
}): Response {
  return jsonResponse<StaffContractRewardIssueResponseBody>(200, {
    ok: true,
    rewardIssued: input.rewardIssued,
    alreadyIssued: input.alreadyIssued,
    contract: toStaffContractSummaryDto(input.contract),
    progress: toPlayerContractProgressDto(input.progress),
    rewardResult: input.rewardResult as Record<string, unknown>,
  });
}

async function readRequiredContract(
  repository: ContractRepository,
  gameSessionId: string,
  contractId: string,
): Promise<GameSessionContractRecord> {
  const contract = await repository.getGameSessionContractById({
    gameSessionId,
    contractId,
  });

  if (!contract) {
    throw new EdgeActivationError(
      "contract_not_found",
      "Contract was not found for this game session.",
      404,
      false,
    );
  }

  return contract;
}

function readProgressListFilters(url: URL): {
  readonly statuses?: readonly PlayerContractStatus[];
  readonly playerId?: string | null;
} {
  return {
    statuses: readEnumQueryValues(
      url.searchParams,
      "status",
      PLAYER_CONTRACT_STATUSES,
      "invalid_contract_progress_status_filter",
    ),
    playerId: readOptionalPlayerIdFilter(url.searchParams),
  };
}

function readOptionalPlayerIdFilter(
  searchParams: URLSearchParams,
): string | null {
  const values = searchParams.getAll("playerId");

  if (values.length === 0) {
    return null;
  }

  if (values.length > 1) {
    throw new EdgeActivationError(
      "invalid_contract_progress_player_filter",
      "playerId query filter accepts one value.",
      400,
    );
  }

  const playerId = values[0]?.trim() ?? "";

  if (!playerId || !isUuid(playerId)) {
    throw new EdgeActivationError(
      "invalid_contract_progress_player_filter",
      "playerId query filter is invalid.",
      400,
    );
  }

  return playerId;
}

function rejectClientSuppliedReviewAuthority(
  body: Record<string, unknown>,
): void {
  for (
    const fieldName of [
      "staffId",
      "staffUserId",
      "reviewedByStaffId",
      "createdByStaffId",
    ]
  ) {
    if (fieldName in body) {
      throw new EdgeActivationError(
        "staff_id_not_allowed",
        "Review authority is derived from the staff session.",
        400,
      );
    }
  }
}

function readReviewAction(value: unknown): ReviewAction {
  if (isAllowedText(value, REVIEW_ACTIONS)) {
    return value;
  }

  throw new EdgeActivationError(
    "invalid_contract_review_action",
    "action must be approve, reject, or request_revision.",
    400,
  );
}

function reviewActionToStatus(action: ReviewAction): PlayerContractStatus {
  if (action === "approve") {
    return "completed";
  }

  if (action === "reject") {
    return "failed";
  }

  return "in_progress";
}

async function readRequiredJsonObjectBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const text = await request.text();

  if (!text.trim()) {
    throw new EdgeActivationError(
      "invalid_contract_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  return parseJsonObjectBody(text);
}

async function readOptionalJsonObjectBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const text = await request.text();

  if (!text.trim()) {
    return {};
  }

  return parseJsonObjectBody(text);
}

function parseJsonObjectBody(text: string): Record<string, unknown> {
  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch {
    throw new EdgeActivationError(
      "invalid_contract_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  if (!isRecord(value)) {
    throw new EdgeActivationError(
      "invalid_contract_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  return value;
}

function readOptionalJsonObject(
  value: unknown,
  fieldName: string,
): JsonObject {
  if (value === undefined || value === null) {
    return {};
  }

  if (!isRecord(value) || !isJsonValue(value)) {
    throw new EdgeActivationError(
      "invalid_contract_request",
      `${fieldName} must be a JSON object.`,
      400,
    );
  }

  return value as JsonObject;
}

function readEnumQueryValues<TAllowed extends readonly string[]>(
  searchParams: URLSearchParams,
  key: string,
  allowed: TAllowed,
  code: string,
): readonly TAllowed[number][] | undefined {
  const rawValues = searchParams.getAll(key);

  if (rawValues.length === 0) {
    return undefined;
  }

  const values = rawValues
    .flatMap((value) => value.split(","))
    .map((value) => value.trim());

  if (values.some((value) => value.length === 0)) {
    throw new EdgeActivationError(
      code,
      `${key} query filter is invalid.`,
      400,
    );
  }

  for (const value of values) {
    if (!allowed.includes(value)) {
      throw new EdgeActivationError(
        code,
        `${key} query filter is invalid.`,
        400,
      );
    }
  }

  return values as readonly TAllowed[number][];
}

function readOptionalSingleEnumQueryValue<TAllowed extends readonly string[]>(
  searchParams: URLSearchParams,
  key: string,
  allowed: TAllowed,
  code: string,
): TAllowed[number] | null {
  const values = readEnumQueryValues(searchParams, key, allowed, code);

  if (!values || values.length === 0) {
    return null;
  }

  if (values.length > 1) {
    throw new EdgeActivationError(
      code,
      `${key} query filter accepts one value.`,
      400,
    );
  }

  return values[0] ?? null;
}

function readOptionalCreateStatus(value: unknown): ContractStatus {
  if (value === undefined || value === null) {
    return "draft";
  }

  if (!isAllowedText(value, CREATE_CONTRACT_STATUSES)) {
    throw new EdgeActivationError(
      "invalid_contract_status",
      "status must be draft, scheduled, or active.",
      400,
    );
  }

  return value;
}

function readOptionalIsoDateTimeText(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const text = typeof value === "string" ? value.trim() : "";

  if (!text || Number.isNaN(Date.parse(text))) {
    throw new EdgeActivationError(
      "invalid_contract_request",
      `${fieldName} must be an ISO date string.`,
      400,
    );
  }

  return text;
}

function hasOwn(
  record: Record<string, unknown>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isAllowedText<TAllowed extends readonly string[]>(
  value: unknown,
  allowed: TAllowed,
): value is TAllowed[number] {
  return typeof value === "string" && allowed.includes(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return typeof value !== "number" || Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (isRecord(value)) {
    return Object.values(value).every(isJsonValue);
  }

  return false;
}

function contractErrorToResponse(error: unknown): Response {
  if (error instanceof EdgeActivationError) {
    return jsonError(error.status, {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    });
  }

  if (error instanceof ContractContractError) {
    return jsonError(400, {
      code: "invalid_contract_request",
      message: error.message,
      retryable: false,
    });
  }

  if (error instanceof ContractRepositoryError) {
    return jsonError(500, {
      code: error.code,
      message: "Contract request failed.",
      retryable: false,
    });
  }

  return jsonError(500, {
    code: "contract_request_failed",
    message: "Contract request failed.",
    retryable: false,
  });
}
