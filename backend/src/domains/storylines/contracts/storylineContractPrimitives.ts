import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
import { invalidStorylineContract } from "./storylineContractErrors.ts";

export function readRecord(
  value: unknown,
  fieldName: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw invalidStorylineContract(`${fieldName} must be a JSON object.`);
  }

  return value;
}

export function readOptionalRecord(
  value: unknown,
  fieldName: string,
): Record<string, unknown> | null {
  if (value === undefined || value === null) {
    return null;
  }

  return readRecord(value, fieldName);
}

export function readRequiredText(
  value: unknown,
  fieldName: string,
): string {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    throw invalidStorylineContract(`${fieldName} is required.`);
  }

  return text;
}

export function readOptionalText(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    throw invalidStorylineContract(`${fieldName} must be non-empty text.`);
  }

  return text;
}

export function readOptionalTextWithDefault(
  value: unknown,
  fieldName: string,
  fallback: string,
): string {
  const text = readOptionalText(value, fieldName);

  return text ?? fallback;
}

export function readEnum<TAllowed extends readonly string[]>(
  value: unknown,
  fieldName: string,
  allowed: TAllowed,
): TAllowed[number] {
  const text = typeof value === "string" ? value.trim() : "";

  if (!allowed.includes(text)) {
    throw invalidStorylineContract(`${fieldName} is invalid.`);
  }

  return text as TAllowed[number];
}

export function readOptionalEnum<TAllowed extends readonly string[]>(
  value: unknown,
  fieldName: string,
  allowed: TAllowed,
  fallback: TAllowed[number],
): TAllowed[number] {
  if (value === undefined || value === null) {
    return fallback;
  }

  return readEnum(value, fieldName, allowed);
}

export function readBooleanWithDefault(
  value: unknown,
  fieldName: string,
  fallback: boolean,
): boolean {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value !== "boolean") {
    throw invalidStorylineContract(`${fieldName} must be a boolean.`);
  }

  return value;
}

export function readPositiveNumber(
  value: unknown,
  fieldName: string,
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw invalidStorylineContract(`${fieldName} must be a positive number.`);
  }

  return value;
}

export function readNonNegativeNumber(
  value: unknown,
  fieldName: string,
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw invalidStorylineContract(
      `${fieldName} must be a non-negative number.`,
    );
  }

  return value;
}

export function readPositiveInteger(
  value: unknown,
  fieldName: string,
): number {
  if (!Number.isInteger(value) || typeof value !== "number" || value <= 0) {
    throw invalidStorylineContract(`${fieldName} must be a positive integer.`);
  }

  return value;
}

export function readNonNegativeInteger(
  value: unknown,
  fieldName: string,
): number {
  if (!Number.isInteger(value) || typeof value !== "number" || value < 0) {
    throw invalidStorylineContract(
      `${fieldName} must be a non-negative integer.`,
    );
  }

  return value;
}

export function readOptionalPositiveInteger(
  value: unknown,
  fieldName: string,
): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  return readPositiveInteger(value, fieldName);
}

export function readOptionalNonNegativeInteger(
  value: unknown,
  fieldName: string,
): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  return readNonNegativeInteger(value, fieldName);
}

export function readPercentage(value: unknown, fieldName: string): number {
  const percent = readNonNegativeNumber(value, fieldName);

  if (percent > 100) {
    throw invalidStorylineContract(`${fieldName} must be between 0 and 100.`);
  }

  return percent;
}

export function readArray(
  value: unknown,
  fieldName: string,
): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw invalidStorylineContract(`${fieldName} must be an array.`);
  }

  return value;
}

export function readOptionalArray(
  value: unknown,
  fieldName: string,
): readonly unknown[] {
  if (value === undefined || value === null) {
    return [];
  }

  return readArray(value, fieldName);
}

export function readJsonObjectWithDefault(
  value: unknown,
  fieldName: string,
): JsonObject {
  if (value === undefined || value === null) {
    return {};
  }

  if (!isRecord(value) || !isJsonValue(value)) {
    throw invalidStorylineContract(`${fieldName} must be a JSON object.`);
  }

  return value as JsonObject;
}

export function readJsonValue(value: unknown, fieldName: string): JsonValue {
  if (!isJsonValue(value)) {
    throw invalidStorylineContract(`${fieldName} must be a JSON value.`);
  }

  return value;
}

export function readIsoDateTimeText(
  value: unknown,
  fieldName: string,
): string {
  const text = readRequiredText(value, fieldName);

  if (Number.isNaN(Date.parse(text))) {
    throw invalidStorylineContract(`${fieldName} must be an ISO date string.`);
  }

  return text;
}

export function readOptionalIsoDateTimeText(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return readIsoDateTimeText(value, fieldName);
}

export function isEmptyRecord(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length === 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
