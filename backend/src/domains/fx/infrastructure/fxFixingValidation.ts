import {
  FX_NATIONAL_CURRENCY_DEFINITIONS,
  type FxCountryCode,
  type FxNationalCurrencyCode,
} from "../contracts/fxFixingContracts.ts";
import { FxFixingRunnerError } from "../services/fxFixingRunner.ts";

export interface SupabaseRpcError {
  readonly code?: string;
  readonly message: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

export interface SupabaseRpcResponse<T> {
  readonly data: T | null;
  readonly error: SupabaseRpcError | null;
}

const NATIONAL_CURRENCY_CODES = new Set<string>(
  FX_NATIONAL_CURRENCY_DEFINITIONS.map((value) => value.currencyCode),
);
const COUNTRY_CODES = new Set<string>(
  FX_NATIONAL_CURRENCY_DEFINITIONS.map((value) => value.countryCode),
);

export function firstRow(value: unknown): Record<string, unknown> {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!isRecord(candidate)) {
    throw invalidRpcResult("FX fixing RPC returned no result row.");
  }
  return candidate;
}

export function requiredUuid(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(text)
  ) {
    throw invalidRpcResult(`FX fixing ${field} is not a UUID.`);
  }
  return text;
}

export function requiredHash(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (!/^[0-9a-f]{64}$/.test(text)) {
    throw invalidRpcResult(`FX fixing ${field} is not a SHA-256 digest.`);
  }
  return text;
}

export function requiredLocalDate(value: unknown, field: string): string {
  const text = requiredText(value, field);
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== text
  ) {
    throw invalidRpcResult(`FX fixing ${field} is not a local date.`);
  }
  return text;
}

export function requiredTimestamp(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (!Number.isFinite(Date.parse(text))) {
    throw invalidRpcResult(`FX fixing ${field} is not a timestamp.`);
  }
  return text;
}

export function requiredTimezone(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (!/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(text)) {
    throw invalidRpcResult(`FX fixing ${field} is not a timezone name.`);
  }
  return text;
}

export function requiredCode(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(text)) {
    throw invalidRpcResult(`FX fixing ${field} is not a canonical code.`);
  }
  return text;
}

export function requiredNationalCurrencyCode(
  value: unknown,
  field: string,
): FxNationalCurrencyCode {
  const code = requiredCode(value, field);
  if (!NATIONAL_CURRENCY_CODES.has(code)) {
    throw invalidRpcResult(`FX fixing ${field} is not a national currency.`);
  }
  return code as FxNationalCurrencyCode;
}

export function requiredCountryCode(value: unknown, field: string): FxCountryCode {
  const code = requiredCode(value, field);
  if (!COUNTRY_CODES.has(code)) {
    throw invalidRpcResult(`FX fixing ${field} is not a canonical country.`);
  }
  return code as FxCountryCode;
}

export function requiredSafeId(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,191}$/.test(text)) {
    throw invalidRpcResult(`FX fixing ${field} is not a safe identifier.`);
  }
  return text;
}

export function requiredDecimalText(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) {
    throw invalidRpcResult(`FX fixing ${field} is not exact decimal text.`);
  }
  return text;
}

export function requiredInteger(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number)) {
    throw invalidRpcResult(`FX fixing ${field} is not an integer.`);
  }
  return number;
}

export function requiredNonNegativeInteger(value: unknown, field: string): number {
  const number = requiredInteger(value, field);
  if (number < 0) {
    throw invalidRpcResult(`FX fixing ${field} is negative.`);
  }
  return number;
}

export function requiredZero(value: unknown, field: string): 0 {
  if (requiredInteger(value, field) !== 0) {
    throw invalidRpcResult(`FX fixing ${field} must be zero.`);
  }
  return 0;
}

export function requiredCount(value: unknown, field: string): number {
  const number = requiredInteger(value, field);
  if (number < 0) {
    throw invalidRpcResult(`FX fixing ${field} is negative.`);
  }
  return number;
}

export function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw invalidRpcResult(`FX fixing ${field} is not text.`);
  }
  return value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function invalidRpcResult(message: string): FxFixingRunnerError {
  return new FxFixingRunnerError(
    "fx_fixing_rpc_result_invalid",
    message,
    500,
    false,
  );
}

export function mapRpcError(
  error: SupabaseRpcError,
  defaultCode: string,
): FxFixingRunnerError {
  const normalized = [error.message, error.details, error.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (
    error.code === "42P01" ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    normalized.includes("does not exist") ||
    normalized.includes("schema cache")
  ) {
    return new FxFixingRunnerError(
      "fx_fixing_schema_not_applied",
      "Canonical FX fixing schema is not available.",
      500,
      false,
    );
  }
  if (
    normalized.includes("fx_macro_snapshot_set_incomplete") ||
    normalized.includes("fx_fixing_input_incomplete") ||
    normalized.includes("fx_input_macro_cohort_incomplete") ||
    normalized.includes("fx_input_currency_mapping_incomplete")
  ) {
    return new FxFixingRunnerError(
      "fx_fixing_input_incomplete",
      "A complete macro snapshot set is not available for this fixing.",
      409,
      true,
    );
  }
  if (
    normalized.includes("fx_fixing_claim_stale") ||
    normalized.includes("fx_fixing_lease")
  ) {
    return new FxFixingRunnerError(
      "fx_fixing_claim_stale",
      "The FX fixing claim is no longer current.",
      409,
      true,
    );
  }
  if (
    error.code === "23505" ||
    normalized.includes("fx_input_hash_conflict") ||
    normalized.includes("fx_fixing_conflict")
  ) {
    return new FxFixingRunnerError(
      "fx_fixing_conflict",
      "The FX fixing conflicts with existing immutable evidence.",
      409,
      false,
    );
  }

  return new FxFixingRunnerError(
    defaultCode,
    "Canonical FX fixing persistence failed.",
    500,
    true,
  );
}
