/// <reference lib="dom" />

import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import {
  PlayerBusinessError,
  type PlayerBusinessRoute,
} from "../contracts/playerBusinessContracts.ts";

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
const FORMATION_OWNER_FIELDS = new Set([
  "playerIdentifier",
  "ownershipBasisPoints",
  "capitalContribution",
]);

export function validateBusinessRequestEnvelope(request: Request): void {
  const url = new URL(request.url);
  if (url.search.length > 0) {
    throw invalidRequest("Business routes do not accept query parameters.");
  }
  if (FORBIDDEN_SCOPE_HEADERS.some((header) => request.headers.has(header))) {
    throw invalidRequest(
      "Player scope is derived only from x-player-session-token.",
    );
  }
}

export async function readBusinessRequestBody(
  request: Request,
  expectsEmptyBody: boolean,
): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    throw invalidRequest("Request body is too large.");
  }

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
  if (!isRecord(parsed)) {
    throw invalidRequest("Request body must be a JSON object.");
  }
  if (expectsEmptyBody && Object.keys(parsed).length) {
    throw invalidRequest("GET requests do not accept a request body.");
  }
  return parsed;
}

export function validateBusinessRequestMethodAndFields(
  route: PlayerBusinessRoute,
  method: string,
  body: Record<string, unknown>,
): void {
  const isManufacturingCollection =
    route.kind === "businessManufacturingCollection";
  const isRead = route.kind === "businessRead" ||
    route.kind === "businessTreasuryRead";
  if (isRead && method !== "GET") {
    throw methodNotAllowed("Use GET for this resource.");
  }
  if (
    isManufacturingCollection &&
    method !== "GET" &&
    method !== "POST"
  ) {
    throw methodNotAllowed("Use GET to read jobs or POST to start a job.");
  }
  if (
    !isRead &&
    !isManufacturingCollection &&
    method !== "POST"
  ) {
    throw methodNotAllowed("Use POST for this action.");
  }

  const businessCreateFields = route.kind !== "businessCreate"
    ? []
    : route.operation === "formationPropose"
    ? ["legalName", "entityType", "industryCode", "owners", "idempotencyKey"]
    : route.operation === "formationRespond"
    ? ["decision", "idempotencyKey"]
    : route.operation === "formationActivate"
    ? ["idempotencyKey"]
    : [
      "legalName",
      "entityType",
      "industryCode",
      "capitalization",
      "acquireBusinessKey",
      "idempotencyKey",
    ];

  const allowed: Record<PlayerBusinessRoute["kind"], readonly string[]> = {
    businessRead: [],
    businessTreasuryRead: [],
    businessTreasuryAccountOpen: ["currencyCode", "idempotencyKey"],
    businessTreasuryFxQuote: [
      "sourceAccountKey",
      "targetCurrencyCode",
      "targetAccountKey",
      "sourceAmount",
      "product",
      "idempotencyKey",
    ],
    businessTreasuryFxStandard: ["quoteKey", "idempotencyKey"],
    businessTreasuryFxInstant: ["quoteKey", "idempotencyKey"],
    businessTreasuryFxCancel: ["idempotencyKey"],
    businessManufacturingCollection: method === "GET"
      ? []
      : ["productKey", "quantity", "priority", "idempotencyKey"],
    businessManufacturingCancel: ["idempotencyKey"],
    businessCreate: businessCreateFields,
    businessStoreQuote: [
      "itemKey",
      "quantity",
      "allocations",
      "idempotencyKey",
    ],
    businessStorePurchase: [
      "quoteKey",
      "idempotencyKey",
      "clientSubmittedAt",
    ],
    businessCandidateHire: ["businessKey", "idempotencyKey"],
    businessProductCreate: [
      "businessKey",
      "name",
      "category",
      "unitPrice",
      "unitInputCost",
      "unitLaborCost",
      "capacityUnits",
      "baseDemandUnits",
      "qualityScore",
      "idempotencyKey",
    ],
    businessInputPurchase: [
      "businessKey",
      "productKey",
      "quantity",
      "idempotencyKey",
    ],
    businessProduction: [
      "businessKey",
      "productKey",
      "productId",
      "quantity",
      "priority",
      "idempotencyKey",
    ],
    businessPrice: [
      "businessKey",
      "price",
      "expectedVersion",
      "idempotencyKey",
    ],
    businessHire: [
      "businessKey",
      "employeePlayerIdentifier",
      "role",
      "roleName",
      "contractType",
      "wagePerCycle",
      "productivityIndex",
      "idempotencyKey",
    ],
    businessTerminate: ["businessKey", "reason", "idempotencyKey"],
    businessStatus: [
      "businessKey",
      "transition",
      "reason",
      "idempotencyKey",
    ],
  };

  const allowedSet = new Set(allowed[route.kind]);
  for (const key of Object.keys(body)) {
    if (FORBIDDEN_BODY_FIELDS.has(key)) {
      throw invalidRequest(`Player scope field is prohibited: ${key}.`);
    }
    if (!allowedSet.has(key)) {
      throw invalidRequest(`Unexpected request field: ${key}.`);
    }
  }
}

export function readText(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < minimum || result.length > maximum) {
    throw invalidRequest(
      `${field} must contain ${minimum}-${maximum} characters.`,
    );
  }
  return result;
}

export function readOptionalText(
  value: unknown,
  maximum: number,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > maximum) {
    throw invalidRequest(
      `Optional text must contain at most ${maximum} characters.`,
    );
  }
  return result;
}

export function readEnum(
  value: unknown,
  field: string,
  values: readonly string[],
): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!values.includes(result)) throw invalidRequest(`${field} is invalid.`);
  return result;
}

export function readNumber(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result < minimum || result > maximum) {
    throw invalidRequest(
      `${field} must be between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

export function readMoney(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  return Math.round(readNumber(value, field, minimum, maximum) * 100) / 100;
}

export function readInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const result = readNumber(value, field, minimum, maximum);
  if (!Number.isInteger(result)) {
    throw invalidRequest(`${field} must be an integer.`);
  }
  return result;
}

export function readOptionalInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  return readInteger(value, field, minimum, maximum);
}

export function readKey(
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

export function readOptionalKey(
  value: unknown,
  prefix: string,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  return readKey(value, `${prefix}Key`, prefix);
}

export function readIdempotencyKey(value: unknown): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!IDEMPOTENCY_KEY.test(result)) {
    throw invalidRequest("idempotencyKey is invalid.");
  }
  return result;
}

export function readIndustryCode(value: unknown): string {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(result)) {
    throw invalidRequest("industryCode is invalid.");
  }
  return result;
}

export function readFormationOwners(
  value: unknown,
): readonly Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) {
    throw invalidRequest("owners must contain 1-16 proposed owners.");
  }
  return value.map((candidate, index) => {
    if (!isRecord(candidate)) {
      throw invalidRequest(`owners[${index}] must be an object.`);
    }
    for (const field of Object.keys(candidate)) {
      if (FORBIDDEN_BODY_FIELDS.has(field)) {
        throw invalidRequest(
          `Player scope field is prohibited in owners[${index}]: ${field}.`,
        );
      }
      if (!FORMATION_OWNER_FIELDS.has(field)) {
        throw invalidRequest(
          `Unexpected owners[${index}] field: ${field}.`,
        );
      }
    }
    return {
      playerIdentifier: readText(
        candidate.playerIdentifier,
        `owners[${index}].playerIdentifier`,
        1,
        160,
      ),
      ownershipBasisPoints: readInteger(
        candidate.ownershipBasisPoints,
        `owners[${index}].ownershipBasisPoints`,
        1,
        10_000,
      ),
      capitalContribution: readMoney(
        candidate.capitalContribution ?? 0,
        `owners[${index}].capitalContribution`,
        0,
        10_000_000,
      ),
    };
  });
}

function methodNotAllowed(message: string): PlayerBusinessError {
  return new PlayerBusinessError("method_not_allowed", message, 405);
}

function invalidRequest(
  message: string,
  status = 400,
  code = "invalid_business_request",
): PlayerBusinessError {
  return new PlayerBusinessError(code, message, status);
}
