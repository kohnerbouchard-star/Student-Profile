import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import { resolvePlayerRequestScope } from "../../players/api/playerRequestScope.ts";
import { resolveActivePlayerSession } from "../../players/api/playerSessionHttpHelpers.ts";
import {
  createSupabasePlayerWorldRuntimeRepository,
  type PlayerWorldRuntimeSupabaseClient,
} from "../infrastructure/supabasePlayerWorldRuntimeRepository.ts";
import { createPlayerWorldRuntimeService } from "../services/playerWorldRuntimeService.ts";
import { handlePlayerWorldRuntimeRequest } from "./playerWorldRuntimeHttpHandler.ts";

export interface PlayerWorldRuntimeEdgeDependencies {
  readonly createServiceClient: () => EdgeSupabaseClient;
}

export function handlePlayerWorldRuntimeEdgeRequest(
  request: Request,
  dependencies: PlayerWorldRuntimeEdgeDependencies,
): Promise<Response> {
  const client = dependencies.createServiceClient();
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
