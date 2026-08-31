import type { BusinessFundingAllocationV1 } from "../contracts/businessTreasuryContracts.ts";
import { PlayerBusinessError } from "../contracts/playerBusinessContracts.ts";

const PUBLIC_KEY = /^[a-z]{3}_[0-9a-f]{32}$/u;
const STORE_ITEM_KEY = /^[a-z0-9_-]{1,64}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,160}$/u;

export function readFundingAllocations(
  value: unknown,
): readonly BusinessFundingAllocationV1[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw invalidRequest("allocations must contain one to three accounts.");
  }
  const seen = new Set<string>();
  return Object.freeze(value.map((candidate, index) => {
    if (
      !candidate || typeof candidate !== "object" || Array.isArray(candidate)
    ) {
      throw invalidRequest(`allocations[${index}] must be an object.`);
    }
    const row = candidate as Record<string, unknown>;
    const fields = Object.keys(row).sort();
    if (
      JSON.stringify(fields) !== JSON.stringify([
        "sourceAccountKey",
        "targetAmount",
      ])
    ) {
      throw invalidRequest(
        `allocations[${index}] contains missing or unexpected fields.`,
      );
    }
    const sourceAccountKey = readPublicKey(
      row.sourceAccountKey,
      `allocations[${index}].sourceAccountKey`,
      "bac",
    );
    if (seen.has(sourceAccountKey)) {
      throw invalidRequest("allocations must use unique accounts.");
    }
    seen.add(sourceAccountKey);
    const isRemainder = index === value.length - 1;
    const targetAmount = isRemainder
      ? row.targetAmount === null ? null : undefined
      : canonicalPositiveDecimal(row.targetAmount) ?? undefined;
    if (targetAmount === undefined) {
      throw invalidRequest(
        isRemainder
          ? `allocations[${index}].targetAmount must be null for the server-derived remainder.`
          : `allocations[${index}].targetAmount must be a positive amount.`,
      );
    }
    return Object.freeze({ sourceAccountKey, targetAmount });
  }));
}

export function assertExactBodyFields(
  body: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  const unexpected = Object.keys(body).find((key) => !allowed.has(key));
  if (unexpected) {
    throw invalidRequest(`Unexpected request field: ${unexpected}.`);
  }
  const missing = required.find((key) => !Object.hasOwn(body, key));
  if (missing) {
    throw invalidRequest(`Required request field is missing: ${missing}.`);
  }
}

export function readStoreItemKey(value: unknown): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!STORE_ITEM_KEY.test(result)) {
    throw invalidRequest("itemKey is invalid.");
  }
  return result;
}

export function readPublicKey(
  value: unknown,
  field: string,
  prefix: string,
): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!PUBLIC_KEY.test(result) || !result.startsWith(`${prefix}_`)) {
    throw invalidRequest(`${field} is invalid.`);
  }
  return result;
}

export function readIdempotencyKey(value: unknown): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!IDEMPOTENCY_KEY.test(result)) {
    throw invalidRequest("idempotencyKey is invalid.");
  }
  return result;
}

export function readInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const result = Number(value);
  if (!Number.isInteger(result) || result < minimum || result > maximum) {
    throw invalidRequest(
      `${field} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

export function readOptionalTimestamp(
  value: unknown,
  field: string,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 64) {
    throw invalidRequest(`${field} must be an ISO timestamp.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw invalidRequest(`${field} must be an ISO timestamp.`);
  }
  return parsed.toISOString();
}

function canonicalPositiveDecimal(value: unknown): string | null {
  const result = typeof value === "string" ? value.trim() : "";
  if (!/^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/u.test(result)) {
    return null;
  }
  const [whole = "", fraction = ""] = result.split(".");
  const canonicalFraction = fraction.replace(/0+$/u, "");
  if (whole === "0" && canonicalFraction.length === 0) return null;
  return canonicalFraction ? `${whole}.${canonicalFraction}` : whole;
}

function invalidRequest(message: string): PlayerBusinessError {
  return new PlayerBusinessError(
    "invalid_business_store_request",
    message,
    400,
  );
}
