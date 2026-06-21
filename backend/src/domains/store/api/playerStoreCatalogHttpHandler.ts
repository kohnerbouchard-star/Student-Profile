import {
  type EdgeErrorBody,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import { extractBearerToken } from "../../../platform/supabase/edgeAuth.ts";
import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import {
  type EdgeSupabaseClient,
  type SupabaseEnv,
  readSupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  invalidPlayerSessionResponse,
  resolveActivePlayerSession,
} from "../../players/api/playerSessionHttpHelpers.ts";
import {
  handleListStoreCatalogRoute,
} from "./storeCatalogRouteHandler.ts";
import type {
  StoreCatalogRouteResult,
} from "../contracts/storeCatalogContracts.ts";
import {
  SupabaseStoreCatalogRepository,
} from "../infrastructure/supabaseStoreCatalogRepository.ts";

interface PlayerStoreCatalogDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
}

type PlayerRequestResolution =
  | {
      readonly ok: true;
      readonly serviceClient: EdgeSupabaseClient;
      readonly gameSession: { readonly id: string };
      readonly player: { readonly id: string };
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly error: EdgeErrorBody["error"];
    };

export async function handlePlayerStoreCatalogRequest(
  request: Request,
  dependencies: PlayerStoreCatalogDependencies,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to load store items.",
      retryable: false,
    });
  }

  try {
    const envResult = readSupabaseEnv();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const sessionResult = await resolvePlayerRequest(request, dependencies, envResult.value);

    if (!sessionResult.ok) {
      return jsonError(sessionResult.status, sessionResult.error);
    }

    const storeCatalogRepository = new SupabaseStoreCatalogRepository(
      sessionResult.serviceClient as any,
    );

    return storeCatalogRouteResultToResponse(
      await handleListStoreCatalogRoute(
        {
          gameSessionId: sessionResult.gameSession.id,
          audience: "player",
        },
        { storeCatalogRepository },
      ),
    );
  } catch {
    return jsonError(500, {
      code: "player_store_catalog_failed",
      message: "Store items could not be loaded.",
      retryable: false,
    });
  }
}

async function resolvePlayerRequest(
  request: Request,
  dependencies: PlayerStoreCatalogDependencies,
  env: SupabaseEnv,
): Promise<PlayerRequestResolution> {
  const sessionToken = extractBearerToken(request.headers.get("authorization"));

  if (!sessionToken) {
    return invalidPlayerSessionResponse();
  }

  const serviceClient = dependencies.createServiceClient(env);
  const sessionTokenHash = await sha256Hex(sessionToken);
  const playerSession = await resolveActivePlayerSession(serviceClient, sessionTokenHash);

  if (!playerSession.ok) {
    return playerSession;
  }

  return {
    ok: true,
    serviceClient,
    gameSession: { id: playerSession.gameSession.id },
    player: { id: playerSession.player.id },
  };
}

function storeCatalogRouteResultToResponse(
  result: StoreCatalogRouteResult,
): Response {
  if (result.ok) {
    return jsonResponse(result.status, {
      ok: true,
      ...result.body,
    });
  }

  return jsonError(result.status, {
    code: result.body.error.code,
    message: result.body.error.message,
    retryable: false,
  });
}
