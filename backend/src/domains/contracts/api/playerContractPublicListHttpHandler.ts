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
import {
  invalidPlayerSessionResponse,
  readPlayerSessionTokenFromRequest,
  resolveActivePlayerSession,
} from "../../players/api/playerSessionHttpHelpers.ts";
import type {
  ContractRepository,
  GameSessionContractRecord,
} from "../contracts/contractRepositoryContracts.ts";
import { ContractRepositoryError } from "../contracts/contractRepositoryContracts.ts";
import {
  type PublicPlayerContractListResponseBody,
  toPublicPlayerContractListItemDto,
  toPublicPlayerContractProgressDto,
} from "../contracts/playerContractPublicListContracts.ts";
import { SupabaseContractRepository } from "../infrastructure/supabaseContractRepository.ts";
import {
  listPlayerContractsAvailableNow,
  resolveActivePlayerCountryCode,
} from "../services/playerContractAvailabilityService.ts";

export interface PlayerContractPublicListHttpHandlerDependencies {
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
  "x-game-session-id",
  "x-player-id",
  "x-player-session-id",
  "x-player-session",
  "x-stock-market-runner-secret",
] as const;

export async function handlePlayerContractPublicListRequest(
  request: Request,
  dependencies: PlayerContractPublicListHttpHandlerDependencies,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to load player contracts.",
      retryable: false,
    });
  }

  try {
    const url = new URL(request.url);
    rejectClientSuppliedScope(url.searchParams, request.headers);

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
    const nowIso = (dependencies.now ?? (() => new Date().toISOString()))();
    const countryCode = await (dependencies.resolvePlayerCountryCode ??
      resolveActivePlayerCountryCode)(
        serviceClient,
        gameSessionId,
        playerId,
      );

    const [contracts, progress] = await Promise.all([
      listPlayerContractsAvailableNow(repository, {
        gameSessionId,
        playerId,
        ...(countryCode ? { countryCode } : {}),
        ...(sessionResult.player.roster_label
          ? { rosterLabel: sessionResult.player.roster_label }
          : {}),
        nowIso,
      }),
      repository.listPlayerContractProgress({
        gameSessionId,
        playerId,
      }),
    ]);

    const contractKeyById = new Map<string, string>(
      contracts.map((contract) => [contract.id, contract.contractKey]),
    );

    return jsonResponse<PublicPlayerContractListResponseBody>(200, {
      ok: true,
      contracts: contracts.map(toPublicPlayerContractListItemDto),
      progress: progress.flatMap((entry) => {
        if (
          entry.gameSessionId !== gameSessionId ||
          entry.playerId !== playerId
        ) {
          return [];
        }
        const contractKey = contractKeyById.get(entry.contractId);
        return contractKey
          ? [toPublicPlayerContractProgressDto(entry, contractKey)]
          : [];
      }),
    });
  } catch (error) {
    return playerContractPublicListErrorToResponse(error);
  }
}

function rejectClientSuppliedScope(
  searchParams: URLSearchParams,
  headers: Headers,
): void {
  if ([...searchParams.keys()].length > 0) {
    throw invalidRequest(
      "Player Contract list scope is derived from x-player-session-token.",
    );
  }
  for (const headerName of FORBIDDEN_SCOPE_HEADERS) {
    if (headers.has(headerName)) {
      throw invalidRequest(
        "Player Contract list scope is derived from x-player-session-token.",
      );
    }
  }
}

function invalidRequest(message: string): EdgeActivationError {
  return new EdgeActivationError(
    "invalid_player_contract_list_request",
    message,
    400,
    false,
  );
}

function playerContractPublicListErrorToResponse(error: unknown): Response {
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
      message: "Player Contract list request failed.",
      retryable: false,
    });
  }
  return jsonError(500, {
    code: "player_contract_list_request_failed",
    message: "Player Contract list request failed.",
    retryable: false,
  });
}
