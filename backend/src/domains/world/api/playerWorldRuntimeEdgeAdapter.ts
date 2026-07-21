import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import { jsonError } from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import { resolvePlayerRequestScope } from "../../players/api/playerRequestScope.ts";
import { resolveActivePlayerSession } from "../../players/api/playerSessionHttpHelpers.ts";
import {
  createSupabasePlayerWorldRuntimeRepository,
  type PlayerWorldRuntimeSupabaseClient,
} from "../infrastructure/supabasePlayerWorldRuntimeRepository.ts";
import { createPlayerWorldRuntimeService } from "../services/playerWorldRuntimeService.ts";
import { handlePlayerWorldRuntimeRequest } from "./playerWorldRuntimeHttpHandler.ts";

export interface PlayerWorldRuntimeEdgeDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readEnvironment?: typeof readSupabaseEnv;
}

export function handlePlayerWorldRuntimeEdgeRequest(
  request: Request,
  dependencies: PlayerWorldRuntimeEdgeDependencies,
): Promise<Response> | Response {
  const envResult = (dependencies.readEnvironment ?? readSupabaseEnv)();
  if (!envResult.ok) {
    return jsonError(503, {
      code: "world_runtime_configuration_missing",
      message: "World runtime configuration is unavailable.",
      retryable: true,
    });
  }
  const client = dependencies.createServiceClient(envResult.value);
  const repository = createSupabasePlayerWorldRuntimeRepository(
    client as unknown as PlayerWorldRuntimeSupabaseClient,
  );
  const service = createPlayerWorldRuntimeService({
    repository,
    createPublicQuoteId: () => publicId("trq"),
    createAssignmentId: () => publicId("aca"),
  });

  return handlePlayerWorldRuntimeRequest(request, {
    resolveScope: (scopedRequest) =>
      resolvePlayerRequestScope(scopedRequest, {
        hashSessionToken: sha256Hex,
        resolvePlayerSession: (sessionTokenHash) =>
          resolveActivePlayerSession(client, sessionTokenHash),
      }),
    service,
  });
}

function publicId(prefix: "aca" | "trq"): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}
