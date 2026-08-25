import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import {
  PLAYER_STORE_OFFER_KEY_PATTERN,
  PLAYER_STORE_OFFER_QUOTE_KEY_PATTERN,
} from "../contracts/playerStoreOfferPublicContracts.ts";
import {
  PLAYER_STORE_ITEM_KEY_PATTERN,
  PLAYER_STORE_QUOTE_KEY_PATTERN,
  PlayerStorePublicError,
} from "../contracts/playerStorePublicContracts.ts";
import type { PlayerStorePublicRoute } from "./playerStorePublicRoutePaths.ts";

const MAX_BODY_BYTES = 16_384;
const FORBIDDEN_SCOPE_HEADERS = [
  "x-econovaria-game-id",
  "x-econovaria-game-session-id",
  "x-game-session-id",
  "x-player-id",
  "x-player-session-id",
  "x-player-uuid",
  "x-stock-market-runner-secret",
] as const;

export function validatePlayerStorePublicRequestEnvelope(
  request: Request,
): void {
  const url = new URL(request.url);
  const queryKeys = [...url.searchParams.keys()];
  if (queryKeys.length) {
    throw invalidRequest(
      `Player Store routes do not accept query parameter: ${queryKeys[0]}.`,
    );
  }
  if (FORBIDDEN_SCOPE_HEADERS.some((name) => request.headers.has(name))) {
    throw invalidRequest(
      "Player Store ownership is derived from x-player-session-token.",
    );
  }
}

export async function readPlayerStorePublicRequestBody(
  request: Request,
): Promise<Record<string, unknown>> {
  return request.method === "GET"
    ? await readEmptyBody(request)
    : await readBody(request);
}

export function validatePlayerStorePublicMethodAndBody(
  route: PlayerStorePublicRoute,
  method: string,
  body: Record<string, unknown>,
): void {
  if (route.kind === "items") {
    if (method !== "GET") {
      throw methodNotAllowed("Use GET to load Store items.");
    }
    assertAllowedFields(body, []);
    return;
  }
  if (route.kind === "quotes") {
    if (method !== "POST") {
      throw methodNotAllowed("Use POST to create a Store quote.");
    }
    assertAllowedFields(body, ["itemKey", "quantity"]);
    return;
  }
  if (route.kind === "purchases") {
    if (method === "GET") {
      assertAllowedFields(body, []);
      return;
    }
    if (method !== "POST") {
      throw methodNotAllowed(
        "Use GET for purchase history or POST to complete a purchase.",
      );
    }
    assertAllowedFields(body, [
      "quoteKey",
      "idempotencyKey",
      "clientSubmittedAt",
    ]);
    return;
  }
  if (route.kind === "offerQuotes") {
    if (method !== "POST") {
      throw methodNotAllowed(
        "Use POST to create a Business Store offer quote.",
      );
    }
    assertAllowedFields(body, [
      "offerKey",
      "quantity",
      "expectedVersion",
      "idempotencyKey",
    ]);
    return;
  }
  if (route.kind === "offerPurchases") {
    if (method !== "POST") {
      throw methodNotAllowed(
        "Use POST to complete a Business Store offer purchase.",
      );
    }
    assertAllowedFields(body, [
      "offerKey",
      "quoteKey",
      "quantity",
      "expectedVersion",
      "idempotencyKey",
      "clientSubmittedAt",
    ]);
    return;
  }
  if (method !== "GET") {
    throw methodNotAllowed("Use GET to load a Business Store offer receipt.");
  }
  assertAllowedFields(body, []);
}

export function readPlayerStoreItemKey(value: unknown): string {
  const itemKey = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!PLAYER_STORE_ITEM_KEY_PATTERN.test(itemKey)) {
    throw invalidRequest(
      "itemKey must be 1 to 64 lowercase letters, numbers, underscores, or hyphens.",
    );
  }
  return itemKey;
}

export function readPlayerStoreQuoteKey(value: unknown): string {
  const quoteKey = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!PLAYER_STORE_QUOTE_KEY_PATTERN.test(quoteKey)) {
    throw invalidRequest("quoteKey is invalid.");
  }
  return quoteKey;
}

export function readPlayerStoreOfferKey(value: unknown): string {
  const offerKey = typeof value === "string" ? value.trim() : "";
  if (!PLAYER_STORE_OFFER_KEY_PATTERN.test(offerKey)) {
    throw invalidRequest("offerKey is invalid.");
  }
  return offerKey;
}

export function readPlayerStoreOfferQuoteKey(value: unknown): string {
  const quoteKey = typeof value === "string" ? value.trim() : "";
  if (!PLAYER_STORE_OFFER_QUOTE_KEY_PATTERN.test(quoteKey)) {
    throw invalidRequest("quoteKey is invalid.");
  }
  return quoteKey;
}

export function readPlayerStoreQuantity(value: unknown): number {
  const quantity = Number(value ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    throw invalidRequest("quantity must be an integer from 1 through 999.");
  }
  return quantity;
}

export function readPlayerStoreStrictQuantity(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 999
  ) {
    throw invalidRequest("quantity must be an integer from 1 through 999.");
  }
  return value;
}

export function readPlayerStoreExpectedVersion(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw invalidRequest("expectedVersion must be a positive safe integer.");
  }
  return value;
}

export function readPlayerStoreIdempotencyKey(value: unknown): string {
  const key = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9._:-]{8,160}$/u.test(key)) {
    throw invalidRequest("idempotencyKey must be 8 to 160 safe characters.");
  }
  return key;
}

export function readPlayerStoreOptionalTimestamp(
  value: unknown,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw invalidRequest(
      "clientSubmittedAt must be an ISO timestamp when provided.",
    );
  }
  return new Date(value).toISOString();
}

export function readPlayerStoreStrictOptionalTimestamp(
  value: unknown,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw invalidRequest(
      "clientSubmittedAt must be a canonical ISO timestamp when provided.",
    );
  }
  return value;
}

async function readEmptyBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim()) return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw invalidRequest("Request body must be valid JSON.");
  }
  if (!isRecord(value) || Object.keys(value).length > 0) {
    throw invalidRequest(
      "This Player Store read does not accept request fields.",
    );
  }
  return value;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    throw invalidRequest("Player Store request body is too large.");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw invalidRequest("Player Store request body is too large.");
  }
  let value: unknown;
  try {
    value = JSON.parse(text || "{}");
  } catch {
    throw invalidRequest("Request body must be valid JSON.");
  }
  if (!isRecord(value)) {
    throw invalidRequest("Request body must be a JSON object.");
  }
  return value;
}

function assertAllowedFields(
  body: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(body).find((key) => !allowedSet.has(key));
  if (unexpected) {
    throw invalidRequest(
      `Player Store request does not accept field: ${unexpected}.`,
    );
  }
}

function invalidRequest(message: string): PlayerStorePublicError {
  return new PlayerStorePublicError(
    "invalid_player_store_request",
    message,
    400,
    false,
  );
}

function methodNotAllowed(message: string): PlayerStorePublicError {
  return new PlayerStorePublicError("method_not_allowed", message, 405, false);
}
