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
import { resolveActivePlayerSession } from "../../players/api/playerSessionHttpHelpers.ts";
import {
  rejectClientSuppliedBodyIdentity,
  resolvePlayerRequestScope,
} from "../../players/api/playerRequestScope.ts";
import {
  PlayerContractAcceptanceError,
  PlayerContractAcceptancePersistenceError,
  type PlayerContractAcceptanceRepository,
  type PlayerContractAcceptanceResponseBody,
} from "../contracts/playerContractAcceptanceContracts.ts";
import { SupabasePlayerContractAcceptanceRepository } from "../infrastructure/supabasePlayerContractAcceptanceRepository.ts";
import type { PlayerContractAcceptanceRoute } from "./playerContractAcceptanceRoutePaths.ts";

const MAX_ACCEPT_BODY_BYTES = 1_024;
const GAME_SCOPE_HEADERS = [
  "x-econovaria-game-session-id",
  "x-econovaria-game-id",
] as const;

export interface PlayerContractAcceptanceHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: typeof readSupabaseEnv;
  readonly hashSessionToken?: (token: string) => Promise<string>;
  readonly resolvePlayerSession?: (
    client: EdgeSupabaseClient,
    tokenHash: string,
  ) => ReturnType<typeof resolveActivePlayerSession>;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerContractAcceptanceRepository;
  readonly now?: () => Date;
}

export async function handlePlayerContractAcceptanceRequest(
  request: Request,
  route: PlayerContractAcceptanceRoute,
  dependencies: PlayerContractAcceptanceHttpHandlerDependencies,
): Promise<Response> {
  if (route.kind !== "accept") {
    return jsonError(400, {
      code: "invalid_player_contract_acceptance_request",
      message: "Player Contract acceptance route is malformed.",
      retryable: false,
    });
  }
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to accept a Player Contract.",
      retryable: false,
    });
  }
  if (request.headers.has("x-stock-market-runner-secret")) {
    return jsonError(400, {
      code: "stock_runner_secret_not_allowed",
      message: "Player Contract requests must not send a runner secret.",
      retryable: false,
    });
  }

  try {
    validateQueryAndGameHeaders(request);
    const body = await readEmptyBody(request);

    const envResult = (dependencies.readSupabaseEnv ?? readSupabaseEnv)();
    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const client = dependencies.createServiceClient(envResult.value);
    const now = dependencies.now?.() ?? new Date();
    const scope = await resolvePlayerRequestScope(
      request,
      {
        hashSessionToken: dependencies.hashSessionToken ?? sha256Hex,
        resolvePlayerSession: (tokenHash) =>
          (dependencies.resolvePlayerSession ?? resolveActivePlayerSession)(
            client,
            tokenHash,
          ),
        now: () => now,
      },
      { body },
    );
    const repository = dependencies.createRepository
      ? dependencies.createRepository(client)
      : new SupabasePlayerContractAcceptanceRepository(client as never);
    const result = await repository.acceptContract({
      gameId: scope.gameId,
      playerUuid: scope.playerUuid,
      contractKey: route.contractKey,
    });

    if (result.outcome === "not_available") {
      throw new PlayerContractAcceptanceError(
        "player_contract_not_available",
        "Contract is not available to the authenticated player.",
        404,
        false,
      );
    }
    if (result.outcome === "locked") {
      throw new PlayerContractAcceptanceError(
        "player_contract_progress_locked",
        "Contract progress can no longer be accepted.",
        409,
        false,
      );
    }
    if (result.progressStatus !== "in_progress") {
      throw new PlayerContractAcceptanceError(
        "player_contract_acceptance_failed",
        "Contract acceptance returned an invalid progress state.",
        500,
        false,
      );
    }

    const responseBody: PlayerContractAcceptanceResponseBody = {
      ok: true,
      alreadyAccepted: result.outcome === "already_accepted",
      contract: {
        contractKey: result.contractKey,
        status: "in_progress",
        acceptedAt: result.acceptedAt,
      },
    };
    return privateJsonResponse(200, responseBody);
  } catch (error) {
    if (
      error instanceof EdgeActivationError ||
      error instanceof PlayerContractAcceptanceError
    ) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    if (error instanceof PlayerContractAcceptancePersistenceError) {
      const unavailable =
        error.code === "player_contract_acceptance_schema_not_applied";
      return jsonError(unavailable ? 503 : 500, {
        code: unavailable
          ? "player_contract_acceptance_unavailable"
          : "player_contract_acceptance_failed",
        message: unavailable
          ? "Player Contract acceptance is temporarily unavailable."
          : "Player Contract acceptance failed.",
        retryable: unavailable,
      });
    }
    return jsonError(500, {
      code: "player_contract_acceptance_failed",
      message: "Player Contract acceptance failed.",
      retryable: false,
    });
  }
}

function validateQueryAndGameHeaders(request: Request): void {
  const url = new URL(request.url);
  let unexpected: string | null = null;
  url.searchParams.forEach((_value, key) => {
    unexpected ??= key;
  });
  if (unexpected) {
    throw invalidRequest(
      `Player Contract acceptance does not accept query parameter: ${unexpected}.`,
    );
  }
  if (GAME_SCOPE_HEADERS.some((header) => request.headers.has(header))) {
    throw invalidRequest(
      "Player Contract acceptance derives game scope from x-player-session-token.",
    );
  }
}

async function readEmptyBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const normalized = contentLength.trim();
    if (!/^\d+$/u.test(normalized) || Number(normalized) > MAX_ACCEPT_BODY_BYTES) {
      throw invalidRequest(
        `Player Contract acceptance body must not exceed ${MAX_ACCEPT_BODY_BYTES} bytes.`,
      );
    }
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_ACCEPT_BODY_BYTES) {
    throw invalidRequest(
      `Player Contract acceptance body must not exceed ${MAX_ACCEPT_BODY_BYTES} bytes.`,
    );
  }
  if (!text.trim()) return {};

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
  if (Object.keys(value).length !== 0) {
    throw invalidRequest("Player Contract acceptance does not accept request fields.");
  }
  return value;
}

function invalidRequest(message: string): PlayerContractAcceptanceError {
  return new PlayerContractAcceptanceError(
    "invalid_player_contract_acceptance_request",
    message,
    400,
    false,
  );
}

function privateJsonResponse<T>(status: number, body: T): Response {
  const response = jsonResponse<T>(status, body);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("vary", "authorization, x-player-session-token");
  return response;
}
