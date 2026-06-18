import { EdgeActivationError } from "./edgeResponse.ts";

export function parseRequiredText(
  value: unknown,
  code: string,
  message: string,
): string {
  const normalizedValue = typeof value === "string" ? value.trim() : "";

  if (!normalizedValue) {
    throw new EdgeActivationError(code, message, 400);
  }

  return normalizedValue;
}

export function readBalanceNumber(value: number | string): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseOptionalText(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw invalidActivationSettingsError();
  }

  const normalizedValue = value.trim();

  return normalizedValue || null;
}

export function parseOptionalJsonObject(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (!isRecord(value)) {
    throw invalidActivationSettingsError();
  }

  return value;
}

function invalidActivationSettingsError(): EdgeActivationError {
  return new EdgeActivationError(
    "invalid_activation_settings",
    "Activation settings must use valid JSON object values.",
    400,
  );
}
