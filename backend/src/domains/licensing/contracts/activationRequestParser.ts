import type { JsonObject } from "../../../supabase/tableTypes.ts";
import {
  normalizeRequiredStockMarketWindowSetting,
  StockMarketWindowConfigError,
} from "../../stocks/calendars/stockMarketWindowConfig.ts";
import type { LicensingActivationRequestBody } from "./activationContract.ts";

export type LicensingActivationRequestParseErrorCode =
  | "invalid_request_body"
  | "purchase_code_required"
  | "game_name_required"
  | "invalid_activation_settings";

export class LicensingActivationRequestParseError extends Error {
  readonly code: LicensingActivationRequestParseErrorCode;

  constructor(code: LicensingActivationRequestParseErrorCode, message: string) {
    super(message);
    this.name = "LicensingActivationRequestParseError";
    this.code = code;
  }
}

export function parseLicensingActivationRequestBody(
  value: unknown,
): LicensingActivationRequestBody {
  if (!isRecord(value)) {
    throw new LicensingActivationRequestParseError(
      "invalid_request_body",
      "Request body must be a JSON object.",
    );
  }

  const purchaseCode = parseRequiredText(value.purchaseCode, "purchase_code_required");
  const gameName = parseRequiredText(value.gameName, "game_name_required");

  return {
    purchaseCode,
    gameName,
    difficultyPreset: parseOptionalText(value.difficultyPreset),
    attendanceWindow: parseOptionalJsonObject(value.attendanceWindow),
    businessMarketWindow: parseOptionalJsonObject(value.businessMarketWindow),
    stockMarketWindow: parseRequiredStockMarketWindow(
      value.stockMarketWindow,
    ),
    newsSchedule: parseOptionalJsonObject(value.newsSchedule),
  };
}

function parseRequiredText(
  value: unknown,
  code: Extract<
    LicensingActivationRequestParseErrorCode,
    "purchase_code_required" | "game_name_required"
  >,
): string {
  const normalizedValue = typeof value === "string" ? value.trim() : "";

  if (!normalizedValue) {
    throw new LicensingActivationRequestParseError(
      code,
      code === "purchase_code_required"
        ? "purchaseCode is required."
        : "gameName is required.",
    );
  }

  return normalizedValue;
}

function parseOptionalText(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw invalidSettingsError();
  }

  const normalizedValue = value.trim();

  return normalizedValue || null;
}

function parseRequiredStockMarketWindow(value: unknown): JsonObject {
  try {
    return normalizeRequiredStockMarketWindowSetting(value) as JsonObject;
  } catch (error) {
    if (error instanceof StockMarketWindowConfigError) {
      throw new LicensingActivationRequestParseError(
        "invalid_activation_settings",
        error.message,
      );
    }
    throw error;
  }
}

function parseOptionalJsonObject(value: unknown): JsonObject | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (!isRecord(value) || Array.isArray(value)) {
    throw invalidSettingsError();
  }

  return value as JsonObject;
}

function invalidSettingsError(): LicensingActivationRequestParseError {
  return new LicensingActivationRequestParseError(
    "invalid_activation_settings",
    "Activation settings must use valid JSON object values.",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
