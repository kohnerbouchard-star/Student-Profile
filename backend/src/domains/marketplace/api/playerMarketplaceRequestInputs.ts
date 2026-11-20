/// <reference lib="dom" />

import {
  MARKETPLACE_IDEMPOTENCY_KEY_PATTERN,
  MARKETPLACE_ITEM_KEY_PATTERN,
  PlayerMarketplaceError,
} from "../contracts/playerMarketplaceContracts.ts";

const MAX_BODY_BYTES = 8192;
const CONDITIONS = new Set(["New", "Like New", "Used", "Damaged"]);

// Input decoding only: authentication, scope and dispatch remain in the handler.
export async function strictJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw invalid("Marketplace write requests must use application/json.");
  }
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw invalid("Marketplace request body is too large.");
  }
  let raw = "";
  try {
    raw = await request.text();
  } catch {
    throw invalid("Marketplace request body could not be read.");
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw invalid("Marketplace request body is too large.");
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw invalid("Marketplace request body must be valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw invalid("Marketplace request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
}

export function exactKeys(
  body: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  const keys = Object.keys(body);
  if (
    keys.some((key) => !allowedSet.has(key)) ||
    keys.length !== allowed.length
  ) {
    throw invalid("Marketplace request contains missing or unexpected fields.");
  }
}

export function itemKey(value: unknown): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!MARKETPLACE_ITEM_KEY_PATTERN.test(result)) {
    throw invalid("itemKey is invalid.");
  }
  return result;
}

export function idempotency(value: unknown): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!MARKETPLACE_IDEMPOTENCY_KEY_PATTERN.test(result)) {
    throw invalid("idempotencyKey is invalid.");
  }
  return result;
}

export function currency(value: unknown): string {
  const result = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{3,12}$/.test(result)) {
    throw invalid("currencyCode is invalid.");
  }
  return result;
}

export function condition(
  value: unknown,
): "New" | "Like New" | "Used" | "Damaged" {
  const result = typeof value === "string" ? value.trim() : "";
  if (!CONDITIONS.has(result)) throw invalid("condition is invalid.");
  return result as "New" | "Like New" | "Used" | "Damaged";
}

export function positiveInteger(value: unknown, field: string, max: number): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1 || result > max) {
    throw invalid(`${field} is invalid.`);
  }
  return result;
}

export function nullableInteger(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max) {
    throw invalid(`${field} is invalid.`);
  }
  return result;
}

export function positiveNumber(value: unknown, field: string, max: number): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0 || result > max) {
    throw invalid(`${field} is invalid.`);
  }
  return result;
}

export function boundedText(
  value: unknown,
  field: string,
  min: number,
  max: number,
): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < min || result.length > max) {
    throw invalid(`${field} is invalid.`);
  }
  return result;
}

export function invalid(message: string): PlayerMarketplaceError {
  return new PlayerMarketplaceError(
    "invalid_player_marketplace_request",
    message,
    400,
  );
}
