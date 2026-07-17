/// <reference lib="dom" />

import {
  EdgeActivationError,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
import {
  invalidPlayerSessionResponse,
  readPlayerSessionTokenFromRequest,
  resolveActivePlayerSession,
} from "../../players/api/playerSessionHttpHelpers.ts";
import type {
  ContractRepository,
  PlayerContractProgressRecord,
} from "../contracts/contractRepositoryContracts.ts";
import { ContractRepositoryError } from "../contracts/contractRepositoryContracts.ts";
import {
  type PlayerContractAcceptResponseBody,
  type PlayerContractListResponseBody,
  type PlayerContractSubmitResponseBody,
  toPlayerContractDto,
  toPlayerContractProgressDto,
} from "../contracts/contractHttpContracts.ts";
import { SupabaseContractRepository } from "../infrastructure/supabaseContractRepository.ts";
import {
  listPlayerContractsAvailableNow,
  resolveActivePlayerCountryCode,
} from "../services/playerContractAvailabilityService.ts";
import type { PlayerContractRoute } from "./playerContractRoutePaths.ts";

export interface PlayerContractHttpHandlerDependencies {
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

interface PlayerContractSubmitRequestBody {
  readonly gameSessionId: string;
  readonly evidencePayload: JsonObject;
}

interface PlayerContractAcceptRequestBody {
  readonly gameSessionId: string;
}

const LOCKED_PROGRESS_STATUSES = [
  "completed",
  "expired",
  "failed",
  "dismissed",
] as const;

export async function handlePlayerContractRequest(
  request: Request,
  route: PlayerContractRoute,
  dependencies: PlayerContractHttpHandlerDependencies,
): Promise<Response> {
  if (route.kind === "contracts" && request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to load player contracts.",
      retryable: false,
    });
  }

  if (route.kind === "submit" && request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to submit contract evidence.",
      retryable: false,
    });
  }

  if (route.kind === "accept" && request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to accept a player contract.",
      retryable: false,
    });
  }

  if (request.headers.has("x-stock-market-runner-secret")) {
    return jsonError(400, {
      code: "stock_runner_secret_not_allowed",
      message:
        "Player contract requests must not send the stock market runner secret.",
      retryable: false,
    });
  }

  try {
    const envResult = (dependencies.readSupabaseEnv ?? readSupabaseEnv)();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const url = new URL(request.url);
    rejectClientSuppliedIdentity(url.searchParams, request.headers);

    const sessionToken = readPlayerSessionTokenFromRequest(request);

    if (!sessionToken) {
      return invalidPlayerSessionResponse();
    }

    const actionBody = route.kind === "contracts"
      ? null
      : route.kind === "submit"
      ? await readSubmitRequestBody(request)
      : await readAcceptRequestBody(request);
    const gameSessionId = actionBody?.gameSessionId ??
      readListGameSessionId(url.searchParams);
    const serviceClient = dependencies.createServiceClient(envResult.value);
    const sessionTokenHash = await (dependencies.hashSessionToken ?? sha256Hex)(
      sessionToken,
    );
    const sessionResult = await (dependencies.resolvePlayerSession ??
      resolveActivePlayerSession)(serviceClient, sessionTokenHash);

    if (!sessionResult.ok) {
      return jsonError(sessionResult.status, sessionResult.error);
    }

    if (sessionResult.session.game_session_id !== gameSessionId) {
      throw new EdgeActivationError(
        "invalid_player_session_scope",
        "Requested game session does not match the authenticated player session.",
        401,
        false,
      );
    }

    const repository = dependencies.createRepository
      ? dependencies.createRepository(serviceClient)
      : new SupabaseContractRepository(serviceClient as never);
    const nowIso = (dependencies.now ?? (() => new Date().toISOString()))();
    const countryCode = await (dependencies.resolvePlayerCountryCode ??
      resolveActivePlayerCountryCode)(
        serviceClient,
        gameSessionId,
        sessionResult.player.id,
      );

    if (route.kind === "contracts") {
      return await listPlayerContracts({
        repository,
        gameSessionId,
        playerId: sessionResult.player.id,
        countryCode,
        rosterLabel: sessionResult.player.roster_label,
        nowIso,
      });
    }

    if (route.kind === "accept") {
      return await acceptPlayerContract({
        repository,
        gameSessionId,
        contractId: route.contractId,
        playerId: sessionResult.player.id,
        countryCode,
        rosterLabel: sessionResult.player.roster_label,
        acceptedAt: nowIso,
      });
    }

    if (!actionBody || !("evidencePayload" in actionBody)) {
      throw invalidRequest("Request body must be a JSON object.");
    }
    const submitBody = actionBody as PlayerContractSubmitRequestBody;

    return await submitPlayerContract({
      repository,
      gameSessionId,
      contractId: route.contractId,
      playerId: sessionResult.player.id,
      countryCode,
      rosterLabel: sessionResult.player.roster_label,
      evidencePayload: submitBody.evidencePayload,
      submittedAt: nowIso,
    });
  } catch (error) {
    return playerContractErrorToResponse(error);
  }
}

async function acceptPlayerContract(input: {
  readonly repository: ContractRepository;
  readonly gameSessionId: string;
  readonly contractId: string;
  readonly playerId: string;
  readonly countryCode: string | null;
  readonly rosterLabel: string | null;
  readonly acceptedAt: string;
}): Promise<Response> {
  const availableContracts = await listPlayerContractsAvailableNow(
    input.repository,
    {
      gameSessionId: input.gameSessionId,
      playerId: input.playerId,
      ...(input.countryCode ? { countryCode: input.countryCode } : {}),
      ...(input.rosterLabel ? { rosterLabel: input.rosterLabel } : {}),
      nowIso: input.acceptedAt,
    },
  );
  const contract = availableContracts.find((candidate) =>
    candidate.id === input.contractId
  );

  if (!contract) {
    return jsonError(404, {
      code: "contract_not_available",
      message: "Contract is not available to the authenticated player.",
      retryable: false,
    });
  }

  const acceptance = await input.repository.acceptPlayerContractProgress({
    gameSessionId: input.gameSessionId,
    contractId: input.contractId,
    playerId: input.playerId,
  });

  if (acceptance.outcome === "not_available") {
    return jsonError(404, {
      code: "contract_not_available",
      message: "Contract is not available to the authenticated player.",
      retryable: false,
    });
  }

  if (acceptance.outcome === "locked") {
    return jsonError(409, {
      code: "contract_progress_locked",
      message: "Contract progress can no longer be accepted.",
      retryable: false,
    });
  }

  if (acceptance.outcome === "already_accepted") {
    return jsonResponse<PlayerContractAcceptResponseBody>(200, {
      ok: true,
      alreadyAccepted: true,
      contract: toPlayerContractDto(contract),
      progress: toPlayerContractProgressDto(acceptance.progress),
    });
  }

  return jsonResponse<PlayerContractAcceptResponseBody>(200, {
    ok: true,
    alreadyAccepted: false,
    contract: toPlayerContractDto(contract),
    progress: toPlayerContractProgressDto(acceptance.progress),
  });
}

async function listPlayerContracts(input: {
  readonly repository: ContractRepository;
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly countryCode: string | null;
  readonly rosterLabel: string | null;
  readonly nowIso: string;
}): Promise<Response> {
  const [contracts, progress] = await Promise.all([
    listPlayerContractsAvailableNow(input.repository, {
      gameSessionId: input.gameSessionId,
      playerId: input.playerId,
      ...(input.countryCode ? { countryCode: input.countryCode } : {}),
      ...(input.rosterLabel ? { rosterLabel: input.rosterLabel } : {}),
      nowIso: input.nowIso,
    }),
    input.repository.listPlayerContractProgress({
      gameSessionId: input.gameSessionId,
      playerId: input.playerId,
    }),
  ]);
  return jsonResponse<PlayerContractListResponseBody>(200, {
    ok: true,
    contracts: contracts.map(toPlayerContractDto),
    progress: progress
      .filter((row) =>
        row.gameSessionId === input.gameSessionId &&
        row.playerId === input.playerId
      )
      .map(toPlayerContractProgressDto),
  });
}

async function submitPlayerContract(input: {
  readonly repository: ContractRepository;
  readonly gameSessionId: string;
  readonly contractId: string;
  readonly playerId: string;
  readonly countryCode: string | null;
  readonly rosterLabel: string | null;
  readonly evidencePayload: JsonObject;
  readonly submittedAt: string;
}): Promise<Response> {
  const availableContracts = await listPlayerContractsAvailableNow(
    input.repository,
    {
      gameSessionId: input.gameSessionId,
      playerId: input.playerId,
      ...(input.countryCode ? { countryCode: input.countryCode } : {}),
      ...(input.rosterLabel ? { rosterLabel: input.rosterLabel } : {}),
      nowIso: input.submittedAt,
    },
  );
  const contract = availableContracts.find((candidate) =>
    candidate.id === input.contractId
  );

  if (!contract) {
    return jsonError(404, {
      code: "contract_not_available",
      message: "Contract is not available to the authenticated player.",
      retryable: false,
    });
  }

  const existingProgress = await input.repository.getPlayerContractProgress({
    gameSessionId: input.gameSessionId,
    contractId: input.contractId,
    playerId: input.playerId,
  });

  if (existingProgress && isLockedProgress(existingProgress)) {
    return jsonError(409, {
      code: "contract_progress_locked",
      message: "Contract progress can no longer be submitted.",
      retryable: false,
    });
  }

  const progress = await input.repository.upsertPlayerContractProgress({
    gameSessionId: input.gameSessionId,
    contractId: input.contractId,
    playerId: input.playerId,
    status: "submitted",
    evidencePayload: input.evidencePayload,
    resultPayload: existingProgress?.resultPayload ?? {},
    submittedAt: input.submittedAt,
  });

  return jsonResponse<PlayerContractSubmitResponseBody>(200, {
    ok: true,
    contract: toPlayerContractDto(contract),
    progress: toPlayerContractProgressDto(progress),
  });
}

async function readSubmitRequestBody(
  request: Request,
): Promise<PlayerContractSubmitRequestBody> {
  const text = await request.text();

  if (!text.trim()) {
    throw invalidRequest("Request body must be a JSON object.");
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

  rejectClientSuppliedBodyIdentity(value);

  return {
    gameSessionId: readRequiredString(value.gameSessionId, "gameSessionId"),
    evidencePayload: readEvidencePayload(value.evidencePayload),
  };
}

async function readAcceptRequestBody(
  request: Request,
): Promise<PlayerContractAcceptRequestBody> {
  const text = await request.text();

  if (!text.trim()) {
    throw invalidRequest("Request body must be a JSON object.");
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

  rejectClientSuppliedBodyIdentity(value);

  return {
    gameSessionId: readRequiredString(value.gameSessionId, "gameSessionId"),
  };
}

function readListGameSessionId(searchParams: URLSearchParams): string {
  const values = searchParams.getAll("gameSessionId");

  if (values.length !== 1) {
    throw invalidRequest(
      "Exactly one gameSessionId query parameter is required.",
    );
  }

  return readRequiredString(values[0], "gameSessionId");
}

function rejectClientSuppliedIdentity(
  searchParams: URLSearchParams,
  headers: Headers,
): void {
  for (const fieldName of playerIdentityFieldNames()) {
    if (searchParams.has(fieldName)) {
      throw invalidRequest(
        "Player contracts derive player identity from x-player-session-token.",
      );
    }
  }

  for (
    const headerName of [
      "x-player-id",
      "x-player-session-id",
      "x-player-session",
    ]
  ) {
    if (headers.has(headerName)) {
      throw invalidRequest(
        "Player contracts derive player identity from x-player-session-token.",
      );
    }
  }
}

function rejectClientSuppliedBodyIdentity(
  body: Record<string, unknown>,
): void {
  for (const fieldName of playerIdentityFieldNames()) {
    if (fieldName in body) {
      throw invalidRequest(
        "Player contracts derive player identity from x-player-session-token.",
      );
    }
  }
}

function playerIdentityFieldNames(): readonly string[] {
  return [
    "playerId",
    "playerIds",
    "playerSessionId",
    "playerSessionIds",
    "sessionId",
    "sessionIds",
  ];
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    throw invalidRequest(`${fieldName} is required.`);
  }

  return text;
}

function readEvidencePayload(value: unknown): JsonObject {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value) || !isJsonValue(value)) {
    throw invalidRequest("evidencePayload must be a JSON object.");
  }

  return value as JsonObject;
}

function isLockedProgress(progress: PlayerContractProgressRecord): boolean {
  return LOCKED_PROGRESS_STATUSES.includes(progress.status as never);
}

function invalidRequest(message: string): EdgeActivationError {
  return new EdgeActivationError(
    "invalid_player_contract_request",
    message,
    400,
    false,
  );
}

function playerContractErrorToResponse(error: unknown): Response {
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
      message: "Player contract request failed.",
      retryable: false,
    });
  }

  return jsonError(500, {
    code: "player_contract_request_failed",
    message: "Player contract request failed.",
    retryable: false,
  });
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return typeof value !== "number" || Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (isRecord(value)) {
    return Object.values(value).every(isJsonValue);
  }

  return false;
}
