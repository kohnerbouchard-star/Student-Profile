/// <reference lib="dom" />

import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import {
  type PlayerInventoryRedemptionCommand,
  PlayerInventoryRedemptionError,
  type PlayerInventoryRedemptionListQuery,
  type PlayerInventoryRedemptionRoute,
} from "../contracts/playerInventoryRedemptionContracts.ts";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_BODY_BYTES = 4_096;
const STATUSES = new Set(["pending", "approved", "rejected", "fulfilled"]);
const SCOPE_HEADERS = [
  "x-econovaria-game-id",
  "x-econovaria-game-session-id",
  "x-stock-market-runner-secret",
] as const;

export async function parsePlayerInventoryRedemptionCommand(
  request: Request,
  route: PlayerInventoryRedemptionRoute,
): Promise<PlayerInventoryRedemptionCommand> {
  requireRoute(route, "request");
  rejectScopeHeaders(request);
  if (new URL(request.url).searchParams.size) {
    throw invalid(
      "Inventory redemption requests do not accept query parameters.",
    );
  }

  const text = await request.text();
  if (
    !text.trim() || new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES
  ) {
    throw invalid("Provide a valid inventory redemption JSON object.");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw invalid("Provide a valid inventory redemption JSON object.");
  }
  if (!isRecord(value)) throw invalid("Request body must be a JSON object.");

  const keys = Object.keys(value);
  if (
    keys.some((key) => !["quantity", "note", "idempotencyKey"].includes(key)) ||
    !keys.includes("quantity") || !keys.includes("idempotencyKey")
  ) {
    throw invalid("Only quantity, note, and idempotencyKey are accepted.");
  }
  if (
    !Number.isSafeInteger(value.quantity) || (value.quantity as number) < 1 ||
    (value.quantity as number) > 100
  ) {
    throw invalid("quantity must be an integer from 1 through 100.");
  }
  const idempotencyKey = typeof value.idempotencyKey === "string"
    ? value.idempotencyKey.trim()
    : "";
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw invalid("idempotencyKey must use 1 to 128 safe public characters.");
  }
  if (
    value.note !== undefined && value.note !== null &&
    typeof value.note !== "string"
  ) {
    throw invalid("note must be a string when provided.");
  }
  const note = typeof value.note === "string" ? value.note.trim() : "";
  if (note.length > 1000) {
    throw invalid("note must not exceed 1000 characters.");
  }

  return {
    quantity: value.quantity as number,
    note: note || null,
    idempotencyKey,
  };
}

export function parsePlayerInventoryRedemptionRead(
  request: Request,
  route: PlayerInventoryRedemptionRoute,
): PlayerInventoryRedemptionListQuery {
  if (route.kind !== "collection" && route.kind !== "item") {
    throw invalid("Inventory redemption path is malformed.");
  }
  rejectScopeHeaders(request);
  const url = new URL(request.url);
  if (route.kind === "item") {
    if (url.searchParams.size) {
      throw invalid("Redemption status reads do not accept query parameters.");
    }
    return { status: null, limit: 1, offset: 0 };
  }

  const queryKeys: string[] = [];
  url.searchParams.forEach((_value, key) => queryKeys.push(key));
  for (const key of queryKeys) {
    if (
      !["status", "limit", "offset"].includes(key) ||
      url.searchParams.getAll(key).length !== 1
    ) {
      throw invalid(`Unsupported or repeated query parameter: ${key}.`);
    }
  }
  const statusText = url.searchParams.get("status")?.trim().toLowerCase() ?? "";
  if (statusText && !STATUSES.has(statusText)) {
    throw invalid("Redemption status filter is invalid.");
  }
  const limit = readInteger(url.searchParams.get("limit"), 25, 1, 50, "limit");
  const offset = readInteger(
    url.searchParams.get("offset"),
    0,
    0,
    10000,
    "offset",
  );
  return {
    status: statusText
      ? statusText as PlayerInventoryRedemptionListQuery["status"]
      : null,
    limit,
    offset,
  };
}

function rejectScopeHeaders(request: Request): void {
  if (SCOPE_HEADERS.some((header) => request.headers.has(header))) {
    throw invalid(
      "Inventory redemption scope derives only from the authenticated player session.",
    );
  }
}

function requireRoute(
  route: PlayerInventoryRedemptionRoute,
  kind: PlayerInventoryRedemptionRoute["kind"],
): void {
  if (route.kind !== kind) {
    throw invalid("Inventory redemption path is malformed.");
  }
}

function readInteger(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
  name: string,
): number {
  if (value === null) return fallback;
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw invalid(`${name} is invalid.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw invalid(`${name} is invalid.`);
  }
  return number;
}

function invalid(message: string): PlayerInventoryRedemptionError {
  return new PlayerInventoryRedemptionError(
    "invalid_player_inventory_redemption_request",
    message,
    400,
    false,
  );
}
