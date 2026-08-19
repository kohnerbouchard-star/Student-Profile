/// <reference lib="dom" />

import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import { EdgeActivationError, jsonError, jsonResponse } from "../../../platform/supabase/edgeResponse.ts";
import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import { type EdgeSupabaseClient, readSupabaseEnv, type SupabaseEnv } from "../../../platform/supabase/edgeStaffSession.ts";
import {
  handlePlayerBusinessRequest,
  isPlayerBusinessRoute,
} from "../../business/index.ts";
import { type PlayerRequestScope, resolvePlayerRequestScope } from "../../players/api/playerRequestScope.ts";
import { resolveActivePlayerSession } from "../../players/api/playerSessionHttpHelpers.ts";
import {
  PlayerBusinessBankingError,
  type PlayerBankingRoute,
  type PlayerBusinessBankingRepository,
  type PlayerBusinessBankingRoute,
  type PlayerEconomicContext,
} from "../contracts/playerBusinessBankingContracts.ts";
import { SupabasePlayerBusinessBankingRepository } from "../infrastructure/supabasePlayerBusinessBankingRepository.ts";

const MAX_BODY_BYTES = 24_576;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,160}$/u;
const FORBIDDEN_SCOPE_HEADERS = [
  "x-econovaria-game-id", "x-econovaria-game-session-id", "x-game-session-id",
  "x-player-id", "x-player-session-id", "x-player-uuid",
] as const;
const FORBIDDEN_BODY_FIELDS = new Set([
  "gameId", "gameSessionId", "playerId", "playerUuid", "senderPlayerId",
  "recipientPlayerId", "ownerPlayerId", "staffUserId",
]);

export interface PlayerBusinessBankingHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly resolveScope?: (
    request: Request,
    client: EdgeSupabaseClient,
    body: Record<string, unknown>,
  ) => Promise<Pick<PlayerRequestScope, "gameId" | "playerUuid">>;
  readonly createRepository?: (client: EdgeSupabaseClient) => PlayerBusinessBankingRepository;
}

export async function handlePlayerBusinessBankingRequest(
  request: Request,
  route: PlayerBusinessBankingRoute,
  dependencies: PlayerBusinessBankingHttpHandlerDependencies,
): Promise<Response> {
  if (isPlayerBusinessRoute(route)) {
    return handlePlayerBusinessRequest(request, route, {
      createServiceClient: dependencies.createServiceClient,
      readEnvironment: dependencies.readEnvironment,
      resolveScope: dependencies.resolveScope ?? defaultResolveScope,
      createRepository: dependencies.createRepository,
    });
  }

  return handleBankingRequest(request, route, dependencies);
}

async function handleBankingRequest(
  request: Request,
  route: PlayerBankingRoute,
  dependencies: PlayerBusinessBankingHttpHandlerDependencies,
): Promise<Response> {
  try {
    validateEnvelope(request);
    const body = request.method === "GET" ? await readEmptyBody(request) : await readBody(request);
    validateMethodAndFields(route, request.method, body);
    const environment = (dependencies.readEnvironment ?? readSupabaseEnv)();
    if (!environment.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }
    const client = dependencies.createServiceClient(environment.value);
    const scope = await (dependencies.resolveScope ?? defaultResolveScope)(request, client, body);
    const repository: PlayerBusinessBankingRepository = dependencies.createRepository
      ? dependencies.createRepository(client)
      : new SupabasePlayerBusinessBankingRepository(client);
    const publicScope = { gameSessionId: scope.gameId, playerId: scope.playerUuid };
    if (route.kind === "loansRead") return privateJson(200, await repository.readLoans(publicScope));
    const context = await readEconomicContext(repository, publicScope);
    const result = await executeRoute(repository, route, body, publicScope, context);
    return privateJson(200, { ok: true, result, refreshRequired: true });
  } catch (error) {
    if (error instanceof PlayerBusinessBankingError) {
      return jsonError(error.status, { code: error.code, message: error.message, retryable: error.retryable });
    }
    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, { code: error.code, message: error.message, retryable: error.retryable });
    }
    return jsonError(500, {
      code: "player_banking_request_failed",
      message: "The Banking request could not be completed.",
      retryable: false,
    });
  }
}

async function executeRoute(
  repository: PlayerBusinessBankingRepository,
  route: Exclude<PlayerBankingRoute, { kind: "loansRead" }>,
  body: Record<string, unknown>,
  scope: { readonly gameSessionId: string; readonly playerId: string },
  context: PlayerEconomicContext,
): Promise<Record<string, unknown>> {
  const base = { p_game_session_id: scope.gameSessionId, p_player_id: scope.playerId };
  switch (route.kind) {
    case "playerTransfer":
      return repository.execute("execute_player_transfer_v1", {
        ...base,
        p_sender_player_id: scope.playerId,
        p_recipient_player_identifier: readText(body.recipientPlayerIdentifier, "recipientPlayerIdentifier", 1, 160),
        p_amount: readMoney(body.amount, "amount", 0.01, 1_000_000),
        p_currency_code: context.currencyCode,
        p_memo: readOptionalText(body.memo, 120),
        p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
      });
    case "savingsTransfer":
      return repository.execute("execute_player_account_transfer_v1", {
        ...base,
        p_from_account_type: normalizeAccount(body.fromAccount),
        p_to_account_type: normalizeAccount(body.toAccount),
        p_amount: readMoney(body.amount, "amount", 0.01, 1_000_000),
        p_currency_code: context.currencyCode,
        p_note: readOptionalText(body.note, 120),
        p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
      });
    case "loanApply":
      return repository.execute("apply_player_loan_v1", {
        ...base,
        p_offer_key: route.offerKey,
        p_business_key: readOptionalKey(body.businessKey, "biz"),
        p_amount: readMoney(body.amount, "amount", 0.01, 10_000_000),
        p_purpose: readText(body.purpose, "purpose", 2, 240),
        p_repayment_source: readText(body.repaymentSource, "repaymentSource", 5, 1_000),
        p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
      });
    case "loanRepay":
      return repository.execute("repay_player_loan_v1", {
        ...base,
        p_loan_key: route.loanKey,
        p_amount: readMoney(body.amount, "amount", 0.01, 10_000_000),
        p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
      });
  }
}

async function readEconomicContext(
  repository: PlayerBusinessBankingRepository,
  scope: { readonly gameSessionId: string; readonly playerId: string },
): Promise<PlayerEconomicContext> {
  if (repository.readEconomicContext) return repository.readEconomicContext(scope);
  const context = await repository.execute("resolve_player_economic_context_v1", {
    p_game_session_id: scope.gameSessionId,
    p_player_id: scope.playerId,
  });
  const countryCode = typeof context.country_code === "string" ? context.country_code : "";
  const currencyCode = typeof context.currency_code === "string" ? context.currency_code : "";
  if (!countryCode || !currencyCode) {
    throw invalidRequest(
      "Player country and currency must be assigned before this action.",
      409,
      "player_economic_context_missing",
    );
  }
  return { countryCode, currencyCode };
}

function defaultResolveScope(
  request: Request,
  client: EdgeSupabaseClient,
  body: Record<string, unknown>,
): Promise<PlayerRequestScope> {
  return resolvePlayerRequestScope(request, {
    hashSessionToken: sha256Hex,
    resolvePlayerSession: (tokenHash) => resolveActivePlayerSession(client, tokenHash),
  }, { body });
}

function validateEnvelope(request: Request): void {
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].length) throw invalidRequest("Banking routes do not accept query parameters.");
  if (FORBIDDEN_SCOPE_HEADERS.some((header) => request.headers.has(header))) {
    throw invalidRequest("Player scope is derived only from x-player-session-token.");
  }
}

function validateMethodAndFields(
  route: PlayerBankingRoute,
  method: string,
  body: Record<string, unknown>,
): void {
  if (route.kind === "loansRead" && method !== "GET") throw methodNotAllowed("Use GET for this resource.");
  if (route.kind !== "loansRead" && method !== "POST") throw methodNotAllowed("Use POST for this action.");
  const allowed: Record<PlayerBankingRoute["kind"], readonly string[]> = {
    loansRead: [],
    playerTransfer: ["recipientPlayerIdentifier", "amount", "memo", "idempotencyKey"],
    savingsTransfer: ["fromAccount", "toAccount", "amount", "note", "idempotencyKey"],
    loanApply: ["businessKey", "amount", "purpose", "repaymentSource", "idempotencyKey"],
    loanRepay: ["amount", "idempotencyKey"],
  };
  const allowedSet = new Set(allowed[route.kind]);
  for (const key of Object.keys(body)) {
    if (FORBIDDEN_BODY_FIELDS.has(key)) throw invalidRequest(`Player scope field is prohibited: ${key}.`);
    if (!allowedSet.has(key)) throw invalidRequest(`Unexpected request field: ${key}.`);
  }
}

async function readEmptyBody(request: Request): Promise<Record<string, unknown>> {
  const value = await readBody(request);
  if (Object.keys(value).length) throw invalidRequest("GET requests do not accept a request body.");
  return value;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) throw invalidRequest("Request body is too large.");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw invalidRequest("Request body is too large.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw || "{}"); } catch { throw invalidRequest("Request body must be valid JSON."); }
  if (!isRecord(parsed)) throw invalidRequest("Request body must be a JSON object.");
  return parsed;
}

function readText(value: unknown, field: string, minimum: number, maximum: number): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < minimum || result.length > maximum) throw invalidRequest(`${field} must contain ${minimum}-${maximum} characters.`);
  return result;
}
function readOptionalText(value: unknown, maximum: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > maximum) throw invalidRequest(`Optional text must contain at most ${maximum} characters.`);
  return result;
}
function readNumber(value: unknown, field: string, minimum: number, maximum: number): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result < minimum || result > maximum) throw invalidRequest(`${field} must be between ${minimum} and ${maximum}.`);
  return result;
}
function readMoney(value: unknown, field: string, minimum: number, maximum: number): number {
  return Math.round(readNumber(value, field, minimum, maximum) * 100) / 100;
}
function readKey(value: unknown, field: string, prefix: string): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[a-z]{3}_[0-9a-f]{32}$/u.test(result) || !result.startsWith(`${prefix}_`)) throw invalidRequest(`${field} is invalid.`);
  return result;
}
function readOptionalKey(value: unknown, prefix: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  return readKey(value, `${prefix}Key`, prefix);
}
function readIdempotencyKey(value: unknown): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!IDEMPOTENCY_KEY.test(result)) throw invalidRequest("idempotencyKey is invalid.");
  return result;
}
function normalizeAccount(value: unknown): string {
  const account = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (account === "checking" || account === "cash") return "checking";
  if (account === "savings") return "savings";
  throw invalidRequest("Account type is invalid.");
}
function methodNotAllowed(message: string): PlayerBusinessBankingError {
  return new PlayerBusinessBankingError("method_not_allowed", message, 405);
}
function invalidRequest(message: string, status = 400, code = "invalid_banking_request"): PlayerBusinessBankingError {
  return new PlayerBusinessBankingError(code, message, status);
}
function privateJson(status: number, body: unknown): Response {
  return jsonResponse(status, body, {
    "cache-control": "private, no-store, max-age=0",
    "pragma": "no-cache",
    "vary": "authorization, x-player-session-token",
  });
}
