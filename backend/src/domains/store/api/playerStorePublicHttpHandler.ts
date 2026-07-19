/// <reference lib="dom" />

import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import {
  EdgeActivationError,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  resolvePlayerRequestScope,
  type PlayerRequestScope,
} from "../../players/api/playerRequestScope.ts";
import { resolveActivePlayerSession } from "../../players/api/playerSessionHttpHelpers.ts";
import {
  PLAYER_STORE_ITEM_KEY_PATTERN,
  PLAYER_STORE_QUOTE_KEY_PATTERN,
  PlayerStorePublicError,
  type PlayerStorePublicRepository,
} from "../contracts/playerStorePublicContracts.ts";
import { SupabasePlayerStorePublicRepository } from "../infrastructure/supabasePlayerStorePublicRepository.ts";
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

export interface PlayerStorePublicHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly hashSessionToken?: (token: string) => Promise<string>;
  readonly resolvePlayerSession?: (
    client: EdgeSupabaseClient,
    tokenHash: string,
  ) => ReturnType<typeof resolveActivePlayerSession>;
  readonly resolveScope?: (
    request: Request,
    client: EdgeSupabaseClient,
    body: Record<string, unknown>,
  ) => Promise<PlayerRequestScope>;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerStorePublicRepository;
  readonly now?: () => string;
}

export async function handlePlayerStorePublicRequest(
  request: Request,
  route: PlayerStorePublicRoute,
  dependencies: PlayerStorePublicHttpHandlerDependencies,
): Promise<Response> {
  try {
    validateRequestEnvelope(request);
    const body = request.method === "GET" ? await readEmptyBody(request) : await readBody(request);
    validateMethodAndBody(route, request.method, body);

    const environment = (dependencies.readEnvironment ?? readSupabaseEnv)();
    if (!environment.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const client = dependencies.createServiceClient(environment.value);
    const scope = await (dependencies.resolveScope ?? defaultResolveScope)(
      request,
      client,
      body,
    );
    const repository = dependencies.createRepository
      ? dependencies.createRepository(client)
      : new SupabasePlayerStorePublicRepository(client as never);
    const publicScope = {
      gameSessionId: scope.gameId,
      playerId: scope.playerUuid,
    };

    if (route.kind === "items") {
      const items = await repository.listItems(publicScope);
      return privateJsonResponse(200, { ok: true, items });
    }

    if (route.kind === "quotes") {
      const quote = await repository.createQuote({
        ...publicScope,
        itemKey: readItemKey(body.itemKey),
        quantity: readQuantity(body.quantity),
        nowIso: (dependencies.now ?? (() => new Date().toISOString()))(),
      });
      return privateJsonResponse(200, { ok: true, quote });
    }

    if (request.method === "GET") {
      const purchases = await repository.listPurchases({
        ...publicScope,
        limit: 25,
      });
      return privateJsonResponse(200, { ok: true, purchases });
    }

    const receipt = await repository.purchase({
      ...publicScope,
      quoteKey: readQuoteKey(body.quoteKey),
      idempotencyKey: readIdempotencyKey(body.idempotencyKey),
      clientSubmittedAt: readOptionalTimestamp(body.clientSubmittedAt),
    });
    return privateJsonResponse(200, {
      ok: true,
      message: receipt.alreadyCompleted
        ? "Purchase was already completed."
        : "Purchase complete.",
      receipt,
      refreshRequired: true,
    });
  } catch (error) {
    if (error instanceof PlayerStorePublicError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    return jsonError(500, {
      code: "player_store_request_failed",
      message: "Player Store request failed.",
      retryable: false,
    });
  }
}

function defaultResolveScope(
  request: Request,
  client: EdgeSupabaseClient,
  body: Record<string, unknown>,
): Promise<PlayerRequestScope> {
  return resolvePlayerRequestScope(
    request,
    {
      hashSessionToken: sha256Hex,
      resolvePlayerSession: (tokenHash) =>
        resolveActivePlayerSession(client, tokenHash),
    },
    { body },
  );
}

function validateRequestEnvelope(request: Request): void {
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

function validateMethodAndBody(
  route: PlayerStorePublicRoute,
  method: string,
  body: Record<string, unknown>,
): void {
  if (route.kind === "items") {
    if (method !== "GET") throw methodNotAllowed("Use GET to load Store items.");
    assertAllowedFields(body, []);
    return;
  }
  if (route.kind === "quotes") {
    if (method !== "POST") throw methodNotAllowed("Use POST to create a Store quote.");
    assertAllowedFields(body, ["itemKey", "quantity"]);
    return;
  }
  if (method === "GET") {
    assertAllowedFields(body, []);
    return;
  }
  if (method !== "POST") {
    throw methodNotAllowed("Use GET for purchase history or POST to complete a purchase.");
  }
  assertAllowedFields(body, ["quoteKey", "idempotencyKey", "clientSubmittedAt"]);
}

async function readEmptyBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim()) return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw invalidRequest("Request body must be valid JSON.");
  }
  if (!isRecord(value) || Object.keys(value).length > 0) {
    throw invalidRequest("This Player Store read does not accept request fields.");
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

function readItemKey(value: unknown): string {
  const itemKey = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!PLAYER_STORE_ITEM_KEY_PATTERN.test(itemKey)) {
    throw invalidRequest(
      "itemKey must be 1 to 64 lowercase letters, numbers, underscores, or hyphens.",
    );
  }
  return itemKey;
}

function readQuoteKey(value: unknown): string {
  const quoteKey = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!PLAYER_STORE_QUOTE_KEY_PATTERN.test(quoteKey)) {
    throw invalidRequest("quoteKey is invalid.");
  }
  return quoteKey;
}

function readQuantity(value: unknown): number {
  const quantity = Number(value ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    throw invalidRequest("quantity must be an integer from 1 through 999.");
  }
  return quantity;
}

function readIdempotencyKey(value: unknown): string {
  const key = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9._:-]{8,160}$/u.test(key)) {
    throw invalidRequest("idempotencyKey must be 8 to 160 safe characters.");
  }
  return key;
}

function readOptionalTimestamp(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw invalidRequest("clientSubmittedAt must be an ISO timestamp when provided.");
  }
  return new Date(value).toISOString();
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

function privateJsonResponse<T>(status: number, body: T): Response {
  const response = jsonResponse<T>(status, body);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("vary", "authorization, x-player-session-token");
  return response;
}
