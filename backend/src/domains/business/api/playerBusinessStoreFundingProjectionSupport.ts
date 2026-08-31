import type { BusinessMoneyV1 } from "../contracts/businessTreasuryContracts.ts";
import {
  assertDecimalScale,
  type BusinessStoreResultRow,
  invalidBusinessStoreResult,
  readResultBoolean,
  readResultDecimal,
} from "./playerBusinessStoreProjectionSupport.ts";

const CURRENCY_CODE = /^[A-Z0-9_]{3,16}$/u;

export function assertFundingLines(
  lines: readonly {
    readonly lineNumber: number;
    readonly sourceAccountKey: string;
    readonly targetCurrencyCode: string;
    readonly targetPrecision: number;
    readonly targetContribution: BusinessMoneyV1;
  }[],
  targetAmount: BusinessMoneyV1,
): void {
  if (lines.length < 1 || lines.length > 3) {
    throw invalidBusinessStoreResult("funding lines");
  }
  if (
    lines.some(({ lineNumber }, index) => lineNumber !== index + 1) ||
    new Set(lines.map(({ sourceAccountKey }) => sourceAccountKey)).size !==
      lines.length ||
    lines.some((line) =>
      line.targetCurrencyCode !== targetAmount.currencyCode ||
      line.targetPrecision !== targetAmount.precision
    ) ||
    lines.reduce(
        (sum, line) =>
          sum +
          scaledDecimal(line.targetContribution.amount, targetAmount.precision),
        0n,
      ) !== scaledDecimal(targetAmount.amount, targetAmount.precision)
  ) throw invalidBusinessStoreResult("funding lines");
}

export function fundingMoney(
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

export function fundingRow(
  value: unknown,
  field: string,
): BusinessStoreResultRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidBusinessStoreResult(field);
  }
  return value as BusinessStoreResultRow;
}

export function fundingRows(
  value: unknown,
  field: string,
): BusinessStoreResultRow[] {
  if (
    !Array.isArray(value) ||
    value.some((candidate) =>
      !candidate || typeof candidate !== "object" || Array.isArray(candidate)
    )
  ) throw invalidBusinessStoreResult(field);
  return value as BusinessStoreResultRow[];
}

export function fundingFirst(
  row: BusinessStoreResultRow,
  ...keys: readonly string[]
): unknown {
  for (const key of keys) {
    if (Object.hasOwn(row, key)) return row[key];
  }
  return undefined;
}

export function fundingPublicKey(
  value: unknown,
  pattern: RegExp,
  field: string,
): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!pattern.test(result)) throw invalidBusinessStoreResult(field);
  return result;
}

export function fundingCurrency(value: unknown, field: string): string {
  const result = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!CURRENCY_CODE.test(result)) throw invalidBusinessStoreResult(field);
  return result;
}

export function fundingPrecision(value: unknown, field: string): number {
  if (
    typeof value !== "number" || !Number.isInteger(value) || value < 0 ||
    value > 18
  ) {
    throw invalidBusinessStoreResult(field);
  }
  return value;
}

export function fundingInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" || !Number.isSafeInteger(value) ||
    value < minimum || value > maximum
  ) throw invalidBusinessStoreResult(field);
  return value;
}

export function fundingToken(value: unknown, field: string): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    !result || result.length > 120 || !/^[a-z0-9][a-z0-9._:-]*$/u.test(result)
  ) {
    throw invalidBusinessStoreResult(field);
  }
  return result;
}

export function fundingText(
  value: unknown,
  field: string,
  maximum: number,
): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > maximum) {
    throw invalidBusinessStoreResult(field);
  }
  return result;
}

export function fundingTimestamp(value: unknown, field: string): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || !Number.isFinite(Date.parse(result))) {
    throw invalidBusinessStoreResult(field);
  }
  return new Date(result).toISOString();
}

export const fundingBoolean = readResultBoolean;

function scaledDecimal(amount: string, precision: number): bigint {
  const negative = amount.startsWith("-");
  const unsigned = negative ? amount.slice(1) : amount;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const scaled = BigInt(whole) * 10n ** BigInt(precision) +
    BigInt(fraction.padEnd(precision, "0") || "0");
  return negative ? -scaled : scaled;
}
