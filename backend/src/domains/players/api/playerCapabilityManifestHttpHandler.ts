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
  buildPlayerCapabilityManifest,
  type PlayerCapabilityManifestResponseBody,
  type PlayerCapabilityManifestRoute,
} from "../contracts/playerCapabilityManifestContracts.ts";
import { resolveActivePlayerSession } from "./playerSessionHttpHelpers.ts";
import { resolvePlayerRequestScope } from "./playerRequestScope.ts";
import {
  handlePlayerProgressionRequest,
} from "../../progression/api/playerProgressionHttpHandler.ts";
import type {
  PlayerProgressionRoute,
} from "../../progression/contracts/progressionContracts.ts";

export interface PlayerCapabilityManifestHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: typeof readSupabaseEnv;
  readonly hashSessionToken?: (token: string) => Promise<string>;
  readonly resolvePlayerSession?: (
    client: EdgeSupabaseClient,
    tokenHash: string,
  ) => ReturnType<typeof resolveActivePlayerSession>;
  readonly now?: () => Date;
}

export async function handlePlayerCapabilityManifestRequest(
  request: Request,
  route: PlayerCapabilityManifestRoute | PlayerProgressionRoute,
  dependencies: PlayerCapabilityManifestHttpHandlerDependencies,
): Promise<Response> {
  if (
    route.kind === "read" || route.kind === "unlock" || route.kind === "claim" ||
    (route.kind === "malformed" && new URL(request.url).pathname.includes("/progression"))
  ) {
    return handlePlayerProgressionRequest(request, route as PlayerProgressionRoute, dependencies);
  }

  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to load Player API capabilities.",
      retryable: false,
    });
  }

  try {
    validateRequestShape(request, route);
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
    await resolvePlayerRequestScope(request, {
      hashSessionToken: dependencies.hashSessionToken ?? sha256Hex,
      resolvePlayerSession: (tokenHash) =>
        (dependencies.resolvePlayerSession ?? resolveActivePlayerSession)(
          client,
          tokenHash,
        ),
      now: () => now,
    });
    return playerCapabilityManifestJsonResponse({
      ok: true,
      ...buildPlayerCapabilityManifest(),
    });
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    return jsonError(500, {
      code: "player_capability_manifest_failed",
      message: "Player API capabilities could not be loaded.",
      retryable: false,
    });
  }
}

function validateRequestShape(
  request: Request,
  route: PlayerCapabilityManifestRoute,
): void {
  if (route.kind !== "manifest") {
    throw invalidRequest("Player capability manifest path is malformed.");
  }
  const url = new URL(request.url);
  if (url.searchParams.size > 0) {
    throw invalidRequest("Player capability manifest does not accept query parameters.");
  }
  for (const headerName of [
    "x-econovaria-game-id",
    "x-econovaria-game-session-id",
    "x-stock-market-runner-secret",
  ]) {
    if (request.headers.has(headerName)) {
      throw invalidRequest(
        "Player capability manifest scope derives only from the authenticated session.",
      );
    }
  }
}

function invalidRequest(message: string): EdgeActivationError {
  return new EdgeActivationError(
    "invalid_player_capability_request",
    message,
    400,
    false,
  );
}

function playerCapabilityManifestJsonResponse(
  body: PlayerCapabilityManifestResponseBody,
): Response {
  const response = jsonResponse<PlayerCapabilityManifestResponseBody>(200, body);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("vary", "authorization, x-player-session-token");
  return response;
}
