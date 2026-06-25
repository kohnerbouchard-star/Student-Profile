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
} from "../contracts/contractContracts.ts";
import { ContractContractError } from "../contracts/contractContractErrors.ts";
import {
  type StaffContractListResponseBody,
  type StaffContractWriteResponseBody,
  toStaffContractDto,
} from "../contracts/contractHttpContracts.ts";
import type {
  ContractRepository,
  CreateGameSessionContractInput,
} from "../contracts/contractRepositoryContracts.ts";
import { ContractRepositoryError } from "../contracts/contractRepositoryContracts.ts";
import { SupabaseContractRepository } from "../infrastructure/supabaseContractRepository.ts";
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
  readonly now?: () => string;
}

const CREATE_CONTRACT_STATUSES = ["draft", "scheduled", "active"] as const;
const PUBLISHABLE_CONTRACT_STATUSES = ["draft", "scheduled"] as const;

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
      ) ?? (dependencies.now ?? (() => new Date().toISOString()))();
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
