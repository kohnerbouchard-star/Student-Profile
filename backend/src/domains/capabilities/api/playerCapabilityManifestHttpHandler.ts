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
import {
  invalidPlayerSessionResponse,
  readPlayerSessionTokenFromRequest,
  resolveActivePlayerSession,
} from "../../players/api/playerSessionHttpHelpers.ts";
import { rejectClientSuppliedPlayerIdentity } from "../../players/api/playerRequestScope.ts";
import {
  buildPlayerCapabilityManifest,
  type PlayerCapabilityManifest,
} from "../playerCapabilityRegistry.ts";

export interface PlayerCapabilityManifestResponseBody {
  readonly ok: true;
  readonly gameSession: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  };
  readonly player: {
    readonly id: string;
    readonly displayName: string;
    readonly rosterLabel: string | null;
    readonly status: string;
  };
  readonly capabilities: PlayerCapabilityManifest;
}

export interface PlayerCapabilityManifestHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: typeof readSupabaseEnv;
  readonly hashSessionToken?: (sessionToken: string) => Promise<string>;
  readonly resolvePlayerSession?: typeof resolveActivePlayerSession;
  readonly now?: () => string;
}

export async function handlePlayerCapabilityManifestRequest(
  request: Request,
  dependencies: PlayerCapabilityManifestHttpHandlerDependencies,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to load player capabilities.",
      retryable: false,
    });
  }

  if (request.headers.has("x-stock-market-runner-secret")) {
    return jsonError(400, {
      code: "stock_runner_secret_not_allowed",
      message: "Player capability requests must not send a runner secret.",
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

    rejectClientSuppliedPlayerIdentity(request);
    const sessionToken = readPlayerSessionTokenFromRequest(request);

    if (!sessionToken) {
      return invalidPlayerSessionResponse();
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

    const generatedAt = (dependencies.now ?? (() => new Date().toISOString()))();

    return jsonResponse<PlayerCapabilityManifestResponseBody>(200, {
      ok: true,
      gameSession: {
        id: sessionResult.gameSession.id,
        name: sessionResult.gameSession.name,
        status: sessionResult.gameSession.status,
      },
      player: {
        id: sessionResult.player.id,
        displayName: sessionResult.player.display_name,
        rosterLabel: sessionResult.player.roster_label ?? null,
        status: sessionResult.player.status,
      },
      capabilities: buildPlayerCapabilityManifest(generatedAt),
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
      message: "Player capabilities could not be loaded.",
      retryable: false,
    });
  }
}
