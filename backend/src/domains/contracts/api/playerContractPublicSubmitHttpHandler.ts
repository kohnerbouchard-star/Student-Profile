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
import type { JsonObject } from "../../../supabase/tableTypes.ts";
import {
  invalidPlayerSessionResponse,
  readPlayerSessionTokenFromRequest,
  resolveActivePlayerSession,
} from "../../players/api/playerSessionHttpHelpers.ts";
import type { ContractRepository } from "../contracts/contractRepositoryContracts.ts";
import { ContractRepositoryError } from "../contracts/contractRepositoryContracts.ts";
import {
  toPublicPlayerContractListItemDto,
  toPublicPlayerContractProgressDto,
} from "../contracts/playerContractPublicListContracts.ts";
import { SupabaseContractRepository } from "../infrastructure/supabaseContractRepository.ts";
import {
  listPlayerContractsAvailableNow,
  resolveActivePlayerCountryCode,
} from "../services/playerContractAvailabilityService.ts";
import type { PlayerContractPublicSubmitRoute } from "./playerContractPublicSubmitRoutePaths.ts";

export interface PlayerContractPublicSubmitHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: () =>
    | { readonly ok: true; readonly value: SupabaseEnv }
    | { readonly ok: false; readonly missing: readonly string[] };
  readonly hashSessionToken?: (sessionToken: string) => Promise<string>;
  readonly resolvePlayerSession?: (
    serviceClient: EdgeSupabaseClient,
    sessionTokenHash: string,
  ) => ReturnType<typeof resolveActivePlayerSession>;
  readonly resolvePlayerCountryCode?: (
    serviceClient: EdgeSupabaseClient,
    gameSessionId: string,
    playerId: string,
  ) => Promise<string | null>;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => ContractRepository;
  readonly now?: () => string;
}

const FORBIDDEN_SCOPE_HEADERS = [
  "x-econovaria-game-id",
  "x-game-session-id",
  "x-player-id",
  "x-player-session-id",
  "x-player-session",
  "x-player-uuid",
  "x-stock-market-runner-secret",
] as const;
const LOCKED_PROGRESS_STATUSES = new Set([
  "completed",
  "expired",
  "failed",
  "dismissed",
]);
const SUBMITTABLE_PROGRESS_STATUSES = new Set(["in_progress", "submitted"]);
const MAX_BODY_LENGTH = 20_000;
const MAX_JSON_DEPTH = 8;
const MAX_OBJECT_KEYS = 80;
const MAX_ARRAY_LENGTH = 200;
const MAX_STRING_LENGTH = 4_000;

export async function handlePlayerContractPublicSubmitRequest(
  request: Request,
  route: PlayerContractPublicSubmitRoute,
  dependencies: PlayerContractPublicSubmitHttpHandlerDependencies,
): Promise<Response> {
  if (route.kind === "malformed") {
    return jsonError(400, {
      code: "invalid_player_contract_submit_request",
      message: "The Player Contract submission route is invalid.",
      retryable: false,
    });
  }

  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to submit Contract evidence.",
      retryable: false,
    });
  }

  try {
    const url = new URL(request.url);
    rejectClientSuppliedScope(url.searchParams, request.headers);
    const submitBody = await readSubmitRequestBody(request);

    const sessionToken = readPlayerSessionTokenFromRequest(request);
    if (!sessionToken) return invalidPlayerSessionResponse();

    const envResult = (dependencies.readSupabaseEnv ?? readSupabaseEnv)();
    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const serviceClient = dependencies.createServiceClient(envResult.value);
    const sessionTokenHash = await (dependencies.hashSessionToken ?? sha256Hex)(
      sessionToken,
    );
    const sessionResult = await (dependencies.resolvePlayerSession ??
      resolveActivePlayerSession)(serviceClient, sessionTokenHash);

    if (!sessionResult.ok) {
      return jsonError(sessionResult.status, sessionResult.error);
    }

    const gameSessionId = sessionResult.session.game_session_id;
    const playerId = sessionResult.player.id;
    const repository = dependencies.createRepository
      ? dependencies.createRepository(serviceClient)
      : new SupabaseContractRepository(serviceClient as never);
    const submittedAt = (dependencies.now ?? (() => new Date().toISOString()))();
    const countryCode = await (dependencies.resolvePlayerCountryCode ??
      resolveActivePlayerCountryCode)(
      serviceClient,
      gameSessionId,
      playerId,
    );
    const availableContracts = await listPlayerContractsAvailableNow(repository, {
      gameSessionId,
      playerId,
      ...(countryCode ? { countryCode } : {}),
      ...(sessionResult.player.roster_label
        ? { rosterLabel: sessionResult.player.roster_label }
        : {}),
      nowIso: submittedAt,
    });
    const contract = availableContracts.find((candidate) =>
      candidate.contractKey === route.contractKey
    );

    if (!contract) {
      return jsonError(404, {
        code: "contract_not_available",
        message: "Contract is not available to the authenticated player.",
        retryable: false,
      });
    }

    const existingProgress = await repository.getPlayerContractProgress({
      gameSessionId,
      contractId: contract.id,
      playerId,
    });

    if (!existingProgress) {
      return jsonError(409, {
        code: "contract_not_accepted",
        message: "Accept this Contract before submitting evidence.",
        retryable: false,
      });
    }

    if (LOCKED_PROGRESS_STATUSES.has(String(existingProgress.status))) {
      return jsonError(409, {
        code: "contract_progress_locked",
        message: "Contract progress can no longer be submitted.",
        retryable: false,
      });
    }

    if (!SUBMITTABLE_PROGRESS_STATUSES.has(String(existingProgress.status))) {
      return jsonError(409, {
        code: "contract_progress_not_submittable",
        message: "Contract progress is not ready for submission.",
        retryable: false,
      });
    }

    const progress = await repository.upsertPlayerContractProgress({
      gameSessionId,
      contractId: contract.id,
      playerId,
      status: "submitted",
      evidencePayload: submitBody.evidencePayload,
      resultPayload: existingProgress.resultPayload,
      submittedAt,
    });

    return jsonResponse(200, {
      ok: true,
      contract: toPublicPlayerContractListItemDto(contract),
      progress: toPublicPlayerContractProgressDto(progress, contract.contractKey),
    });
  } catch (error) {
    return playerContractPublicSubmitErrorToResponse(error);
  }
}

async function readSubmitRequestBody(
  request: Request,
): Promise<{ readonly evidencePayload: JsonObject }> {
  const text = await request.text();
  if (!text.trim()) return { evidencePayload: {} };
  if (text.length > MAX_BODY_LENGTH) {
    throw invalidRequest("Contract evidence is too large.");
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw invalidRequest("Request body must be valid JSON.");
  }
  if (!isRecord(value)) {
    throw invalidRequest("Request body must be a JSON object.");
  }

  for (const key of Object.keys(value)) {
    if (key !== "evidencePayload") {
      throw invalidRequest(
        "Only evidencePayload is accepted; Contract and player scope come from the route and session.",
      );
    }
  }

  const evidencePayload = value.evidencePayload ?? {};
  if (!isRecord(evidencePayload)) {
    throw invalidRequest("evidencePayload must be a JSON object.");
  }
  assertBoundedJson(evidencePayload, 0);
  return { evidencePayload: evidencePayload as JsonObject };
}

function assertBoundedJson(value: unknown, depth: number): void {
  if (depth > MAX_JSON_DEPTH) throw invalidRequest("Contract evidence is too deeply nested.");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw invalidRequest("Contract evidence contains an invalid number.");
    return;
  }
  if (typeof value === "string") {
    if (value.length > MAX_STRING_LENGTH) throw invalidRequest("Contract evidence text is too long.");
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) throw invalidRequest("Contract evidence contains too many entries.");
    value.forEach((item) => assertBoundedJson(item, depth + 1));
    return;
  }
  if (!isRecord(value)) throw invalidRequest("Contract evidence contains an unsupported value.");
  const entries = Object.entries(value);
  if (entries.length > MAX_OBJECT_KEYS) throw invalidRequest("Contract evidence contains too many fields.");
  for (const [key, nested] of entries) {
    if (["__proto__", "constructor", "prototype"].includes(key)) {
      throw invalidRequest("Contract evidence contains an invalid field.");
    }
    assertBoundedJson(nested, depth + 1);
  }
}

function rejectClientSuppliedScope(
  searchParams: URLSearchParams,
  headers: Headers,
): void {
  if ([...searchParams.keys()].length > 0) {
    throw invalidRequest(
      "Player Contract submission scope is derived from the route and x-player-session-token.",
    );
  }
  for (const headerName of FORBIDDEN_SCOPE_HEADERS) {
    if (headers.has(headerName)) {
      throw invalidRequest(
        "Player Contract submission scope is derived from the route and x-player-session-token.",
      );
    }
  }
}

function invalidRequest(message: string): EdgeActivationError {
  return new EdgeActivationError(
    "invalid_player_contract_submit_request",
    message,
    400,
    false,
  );
}

function playerContractPublicSubmitErrorToResponse(error: unknown): Response {
  if (error instanceof EdgeActivationError) {
    return jsonError(error.status, {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    });
  }
  if (error instanceof ContractRepositoryError) {
    return jsonError(500, {
      code: error.code,
      message: "Player Contract submission failed.",
      retryable: false,
    });
  }
  return jsonError(500, {
    code: "player_contract_submit_request_failed",
    message: "Player Contract submission failed.",
    retryable: false,
  });
}
