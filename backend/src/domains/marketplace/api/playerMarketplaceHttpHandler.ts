/// <reference lib="dom" />

import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import {
  EdgeActivationError,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import { resolveActivePlayerSession } from "../../players/api/playerSessionHttpHelpers.ts";
import {
  type PlayerRequestScope,
  resolvePlayerRequestScope,
} from "../../players/api/playerRequestScope.ts";
import {
  MARKETPLACE_IDEMPOTENCY_KEY_PATTERN,
  MARKETPLACE_ITEM_KEY_PATTERN,
  type MarketplaceCommittedResult,
  PlayerMarketplaceError,
  PlayerMarketplacePersistenceError,
  type PlayerMarketplaceRepository,
} from "../contracts/playerMarketplaceContracts.ts";
import { SupabasePlayerMarketplaceRepository } from "../infrastructure/supabasePlayerMarketplaceRepository.ts";
import type { PlayerMarketplaceRoute } from "./playerMarketplaceRoutePaths.ts";

const MAX_BODY_BYTES = 4096;
const CONDITIONS = new Set(["New", "Like New", "Used", "Damaged"]);

export interface PlayerMarketplaceHttpDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly resolveScope?: (
    request: Request,
    client: EdgeSupabaseClient,
  ) => Promise<PlayerRequestScope>;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerMarketplaceRepository;
}

export async function handlePlayerMarketplaceRequest(
  request: Request,
  route: PlayerMarketplaceRoute,
  dependencies: PlayerMarketplaceHttpDependencies,
): Promise<Response> {
  if (route.kind === "malformed") {
    return privateError(400, "invalid_player_marketplace_request", "Marketplace route is malformed.");
  }
  const allowed = route.kind === "collection"
    ? new Set(["GET", "POST"])
    : new Set(["POST"]);
  if (!allowed.has(request.method)) {
    return privateError(405, "method_not_allowed", "Marketplace method is not allowed.");
  }
  if (request.headers.has("x-stock-market-runner-secret")) {
    return privateError(400, "stock_runner_secret_not_allowed", "Marketplace requests must not send a runner secret.");
  }

  try {
    rejectClientScope(request);
    const envResult = (dependencies.readEnvironment ?? readSupabaseEnv)();
    if (!envResult.ok) {
      return privateError(500, "missing_edge_runtime_config", "Classroom API runtime configuration is incomplete.");
    }
    const client = dependencies.createServiceClient(envResult.value);
    const scope = await (dependencies.resolveScope ?? resolveScope)(request, client);
    const repository = dependencies.createRepository
      ? dependencies.createRepository(client)
      : new SupabasePlayerMarketplaceRepository(client as never);

    if (request.method === "GET") {
      return privateResponse(200, {
        ok: true,
        marketplace: await repository.read({
          gameId: scope.gameId,
          playerUuid: scope.playerUuid,
        }),
      });
    }

    const body = await strictJsonObject(request);
    let result: MarketplaceCommittedResult;
    let status = 200;
    if (route.kind === "collection") {
      exactKeys(body, [
        "itemKey", "quantity", "unitPrice", "currencyCode", "condition",
        "durationHours", "idempotencyKey",
      ]);
      result = await repository.createListing({
        gameSessionId: scope.gameId,
        playerId: scope.playerUuid,
        itemKey: itemKey(body.itemKey),
        quantity: positiveInteger(body.quantity, "quantity", 1_000_000),
        unitPrice: positiveNumber(body.unitPrice, "unitPrice", 1_000_000_000_000),
        currencyCode: currency(body.currencyCode),
        condition: condition(body.condition),
        durationHours: nullableInteger(body.durationHours, "durationHours", 1, 720),
        idempotencyKey: idempotency(body.idempotencyKey),
      });
      status = result.outcome === "applied" ? 201 : 200;
    } else if (route.kind === "activate") {
      exactKeys(body, ["expectedVersion", "idempotencyKey"]);
      result = await repository.activateListing({
        gameSessionId: scope.gameId,
        playerId: scope.playerUuid,
        listingKey: route.listingKey,
        expectedVersion: positiveInteger(body.expectedVersion, "expectedVersion", Number.MAX_SAFE_INTEGER),
        idempotencyKey: idempotency(body.idempotencyKey),
      });
    } else if (route.kind === "purchase") {
      exactKeys(body, ["quantity", "expectedVersion", "idempotencyKey"]);
      result = await repository.purchase({
        gameSessionId: scope.gameId,
        playerId: scope.playerUuid,
        listingKey: route.listingKey,
        quantity: positiveInteger(body.quantity, "quantity", 1_000_000),
        expectedVersion: positiveInteger(body.expectedVersion, "expectedVersion", Number.MAX_SAFE_INTEGER),
        idempotencyKey: idempotency(body.idempotencyKey),
      });
    } else if (route.kind === "cancel") {
      exactKeys(body, ["expectedVersion", "idempotencyKey"]);
      result = await repository.cancel({
        gameSessionId: scope.gameId,
        playerId: scope.playerUuid,
        listingKey: route.listingKey,
        expectedVersion: positiveInteger(body.expectedVersion, "expectedVersion", Number.MAX_SAFE_INTEGER),
        idempotencyKey: idempotency(body.idempotencyKey),
      });
    } else {
      exactKeys(body, ["reason", "idempotencyKey"]);
      result = await repository.openDispute({
        gameSessionId: scope.gameId,
        playerId: scope.playerUuid,
        orderKey: route.orderKey,
        reason: boundedText(body.reason, "reason", 10, 1000),
        idempotencyKey: idempotency(body.idempotencyKey),
      });
      status = result.outcome === "applied" ? 201 : 200;
    }

    return privateResponse(status, {
      ok: true,
      outcome: result.outcome,
      target: {
        id: result.targetId,
        status: result.status,
        version: result.version,
        committedAt: result.committedAt,
      },
      committed: true,
      refreshRequired: true,
    });
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      return privateError(error.status, error.code, error.message, error.retryable);
    }
    if (error instanceof PlayerMarketplaceError) {
      return privateError(error.status, error.code, error.message, error.retryable);
    }
    if (error instanceof PlayerMarketplacePersistenceError) {
      return privateError(503, "player_marketplace_service_unavailable", "Marketplace is temporarily unavailable.", true);
    }
    return privateError(500, "player_marketplace_service_unavailable", "Marketplace request failed.");
  }
}

function resolveScope(request: Request, client: EdgeSupabaseClient) {
  return resolvePlayerRequestScope(request, {
    hashSessionToken: sha256Hex,
    resolvePlayerSession: (tokenHash) => resolveActivePlayerSession(client, tokenHash),
  });
}

function rejectClientScope(request: Request): void {
  const url = new URL(request.url);
  if (url.search) throw invalid("Marketplace routes do not accept query parameters.");
  for (const header of ["x-player-id", "x-player-session-id", "x-game-session-id"]) {
    if (request.headers.has(header)) {
      throw invalid("Marketplace ownership is derived from the authenticated Player session.");
    }
  }
}

async function strictJsonObject(request: Request): Promise<Record<string, unknown>> {
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

function exactKeys(body: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  const keys = Object.keys(body);
  if (keys.some((key) => !allowedSet.has(key)) || keys.length !== allowed.length) {
    throw invalid("Marketplace request contains missing or unexpected fields.");
  }
}
function itemKey(value: unknown): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!MARKETPLACE_ITEM_KEY_PATTERN.test(result)) throw invalid("itemKey is invalid.");
  return result;
}
function idempotency(value: unknown): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!MARKETPLACE_IDEMPOTENCY_KEY_PATTERN.test(result)) throw invalid("idempotencyKey is invalid.");
  return result;
}
function currency(value: unknown): string {
  const result = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{3,12}$/.test(result)) throw invalid("currencyCode is invalid.");
  return result;
}
function condition(value: unknown): "New" | "Like New" | "Used" | "Damaged" {
  const result = typeof value === "string" ? value.trim() : "";
  if (!CONDITIONS.has(result)) throw invalid("condition is invalid.");
  return result as never;
}
function positiveInteger(value: unknown, field: string, max: number): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1 || result > max) throw invalid(`${field} is invalid.`);
  return result;
}
function nullableInteger(value: unknown, field: string, min: number, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max) throw invalid(`${field} is invalid.`);
  return result;
}
function positiveNumber(value: unknown, field: string, max: number): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0 || result > max) throw invalid(`${field} is invalid.`);
  return result;
}
function boundedText(value: unknown, field: string, min: number, max: number): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < min || result.length > max) throw invalid(`${field} is invalid.`);
  return result;
}
function invalid(message: string): PlayerMarketplaceError {
  return new PlayerMarketplaceError("invalid_player_marketplace_request", message, 400);
}
function privateResponse<T>(status: number, body: T): Response {
  const response = jsonResponse(status, body);
  privateHeaders(response);
  return response;
}
function privateError(status: number, code: string, message: string, retryable = false): Response {
  const response = jsonError(status, { code, message, retryable });
  privateHeaders(response);
  return response;
}
function privateHeaders(response: Response): void {
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("pragma", "no-cache");
  response.headers.set("vary", "authorization, x-player-session-token");
}
