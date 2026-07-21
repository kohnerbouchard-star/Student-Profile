import type { PlayerRequestScope } from "../../players/api/playerRequestScope.ts";
import { ArrivalClassError } from "../../arrival/contracts/arrivalClassContracts.ts";
import { WorldRuntimeError } from "../contracts/worldRuntimeContracts.ts";
import type {
  CompleteTravelRequest,
  CreateTravelQuoteRequest,
  CreateTravelQuoteResponse,
  ExecuteTravelRequest,
  ExecuteTravelResponse,
  PlayerWorldRuntimeContextPayload,
  RequestResidencyChangeRequest,
  SubmitArrivalQuestionnaireRequest,
} from "./playerWorldRuntimeContracts.ts";
import {
  parsePlayerWorldRuntimeRoute,
  playerWorldRuntimeAllowedMethods,
} from "./playerWorldRuntimeRoutePaths.ts";

const MAX_BODY_BYTES = 16_384;
const IDEMPOTENCY_HEADER = "x-idempotency-key";

export interface PlayerWorldRuntimeService {
  readContext(scope: PlayerRequestScope): Promise<PlayerWorldRuntimeContextPayload>;
  assignArrivalClass(input: {
    readonly scope: PlayerRequestScope;
    readonly request: SubmitArrivalQuestionnaireRequest;
    readonly idempotencyKey: string;
  }): Promise<PlayerWorldRuntimeContextPayload["arrival"]>;
  createTravelQuote(input: {
    readonly scope: PlayerRequestScope;
    readonly request: CreateTravelQuoteRequest;
  }): Promise<CreateTravelQuoteResponse>;
  executeTravel(input: {
    readonly scope: PlayerRequestScope;
    readonly request: ExecuteTravelRequest;
    readonly idempotencyKey: string;
  }): Promise<ExecuteTravelResponse>;
  completeTravel(input: {
    readonly scope: PlayerRequestScope;
    readonly request: CompleteTravelRequest;
  }): Promise<ExecuteTravelResponse>;
  requestResidencyChange(input: {
    readonly scope: PlayerRequestScope;
    readonly request: RequestResidencyChangeRequest;
  }): Promise<PlayerWorldRuntimeContextPayload["residency"]>;
}

export interface PlayerWorldRuntimeHttpDependencies {
  readonly resolveScope: (request: Request) => Promise<PlayerRequestScope>;
  readonly service: PlayerWorldRuntimeService;
}

export async function handlePlayerWorldRuntimeRequest(
  request: Request,
  dependencies: PlayerWorldRuntimeHttpDependencies,
): Promise<Response> {
  const url = new URL(request.url);
  const route = parsePlayerWorldRuntimeRoute(url.pathname);
  if (!route) return jsonError(404, "world_runtime_route_not_found", "Route not found.");
  if (url.search) {
    return jsonError(400, "world_runtime_query_not_allowed", "Query parameters are not accepted.");
  }
  const allowed = playerWorldRuntimeAllowedMethods(route.operation);
  if (!allowed.includes(request.method.toUpperCase())) {
    return new Response(JSON.stringify({
      error: {
        code: "method_not_allowed",
        message: "Method not allowed.",
        retryable: false,
      },
    }), {
      status: 405,
      headers: responseHeaders({ allow: allowed.join(", ") }),
    });
  }

  try {
    const scope = await dependencies.resolveScope(request);
    switch (route.operation) {
      case "context":
        return jsonOk({ context: await dependencies.service.readContext(scope) });
      case "arrivalClass": {
        const body = await readStrictObject(request, ["answers"]);
        const answers = requireAnswers(body.answers);
        const arrival = await dependencies.service.assignArrivalClass({
          scope,
          request: { answers },
          idempotencyKey: requireIdempotencyKey(request),
        });
        return jsonOk({ arrival });
      }
      case "travelQuote": {
        const body = await readStrictObject(request, ["toLocationId", "allowedModes"]);
        const quote = await dependencies.service.createTravelQuote({
          scope,
          request: {
            toLocationId: requirePublicLocationId(body.toLocationId),
            allowedModes: requireModes(body.allowedModes),
          },
        });
        return jsonOk(quote);
      }
      case "travelExecute": {
        const body = await readStrictObject(request, ["quoteId"]);
        const response = await dependencies.service.executeTravel({
          scope,
          request: { quoteId: requirePublicQuoteId(body.quoteId) },
          idempotencyKey: requireIdempotencyKey(request),
        });
        return jsonOk(response);
      }
      case "travelComplete": {
        const body = await readStrictObject(request, []);
        if (Object.keys(body).length !== 0 || !route.journeyId) {
          throw requestError("travel_completion_invalid", "Travel completion request is invalid.");
        }
        return jsonOk(await dependencies.service.completeTravel({
          scope,
          request: { journeyId: route.journeyId },
        }));
      }
      case "residencyRequest": {
        const body = await readStrictObject(request, ["countryId", "expectedRevision"]);
        const residency = await dependencies.service.requestResidencyChange({
          scope,
          request: {
            countryId: requireCountryId(body.countryId),
            expectedRevision: requireRevision(body.expectedRevision),
          },
        });
        return jsonOk({ residency });
      }
    }
  } catch (error) {
    return mapError(error);
  }
}

async function readStrictObject(
  request: Request,
  allowedKeys: readonly string[],
): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw requestError("request_body_too_large", "Request body exceeds the allowed size.", 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw requestError("request_body_too_large", "Request body exceeds the allowed size.", 413);
  }
  if (!text.trim()) {
    if (allowedKeys.length === 0) return {};
    throw requestError("request_body_required", "A JSON request body is required.");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw requestError("request_json_invalid", "Request body must be valid JSON.");
  }
  if (!isRecord(value)) {
    throw requestError("request_object_required", "Request body must be a JSON object.");
  }
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...allowedKeys].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw requestError(
      "request_shape_invalid",
      `Request fields must be exactly: ${expectedKeys.join(", ") || "none"}.`,
    );
  }
  return value;
}

function requireAnswers(value: unknown): SubmitArrivalQuestionnaireRequest["answers"] {
  if (!Array.isArray(value) || value.length < 6 || value.length > 8) {
    throw requestError("arrival_answers_invalid", "Arrival questionnaire requires six to eight answers.");
  }
  const answers = value.map((answer) => {
    if (!isRecord(answer)) throw requestError("arrival_answer_invalid", "Each answer must be an object.");
    const keys = Object.keys(answer).sort();
    if (JSON.stringify(keys) !== JSON.stringify(["optionId", "questionId"])) {
      throw requestError("arrival_answer_invalid", "Answer fields must be questionId and optionId.");
    }
    return Object.freeze({
      questionId: requireToken(answer.questionId, "questionId"),
      optionId: requireToken(answer.optionId, "optionId"),
    });
  });
  return Object.freeze(answers);
}

function requireModes(value: unknown): CreateTravelQuoteRequest["allowedModes"] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4) {
    throw requestError("travel_modes_invalid", "One to four travel modes are required.");
  }
  const modes = [...new Set(value)];
  if (
    modes.length !== value.length ||
    modes.some((mode) => !["land", "sea", "air", "meridian"].includes(String(mode)))
  ) {
    throw requestError("travel_modes_invalid", "Travel modes are invalid or duplicated.");
  }
  return Object.freeze(modes as CreateTravelQuoteRequest["allowedModes"]);
}

function requireIdempotencyKey(request: Request): string {
  const value = request.headers.get(IDEMPOTENCY_HEADER)?.trim() ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value)) {
    throw requestError(
      "idempotency_key_invalid",
      `${IDEMPOTENCY_HEADER} must contain an 8-128 character reviewed key.`,
    );
  }
  return value;
}

function requirePublicLocationId(value: unknown): string {
  if (typeof value !== "string" || !/^loc_[a-z0-9_]+$/.test(value)) {
    throw requestError("location_id_invalid", "A reviewed public location ID is required.");
  }
  return value;
}

function requirePublicQuoteId(value: unknown): string {
  if (typeof value !== "string" || !/^trq_[0-9a-f]{32}$/.test(value)) {
    throw requestError("travel_quote_id_invalid", "A reviewed public travel quote ID is required.");
  }
  return value;
}

function requireCountryId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value)) {
    throw requestError("country_id_invalid", "A reviewed country ID is required.");
  }
  return value;
}

function requireRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw requestError("revision_invalid", "A nonnegative integer revision is required.");
  }
  return Number(value);
}

function requireToken(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value)) {
    throw requestError(`${name}_invalid`, `${name} is invalid.`);
  }
  return value;
}

function mapError(error: unknown): Response {
  if (error instanceof ArrivalClassError) {
    const status = error.code.includes("revision_conflict") ? 409 : 400;
    return jsonError(status, error.code, error.message, error.retryable);
  }
  if (error instanceof WorldRuntimeError) {
    const status = error.code === "world_game_scope_mismatch"
      ? 403
      : error.code.includes("not_found")
      ? 404
      : error.code.includes("expired") || error.code.includes("conflict") || error.retryable
      ? 409
      : error.code.includes("balance")
      ? 422
      : 400;
    return jsonError(status, error.code, error.message, error.retryable);
  }
  if (isRequestError(error)) {
    return jsonError(error.status, error.code, error.message, false);
  }
  return jsonError(500, "world_runtime_unavailable", "World runtime is temporarily unavailable.", true);
}

function jsonOk(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: responseHeaders(),
  });
}

function jsonError(
  status: number,
  code: string,
  message: string,
  retryable = false,
): Response {
  return new Response(JSON.stringify({ error: { code, message, retryable } }), {
    status,
    headers: responseHeaders(),
  });
}

function responseHeaders(extra: Record<string, string> = {}): Headers {
  return new Headers({
    "cache-control": "no-store, private",
    "content-type": "application/json; charset=utf-8",
    "pragma": "no-cache",
    "x-content-type-options": "nosniff",
    ...extra,
  });
}

interface RequestError extends Error {
  readonly code: string;
  readonly status: number;
}

function requestError(code: string, message: string, status = 400): RequestError {
  return Object.assign(new Error(message), { code, status });
}

function isRequestError(value: unknown): value is RequestError {
  return value instanceof Error &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { status?: unknown }).status === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
