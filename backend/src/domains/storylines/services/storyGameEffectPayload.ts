import type { JsonObject } from "../../../supabase/tableTypes.ts";

const OFFICIAL_CURRENCY_CODES = new Set([
  "ECO",
  "NRC",
  "YRC",
  "THD",
  "SLV",
  "ELD",
  "VAL",
  "LUM",
  "SYN",
  "XAL",
  "DRV",
]);

export function readRequiredTextPayload(
  payload: JsonObject,
  key: string,
  effectType: string,
): string {
  const value = payload[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${effectType} payload ${key} must be a non-empty string.`);
  }

  return value.trim();
}

export function readStringArrayPayload(
  payload: JsonObject,
  key: string,
  effectType: string,
  pattern: RegExp,
  maxItems: number,
): readonly string[] {
  const value = payload[key];
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > maxItems ||
    value.some((item) => typeof item !== "string" || !pattern.test(item))
  ) {
    throw new Error(`${effectType} payload ${key} is invalid.`);
  }

  const unique = [...new Set(value as string[])];
  if (unique.length !== value.length) {
    throw new Error(`${effectType} payload ${key} contains duplicates.`);
  }
  return Object.freeze(unique);
}

export function readEnumTextPayload<const T extends readonly string[]>(
  payload: JsonObject,
  key: string,
  effectType: string,
  values: T,
): T[number] {
  const value = payload[key];
  if (typeof value !== "string" || !values.includes(value)) {
    throw new Error(`${effectType} payload ${key} is invalid.`);
  }
  return value as T[number];
}

export function readIntegerPayload(
  payload: JsonObject,
  key: string,
  effectType: string,
  minimum: number,
  maximum: number,
): number {
  const value = payload[key];
  if (
    !Number.isInteger(value) || Number(value) < minimum ||
    Number(value) > maximum
  ) {
    throw new Error(`${effectType} payload ${key} is invalid.`);
  }
  return Number(value);
}

export function readCurrencyAdjustments(payload: JsonObject): JsonObject {
  const value = payload.adjustmentsBasisPoints;
  if (!isJsonObject(value)) {
    throw new Error(
      "currency_volatility payload adjustmentsBasisPoints must be a JSON object.",
    );
  }

  let hasNonzero = false;
  const result: Record<string, number> = {};
  for (const [currencyCode, basisPoints] of Object.entries(value)) {
    if (
      !OFFICIAL_CURRENCY_CODES.has(currencyCode) ||
      !Number.isInteger(basisPoints) ||
      Number(basisPoints) < -1500 ||
      Number(basisPoints) > 1500
    ) {
      throw new Error(
        "currency_volatility adjustments must use official currency codes and integer basis points between -1500 and 1500.",
      );
    }
    if (currencyCode === "ECO" && basisPoints !== 0) {
      throw new Error(
        "currency_volatility keeps ECO as the zero-adjustment numeraire.",
      );
    }
    hasNonzero ||= Number(basisPoints) !== 0;
    result[currencyCode] = Number(basisPoints);
  }

  if (!hasNonzero) {
    throw new Error(
      "currency_volatility requires at least one nonzero adjustment.",
    );
  }

  return Object.freeze(result);
}

function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}
