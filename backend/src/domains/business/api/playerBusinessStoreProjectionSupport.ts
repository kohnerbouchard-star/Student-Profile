import type { BusinessMoneyV1 } from "../contracts/businessTreasuryContracts.ts";
import { PlayerBusinessError } from "../contracts/playerBusinessContracts.ts";

export type BusinessStoreResultRow = Record<string, unknown>;

const PUBLIC_KEY = /^[a-z]{3}_[0-9a-f]{32}$/u;
const STORE_ITEM_KEY = /^[a-z0-9_-]{1,64}$/u;

export function readResultPublicKey(
  value: unknown,
  field: string,
  prefix: string,
): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!PUBLIC_KEY.test(result) || !result.startsWith(`${prefix}_`)) {
    throw invalidBusinessStoreResult(field);
  }
  return result;
}

export function readResultStoreItemKey(
  value: unknown,
  field: string,
): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!STORE_ITEM_KEY.test(result)) throw invalidBusinessStoreResult(field);
  return result;
}

export function readResultText(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < minimum || result.length > maximum) {
    throw invalidBusinessStoreResult(field);
  }
  return result;
}

export function readResultCode(
  value: unknown,
  field: string,
  pattern: RegExp,
): string {
  const result = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!pattern.test(result)) throw invalidBusinessStoreResult(field);
  return result;
}

export function readResultNumber(value: unknown, field: string): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) {
    throw invalidBusinessStoreResult(field);
  }
  return result;
}

export function readResultPrecision(value: unknown, field: string): number {
  if (
    typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 ||
    value > 18
  ) {
    throw invalidBusinessStoreResult(field);
  }
  return value;
}

export function readResultMoney(
  value: unknown,
  currencyCode: string,
  precision: number,
  field: string,
  positive = false,
): BusinessMoneyV1 {
  const amount = readResultDecimal(value, field, positive);
  assertDecimalScale(amount, precision, field);
  return Object.freeze({ amount, currencyCode, precision });
}

export function readResultDecimal(
  value: unknown,
  field: string,
  positive = false,
): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (
    !/^-?(?:0|[1-9][0-9]{0,29})(?:\.[0-9]{1,18})?$/u.test(result) ||
    (positive && (result.startsWith("-") || /^0(?:\.0+)?$/u.test(result)))
  ) throw invalidBusinessStoreResult(field);
  return result;
}

export function assertDecimalScale(
  amount: string,
  precision: number,
  field: string,
): void {
  const fraction = amount.split(".")[1] ?? "";
  if (fraction.length > precision) throw invalidBusinessStoreResult(field);
}

export function readResultInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const result = readResultNumber(value, field);
  if (!Number.isInteger(result) || result < minimum || result > maximum) {
    throw invalidBusinessStoreResult(field);
  }
  return result;
}

export function readResultBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw invalidBusinessStoreResult(field);
  return value;
}

export function nestedResult(
  row: BusinessStoreResultRow,
  key: string,
): BusinessStoreResultRow | null {
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as BusinessStoreResultRow
    : null;
}

export function firstResult(
  primary: BusinessStoreResultRow,
  secondary: BusinessStoreResultRow,
  ...keys: readonly string[]
): unknown {
  for (const key of keys) {
    if (Object.hasOwn(primary, key)) return primary[key];
    if (Object.hasOwn(secondary, key)) return secondary[key];
  }
  return undefined;
}

export function readResultReplay(
  envelope: BusinessStoreResultRow,
  payload: BusinessStoreResultRow,
  payloadField: string,
): boolean {
  if (typeof payload[payloadField] === "boolean") {
    return payload[payloadField] as boolean;
  }
  const outcome = typeof envelope.outcome === "string"
    ? envelope.outcome.trim().toLowerCase()
    : "";
  if (outcome === "applied") return false;
  if (outcome === "replayed") return true;
  throw invalidBusinessStoreResult(payloadField);
}

export function readResultTimestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length > 64) {
    throw invalidBusinessStoreResult(field);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw invalidBusinessStoreResult(field);
  }
  return parsed.toISOString();
}

export function assertPublicBusinessStoreResult(value: unknown): void {
  let serialized = "";
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw invalidBusinessStoreResult("funding response");
  }
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu
      .test(serialized)
  ) throw invalidBusinessStoreResult("funding response privacy");
}

export function invalidBusinessStoreResult(field: string): PlayerBusinessError {
  return new PlayerBusinessError(
    "business_store_result_invalid",
    `Business Store result field is invalid: ${field}.`,
    500,
  );
}
