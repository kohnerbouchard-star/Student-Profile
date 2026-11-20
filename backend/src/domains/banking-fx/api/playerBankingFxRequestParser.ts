/// <reference lib="dom" />

import {
  PLAYER_BANK_ACCOUNT_KEY_PATTERN,
  PLAYER_BANKING_FX_CURSOR_PATTERN,
  PLAYER_BANKING_FX_IDEMPOTENCY_KEY_PATTERN,
  PLAYER_FX_FIXING_KEY_PATTERN,
  PLAYER_FX_ORDER_KEY_PATTERN,
  PLAYER_FX_QUOTE_KEY_PATTERN,
  PlayerBankingFxError,
  type PlayerBankingFxHistoryRange,
  type PlayerBankingFxOrderFilter,
  type PlayerBankingFxProduct,
  type PlayerBankingFxRoute,
} from "../contracts/playerBankingFxContracts.ts";

const MAX_BODY_BYTES = 8_192;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const FORBIDDEN_SCOPE_HEADERS = [
  "x-econovaria-game-id",
  "x-econovaria-game-session-id",
  "x-game-session-id",
  "x-player-id",
  "x-player-session-id",
  "x-player-uuid",
] as const;

export interface ParsedPlayerBankingFxHistoryQuery {
  readonly sourceCurrencyCode: string;
  readonly targetCurrencyCode: string;
  readonly range: PlayerBankingFxHistoryRange;
  readonly limit: number;
  readonly cursor: string | null;
  readonly beforeAt: string | null;
  readonly beforeKey: string | null;
}

export interface ParsedPlayerBankingFxOrdersQuery {
  readonly status: PlayerBankingFxOrderFilter;
  readonly limit: number;
  readonly cursor: string | null;
  readonly beforeAt: string | null;
  readonly beforeKey: string | null;
}

export type ParsedPlayerBankingFxQuery =
  | ParsedPlayerBankingFxHistoryQuery
  | ParsedPlayerBankingFxOrdersQuery
  | null;

export function validatePlayerBankingFxRouteAndMethod(
  route: PlayerBankingFxRoute,
  method: string,
): void {
  if (route.kind === "malformed") {
    throw invalid("Player FX route is malformed.");
  }
  const expected = ["overview", "history", "orders"].includes(route.kind)
    ? "GET"
    : "POST";
  if (method !== expected) {
    throw new PlayerBankingFxError(
      "method_not_allowed",
      `Use ${expected} for this Player FX route.`,
      405,
    );
  }
}

export function validatePlayerBankingFxHeaders(request: Request): void {
  if (request.headers.has("x-stock-market-runner-secret")) {
    throw invalid("Player FX requests must not send a runner secret.");
  }
  if (FORBIDDEN_SCOPE_HEADERS.some((header) => request.headers.has(header))) {
    throw invalid(
      "Player FX ownership is derived from x-player-session-token.",
    );
  }
}

export function parsePlayerBankingFxQuery(
  request: Request,
  route: PlayerBankingFxRoute,
): ParsedPlayerBankingFxQuery {
  const search = new URL(request.url).searchParams;
  if (route.kind === "history") {
    exactQueryKeys(search, [
      "sourceCurrencyCode",
      "targetCurrencyCode",
      "range",
      "limit",
      "cursor",
    ]);
    const sourceCurrencyCode = currency(
      requiredQuery(search, "sourceCurrencyCode"),
      "sourceCurrencyCode",
    );
    const targetCurrencyCode = currency(
      requiredQuery(search, "targetCurrencyCode"),
      "targetCurrencyCode",
    );
    const rangeValue = optionalQuery(search, "range") ?? "7d";
    if (!["7d", "30d", "game"].includes(rangeValue)) {
      throw invalid("range must be 7d, 30d, or game.");
    }
    const pageCursor = keysetCursor(
      optionalQuery(search, "cursor"),
      PLAYER_FX_FIXING_KEY_PATTERN,
    );
    return {
      sourceCurrencyCode,
      targetCurrencyCode,
      range: rangeValue as PlayerBankingFxHistoryRange,
      limit: limit(optionalQuery(search, "limit")),
      ...pageCursor,
    };
  }
  if (route.kind === "orders") {
    exactQueryKeys(search, ["status", "limit", "cursor"]);
    const statusValue = (optionalQuery(search, "status") ?? "all")
      .toLowerCase();
    if (!["all", "pending", "completed"].includes(statusValue)) {
      throw invalid("status must be all, pending, or completed.");
    }
    const pageCursor = keysetCursor(
      optionalQuery(search, "cursor"),
      PLAYER_FX_ORDER_KEY_PATTERN,
    );
    return {
      status: statusValue as PlayerBankingFxOrderFilter,
      limit: limit(optionalQuery(search, "limit")),
      ...pageCursor,
    };
  }
  if ([...search.keys()].length > 0) {
    throw invalid("This Player FX route does not accept query parameters.");
  }
  return null;
}

export async function readPlayerBankingFxBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  if (request.method === "GET") {
    if ((await request.text()).trim()) {
      throw invalid("Player FX reads do not accept a request body.");
    }
    return null;
  }
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw invalid("Player FX writes must use application/json.");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw invalid("Player FX request body is too large.");
  }
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    throw invalid("Player FX request body could not be read.");
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw invalid("Player FX request body is too large.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalid("Player FX request body must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw invalid("Player FX request body must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

export function parsePlayerBankingFxQuoteBody(
  body: Record<string, unknown> | null,
): {
  readonly sourceAccountKey: string;
  readonly targetCurrencyCode: string;
  readonly sourceAmount: string;
  readonly product: PlayerBankingFxProduct;
  readonly idempotencyKey: string;
} {
  const value = requiredBody(body);
  exactBodyKeys(value, [
    "sourceAccountKey",
    "targetCurrencyCode",
    "sourceAmount",
    "product",
    "idempotencyKey",
  ]);
  const sourceAccountKey = typeof value.sourceAccountKey === "string"
    ? value.sourceAccountKey.trim().toLowerCase()
    : "";
  if (!PLAYER_BANK_ACCOUNT_KEY_PATTERN.test(sourceAccountKey)) {
    throw invalid("sourceAccountKey is invalid.");
  }
  const productValue = typeof value.product === "string"
    ? value.product.trim().toLowerCase()
    : "";
  if (productValue !== "standard" && productValue !== "instant") {
    throw invalid("product must be standard or instant.");
  }
  return {
    sourceAccountKey,
    targetCurrencyCode: currency(
      value.targetCurrencyCode,
      "targetCurrencyCode",
    ),
    sourceAmount: decimalAmount(value.sourceAmount),
    product: productValue,
    idempotencyKey: idempotency(value.idempotencyKey),
  };
}

export function parsePlayerBankingFxConsumeBody(
  body: Record<string, unknown> | null,
): {
  readonly quoteKey: string;
  readonly idempotencyKey: string;
} {
  const value = requiredBody(body);
  exactBodyKeys(value, ["quoteKey", "idempotencyKey"]);
  const quoteKey = typeof value.quoteKey === "string"
    ? value.quoteKey.trim().toLowerCase()
    : "";
  if (!PLAYER_FX_QUOTE_KEY_PATTERN.test(quoteKey)) {
    throw invalid("quoteKey is invalid.");
  }
  return { quoteKey, idempotencyKey: idempotency(value.idempotencyKey) };
}

export function parsePlayerBankingFxCancelBody(
  body: Record<string, unknown> | null,
): { readonly idempotencyKey: string } {
  const value = requiredBody(body);
  exactBodyKeys(value, ["idempotencyKey"]);
  return { idempotencyKey: idempotency(value.idempotencyKey) };
}

export function playerBankingFxPagination(
  cursorValue: string | null,
  limitValue: number,
  nextCursor: string | null,
  hasMore: boolean,
) {
  return {
    cursor: cursorValue,
    limit: limitValue,
    hasMore,
    nextCursor: hasMore ? nextCursor : null,
  };
}

export function encodePlayerBankingFxCursor(
  beforeAt: string,
  beforeKey: string,
): string {
  if (
    !Number.isFinite(Date.parse(beforeAt)) ||
    !(
      PLAYER_FX_FIXING_KEY_PATTERN.test(beforeKey) ||
      PLAYER_FX_ORDER_KEY_PATTERN.test(beforeKey)
    )
  ) {
    throw invalid("Player FX cursor anchor is invalid.");
  }
  const bytes = new TextEncoder().encode(JSON.stringify([beforeAt, beforeKey]));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join(
    "",
  );
  return `fxc_${
    btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "")
  }`;
}

function requiredBody(
  value: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!value) throw invalid("Player FX request body is required.");
  return value;
}

function exactBodyKeys(
  body: Record<string, unknown>,
  expected: readonly string[],
): void {
  const actual = Object.keys(body).sort();
  const canonical = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(canonical)) {
    throw invalid("Player FX request contains missing or unexpected fields.");
  }
}

function exactQueryKeys(
  search: URLSearchParams,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of search.keys()) {
    if (!allowedSet.has(key)) {
      throw invalid(`Player FX does not accept query parameter: ${key}.`);
    }
    if (search.getAll(key).length !== 1) {
      throw invalid(`Player FX query parameter ${key} may appear once.`);
    }
  }
}

function requiredQuery(search: URLSearchParams, key: string): string {
  const value = optionalQuery(search, key);
  if (value === null) throw invalid(`${key} is required.`);
  return value;
}

function optionalQuery(search: URLSearchParams, key: string): string | null {
  const value = search.get(key);
  if (value === null) return null;
  const normalized = value.trim();
  if (!normalized) throw invalid(`${key} may not be empty.`);
  return normalized;
}

function currency(value: unknown, field: string): string {
  const normalized = typeof value === "string"
    ? value.trim().toUpperCase()
    : "";
  if (!/^[A-Z]{3}$/u.test(normalized)) throw invalid(`${field} is invalid.`);
  return normalized;
}

function decimalAmount(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!/^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,18})?$/u.test(normalized)) {
    throw invalid(
      "sourceAmount must be a positive base-10 amount with at most 18 decimal places.",
    );
  }
  const [whole, fraction = ""] = normalized.split(".");
  const trimmedFraction = fraction.replace(/0+$/u, "");
  if (whole === "0" && !trimmedFraction) {
    throw invalid("sourceAmount is outside the supported range.");
  }
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole ?? normalized;
}

function idempotency(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!PLAYER_BANKING_FX_IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
    throw invalid("idempotencyKey is invalid.");
  }
  return normalized;
}

function limit(value: string | null): number {
  if (value === null) return DEFAULT_LIMIT;
  if (!/^[0-9]+$/u.test(value)) {
    throw invalid("limit must be an integer from 1 through 100.");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    throw invalid("limit must be an integer from 1 through 100.");
  }
  return parsed;
}

function keysetCursor(value: string | null, keyPattern: RegExp): {
  readonly cursor: string | null;
  readonly beforeAt: string | null;
  readonly beforeKey: string | null;
} {
  if (value === null) {
    return { cursor: null, beforeAt: null, beforeKey: null };
  }
  if (!PLAYER_BANKING_FX_CURSOR_PATTERN.test(value)) {
    throw invalid("cursor is invalid.");
  }
  try {
    const encoded = value.slice("fxc_".length);
    const base64 = encoded.replaceAll("-", "+").replaceAll("_", "/") +
      "=".repeat((4 - encoded.length % 4) % 4);
    const bytes = Uint8Array.from(
      atob(base64),
      (character) => character.charCodeAt(0),
    );
    const decoded = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(decoded) || decoded.length !== 2) {
      throw new Error("invalid cursor tuple");
    }
    const [beforeAt, beforeKey] = decoded;
    if (
      typeof beforeAt !== "string" || !Number.isFinite(Date.parse(beforeAt)) ||
      typeof beforeKey !== "string" || !keyPattern.test(beforeKey) ||
      encodePlayerBankingFxCursor(beforeAt, beforeKey) !== value
    ) throw new Error("invalid cursor anchor");
    return { cursor: value, beforeAt, beforeKey };
  } catch {
    throw invalid("cursor is invalid.");
  }
}

function invalid(message: string): PlayerBankingFxError {
  return new PlayerBankingFxError(
    "invalid_player_banking_fx_request",
    message,
    400,
  );
}
