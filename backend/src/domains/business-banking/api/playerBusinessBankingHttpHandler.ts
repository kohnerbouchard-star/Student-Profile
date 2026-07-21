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
  type PlayerRequestScope,
  resolvePlayerRequestScope,
} from "../../players/api/playerRequestScope.ts";
import { resolveActivePlayerSession } from "../../players/api/playerSessionHttpHelpers.ts";
import {
  PlayerBusinessBankingError,
  type PlayerBusinessBankingRepository,
  type PlayerBusinessBankingRoute,
  type PlayerEconomicContext,
} from "../contracts/playerBusinessBankingContracts.ts";
import { SupabasePlayerBusinessBankingRepository } from "../infrastructure/supabasePlayerBusinessBankingRepository.ts";

const MAX_BODY_BYTES = 24_576;
const PUBLIC_KEY = /^[a-z]{3}_[0-9a-f]{32}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,160}$/u;
const FORBIDDEN_SCOPE_HEADERS = [
  "x-econovaria-game-id",
  "x-econovaria-game-session-id",
  "x-game-session-id",
  "x-player-id",
  "x-player-session-id",
  "x-player-uuid",
] as const;
const FORBIDDEN_BODY_FIELDS = new Set([
  "gameId",
  "gameSessionId",
  "playerId",
  "playerUuid",
  "senderPlayerId",
  "recipientPlayerId",
  "ownerPlayerId",
  "staffUserId",
]);

export interface PlayerBusinessBankingHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly resolveScope?: (
    request: Request,
    client: EdgeSupabaseClient,
    body: Record<string, unknown>,
  ) => Promise<Pick<PlayerRequestScope, "gameId" | "playerUuid">>;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerBusinessBankingRepository;
}

export async function handlePlayerBusinessBankingRequest(
  request: Request,
  route: PlayerBusinessBankingRoute,
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
    const scope = await (dependencies.resolveScope ?? defaultResolveScope)(
      request,
      client,
      body,
    );
    const repository = dependencies.createRepository
      ? dependencies.createRepository(client)
      : new SupabasePlayerBusinessBankingRepository(client);
    const publicScope = {
      gameSessionId: scope.gameId,
      playerId: scope.playerUuid,
    };

    if (route.kind === "businessRead") {
      return privateJson(200, await repository.readBusiness(publicScope));
    }
    if (route.kind === "loansRead") {
      return privateJson(200, await repository.readLoans(publicScope));
    }

    const context = await readEconomicContext(repository, publicScope);
    const result = await executeRoute(repository, route, body, publicScope, context);
    return privateJson(200, {
      ok: true,
      result,
      refreshRequired: true,
    });
  } catch (error) {
    if (error instanceof PlayerBusinessBankingError) {
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
      code: "player_business_banking_request_failed",
      message: "The Business or Banking request could not be completed.",
      retryable: false,
    });
  }
}

async function executeRoute(
  repository: PlayerBusinessBankingRepository,
  route: Exclude<PlayerBusinessBankingRoute, { kind: "businessRead" | "loansRead" }>,
  body: Record<string, unknown>,
  scope: { readonly gameSessionId: string; readonly playerId: string },
  context: PlayerEconomicContext,
): Promise<Record<string, unknown>> {
  const base = {
    p_game_session_id: scope.gameSessionId,
    p_player_id: scope.playerId,
  };
  switch (route.kind) {
    case "businessCreate":
      return repository.execute("create_or_acquire_player_business_v1", {
        ...base,
        p_legal_name: readText(body.legalName, "legalName", 2, 120),
        p_entity_type: readEnum(body.entityType, "entityType", [
          "sole_proprietorship",
          "partnership",
          "corporation",
          "cooperative",
        ]),
        p_industry_code: readText(body.industryCode, "industryCode", 2, 80),
        p_country_code: context.countryCode,
        p_currency_code: context.currencyCode,
        p_capitalization: readMoney(body.capitalization, "capitalization", 0, 10_000_000),
        p_acquire_business_key: readOptionalKey(body.acquireBusinessKey, "biz"),
        p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
      });
    case "businessProductCreate":
      return repository.execute("submit_business_product_v1", {
        ...base,
        p_business_key: readKey(body.businessKey, "businessKey", "biz"),
        p_name: readText(body.name, "name", 2, 120),
        p_category: readText(body.category, "category", 2, 80),
        p_unit_price: readMoney(body.unitPrice, "unitPrice", 0.01, 1_000_000),
        p_unit_input_cost: readMoney(body.unitInputCost, "unitInputCost", 0, 1_000_000),
        p_unit_labor_cost: readMoney(body.unitLaborCost, "unitLaborCost", 0, 1_000_000),
        p_capacity_units: readInteger(body.capacityUnits, "capacityUnits", 1, 100_000),
        p_base_demand_units: readInteger(body.baseDemandUnits, "baseDemandUnits", 0, 100_000),
        p_quality_score: readInteger(body.qualityScore, "qualityScore", 0, 100),
        p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
      });
    case "businessInputPurchase":
      return repository.execute("purchase_business_input_v1", {
        ...base,
        p_business_key: readKey(body.businessKey, "businessKey", "biz"),
        p_product_key: readKey(body.productKey, "productKey", "bpr"),
        p_quantity: readInteger(body.quantity, "quantity", 1, 100_000),
        p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
      });
    case "businessProduction":
      return repository.execute("run_business_production_v1", {
        ...base,
        p_business_key: readKey(body.businessKey, "businessKey", "biz"),
        p_product_key: readKey(body.productKey ?? body.productId, "productKey", "bpr"),
        p_quantity: readInteger(body.quantity, "quantity", 1, 10_000),
        p_priority: readEnum(body.priority ?? "standard", "priority", ["standard", "expedite"]),
        p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
      });
    case "businessPrice":
      return repository.execute("set_business_product_price_v1", {
        ...base,
        p_business_key: readKey(body.businessKey, "businessKey", "biz"),
        p_product_key: route.productKey,
        p_price: readMoney(body.price, "price", 0.01, 1_000_000),
        p_expected_version: readOptionalInteger(body.expectedVersion, "expectedVersion", 1, 2_147_483_647),
        p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
      });
    case "businessHire":
      return repository.execute("hire_business_employee_v1", {
        ...base,
        p_business_key: readKey(body.businessKey, "businessKey", "biz"),
        p_employee_player_identifier: readOptionalText(body.employeePlayerIdentifier, 160),
        p_role_name: readText(body.role ?? body.roleName, "role", 2, 120),
        p_contract_type: readEnum(body.contractType ?? "cycle", "contractType", ["cycle", "permanent"]),
        p_wage_per_cycle: readMoney(body.wagePerCycle, "wagePerCycle", 0.01, 1_000_000),
        p_productivity_index: readNumber(body.productivityIndex ?? 1, "productivityIndex", 0.25, 3),
        p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
      });
    case "businessTerminate":
      return repository.execute("terminate_business_employee_v1", {
        ...base,
        p_business_key: readKey(body.businessKey, "businessKey", "biz"),
        p_employee_key: route.employeeKey,
        p_reason: readText(body.reason, "reason", 2, 500),
        p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
      });
    case "businessStatus":
      return repository.execute("transition_business_status_v1", {
        ...base,
        p_business_key: readKey(body.businessKey, "businessKey", "biz"),
        p_transition: readEnum(body.transition, "transition", ["restructure", "recover", "close"]),
        p_reason: readText(body.reason, "reason", 2, 500),
        p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
      });
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
    throw invalidRequest("Player country and currency must be assigned before this action.", 409, "player_economic_context_missing");
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
  if ([...url.searchParams.keys()].length) {
    throw invalidRequest("Business and Banking routes do not accept query parameters.");
  }
  if (FORBIDDEN_SCOPE_HEADERS.some((header) => request.headers.has(header))) {
    throw invalidRequest("Player scope is derived only from x-player-session-token.");
  }
}

function validateMethodAndFields(
  route: PlayerBusinessBankingRoute,
  method: string,
  body: Record<string, unknown>,
): void {
  const read = route.kind === "businessRead" || route.kind === "loansRead";
  if (read && method !== "GET") throw methodNotAllowed("Use GET for this resource.");
  if (!read && method !== "POST") throw methodNotAllowed("Use POST for this action.");
  const allowed: Record<PlayerBusinessBankingRoute["kind"], readonly string[]> = {
    businessRead: [],
    loansRead: [],
    businessCreate: ["legalName", "entityType", "industryCode", "capitalization", "acquireBusinessKey", "idempotencyKey"],
    businessProductCreate: ["businessKey", "name", "category", "unitPrice", "unitInputCost", "unitLaborCost", "capacityUnits", "baseDemandUnits", "qualityScore", "idempotencyKey"],
    businessInputPurchase: ["businessKey", "productKey", "quantity", "idempotencyKey"],
    businessProduction: ["businessKey", "productKey", "productId", "quantity", "priority", "idempotencyKey"],
    businessPrice: ["businessKey", "price", "expectedVersion", "idempotencyKey"],
    businessHire: ["businessKey", "employeePlayerIdentifier", "role", "roleName", "contractType", "wagePerCycle", "productivityIndex", "idempotencyKey"],
    businessTerminate: ["businessKey", "reason", "idempotencyKey"],
    businessStatus: ["businessKey", "transition", "reason", "idempotencyKey"],
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
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw invalidRequest("Request body is too large.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    throw invalidRequest("Request body must be valid JSON.");
  }
  if (!isRecord(parsed)) throw invalidRequest("Request body must be a JSON object.");
  return parsed;
}

function readText(value: unknown, field: string, minimum: number, maximum: number): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < minimum || result.length > maximum) {
    throw invalidRequest(`${field} must contain ${minimum}-${maximum} characters.`);
  }
  return result;
}
function readOptionalText(value: unknown, maximum: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > maximum) throw invalidRequest(`Optional text must contain at most ${maximum} characters.`);
  return result;
}
function readEnum(value: unknown, field: string, values: readonly string[]): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!values.includes(result)) throw invalidRequest(`${field} is invalid.`);
  return result;
}
function readNumber(value: unknown, field: string, minimum: number, maximum: number): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result < minimum || result > maximum) {
    throw invalidRequest(`${field} must be between ${minimum} and ${maximum}.`);
  }
  return result;
}
function readMoney(value: unknown, field: string, minimum: number, maximum: number): number {
  return Math.round(readNumber(value, field, minimum, maximum) * 100) / 100;
}
function readInteger(value: unknown, field: string, minimum: number, maximum: number): number {
  const result = readNumber(value, field, minimum, maximum);
  if (!Number.isInteger(result)) throw invalidRequest(`${field} must be an integer.`);
  return result;
}
function readOptionalInteger(value: unknown, field: string, minimum: number, maximum: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  return readInteger(value, field, minimum, maximum);
}
function readKey(value: unknown, field: string, prefix: string): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!PUBLIC_KEY.test(result) || !result.startsWith(`${prefix}_`)) {
    throw invalidRequest(`${field} is invalid.`);
  }
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
  if (account === "checking") return "cash";
  if (account === "cash" || account === "savings") return account;
  throw invalidRequest("Account type is invalid.");
}
function methodNotAllowed(message: string): PlayerBusinessBankingError {
  return new PlayerBusinessBankingError("method_not_allowed", message, 405);
}
function invalidRequest(message: string, status = 400, code = "invalid_business_banking_request"): PlayerBusinessBankingError {
  return new PlayerBusinessBankingError(code, message, status);
}
function privateJson(status: number, body: unknown): Response {
  return jsonResponse(status, body, {
    "cache-control": "private, no-store, max-age=0",
    "pragma": "no-cache",
    "vary": "authorization, x-player-session-token",
  });
}
