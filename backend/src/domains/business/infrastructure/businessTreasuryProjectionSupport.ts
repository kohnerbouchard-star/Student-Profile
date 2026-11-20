import {
  type BusinessMoneyV1,
  BusinessTreasuryError,
  type BusinessTreasuryFxProductV1,
  type BusinessTreasuryMutationResultV1,
} from "../contracts/businessTreasuryContracts.ts";

export type BusinessTreasuryRow = Record<string, unknown>;

const UUID_ANY =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;

export function mutation<T>(
  value: unknown,
  nestedKeys: readonly string[],
  project: (row: BusinessTreasuryRow) => T,
  label: string,
): BusinessTreasuryMutationResultV1<T> {
  assertNoInternalUuid(value);
  const root = oneRow(value, label);
  const nested = nestedRow(root, nestedKeys) ?? root;
  const rawOutcome = String(first(root, "outcome", "result") ?? "")
    .trim().toLowerCase();
  const replayFlag = first(root, "replayed", "is_replay", "isReplay");
  if (
    (rawOutcome !== "applied" && rawOutcome !== "replayed") ||
    (replayFlag !== undefined && typeof replayFlag !== "boolean") ||
    (rawOutcome === "applied" && replayFlag === true) ||
    (rawOutcome === "replayed" && replayFlag === false)
  ) invalidTreasuryResult(`${label} outcome`);
  return Object.freeze({
    outcome: rawOutcome,
    value: project(nested),
  });
}

export function money(
  value: unknown,
  currencyCode: string,
  precision: number,
  label: string,
  positive = false,
): BusinessMoneyV1 {
  const amount = decimal(value, label, positive);
  const scale = amount.split(".")[1]?.length ?? 0;
  if (scale > precision) invalidTreasuryResult(label);
  return Object.freeze({ amount, currencyCode, precision });
}

export function oneRow(
  value: unknown,
  label: string,
): BusinessTreasuryRow {
  const candidate = Array.isArray(value)
    ? value.length === 1 ? value[0] : null
    : value;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    invalidTreasuryResult(label);
  }
  return candidate as BusinessTreasuryRow;
}

export function nestedRow(
  row: BusinessTreasuryRow,
  keys: readonly string[],
): BusinessTreasuryRow | null {
  const value = first(row, ...keys);
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as BusinessTreasuryRow
    : null;
}

export function rows(value: unknown, label: string): BusinessTreasuryRow[] {
  if (
    !Array.isArray(value) ||
    value.some((candidate) =>
      !candidate || typeof candidate !== "object" || Array.isArray(candidate)
    )
  ) invalidTreasuryResult(label);
  return value as BusinessTreasuryRow[];
}

export function first(
  row: BusinessTreasuryRow,
  ...keys: readonly string[]
): unknown {
  for (const key of keys) {
    if (Object.hasOwn(row, key)) return row[key];
  }
  return undefined;
}

export function publicKey(
  value: unknown,
  pattern: RegExp,
  label: string,
): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!pattern.test(result)) invalidTreasuryResult(label);
  return result;
}

export function currency(value: unknown, label: string): string {
  const result = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z0-9_]{3,16}$/u.test(result)) invalidTreasuryResult(label);
  return result;
}

export function minorUnit(value: unknown, label: string): number {
  if (
    typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 ||
    value > 18
  ) invalidTreasuryResult(label);
  return value;
}

export function decimal(
  value: unknown,
  label: string,
  positive = false,
): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (
    !/^-?(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/u.test(result) ||
    (positive && (result.startsWith("-") || /^0(?:\.0+)?$/u.test(result)))
  ) invalidTreasuryResult(label);
  return result;
}

export function product(value: unknown): BusinessTreasuryFxProductV1 {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (result !== "standard" && result !== "instant") {
    invalidTreasuryResult("FX product");
  }
  return result;
}

export function token(
  value: unknown,
  label: string,
  maximum: number,
): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    !result || result.length > maximum ||
    !/^[a-z0-9][a-z0-9._:-]*$/u.test(result)
  ) invalidTreasuryResult(label);
  return result;
}

export function text(value: unknown, label: string, maximum: number): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > maximum) invalidTreasuryResult(label);
  return result;
}

export function iso(value: unknown, label: string): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || !Number.isFinite(Date.parse(result))) {
    invalidTreasuryResult(label);
  }
  return new Date(result).toISOString();
}

export function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") invalidTreasuryResult(label);
  return value;
}

export function assertNoInternalUuid(value: unknown): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    invalidTreasuryResult("public response");
  }
  if (UUID_ANY.test(serialized!)) {
    invalidTreasuryResult("public response privacy");
  }
}

export function invalidTreasuryResult(label: string): never {
  throw new BusinessTreasuryError(
    "business_treasury_result_invalid",
    `${label} returned an invalid result.`,
    503,
    true,
  );
}
