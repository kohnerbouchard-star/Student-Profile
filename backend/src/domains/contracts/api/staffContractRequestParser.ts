/// <reference lib="dom" />
import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";
import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import { isUuid } from "../../../platform/supabase/uuid.ts";
import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
import {
  CONTRACT_SOURCE_TYPES,
  CONTRACT_STATUSES,
  CONTRACT_VISIBILITIES,
  type ContractSourceType,
  type ContractStatus,
  type ContractVisibility,
  PLAYER_CONTRACT_STATUSES,
  type PlayerContractStatus,
} from "../contracts/contractContracts.ts";
export { reviewActionToStatus };

const REVIEW_ACTIONS = ["approve", "reject", "request_revision"] as const;
type ReviewAction = typeof REVIEW_ACTIONS[number];

export function readListFilters(url: URL): {
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

export function readProgressListFilters(url: URL): {
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

export function rejectClientSuppliedReviewAuthority(
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

export function readReviewAction(value: unknown): ReviewAction {
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

export async function readRequiredJsonObjectBody(
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

export async function readOptionalJsonObjectBody(
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

export function readOptionalJsonObject(
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
