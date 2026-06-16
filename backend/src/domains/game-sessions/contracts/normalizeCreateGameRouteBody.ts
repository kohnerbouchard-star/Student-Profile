import type { JsonObject } from "../../../supabase/tableTypes";
import type { NormalizedCreateGameRouteBody } from "./createGameRouteContracts";

export class CreateGameRouteValidationError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CreateGameRouteValidationError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function normalizeCreateGameRouteBody(
  body: unknown,
): NormalizedCreateGameRouteBody {
  if (!isRecord(body)) {
    throw new CreateGameRouteValidationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
    );
  }

  return {
    name: normalizeRequiredString(body.name, "name"),
    difficultyPreset: normalizeOptionalString(
      body.difficultyPreset,
      "difficultyPreset",
    ),
    attendanceWindow: normalizeOptionalJsonObject(
      body.attendanceWindow,
      "attendanceWindow",
    ),
    businessMarketWindow: normalizeOptionalJsonObject(
      body.businessMarketWindow,
      "businessMarketWindow",
    ),
    stockMarketWindow: normalizeOptionalJsonObject(
      body.stockMarketWindow,
      "stockMarketWindow",
    ),
    newsSchedule: normalizeOptionalJsonObject(body.newsSchedule, "newsSchedule"),
  };
}

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new CreateGameRouteValidationError(
      "invalid_request_body",
      `${fieldName} must be a string.`,
      400,
      { fieldName },
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new CreateGameRouteValidationError(
      "invalid_request_body",
      `${fieldName} is required.`,
      400,
      { fieldName },
    );
  }

  return normalizedValue;
}

function normalizeOptionalString(
  value: unknown,
  fieldName: string,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new CreateGameRouteValidationError(
      "invalid_request_body",
      `${fieldName} must be a string when provided.`,
      400,
      { fieldName },
    );
  }

  return value.trim() || undefined;
}

function normalizeOptionalJsonObject(
  value: unknown,
  fieldName: string,
): JsonObject | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new CreateGameRouteValidationError(
      "invalid_request_body",
      `${fieldName} must be a JSON object when provided.`,
      400,
      { fieldName },
    );
  }

  return value as JsonObject;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
