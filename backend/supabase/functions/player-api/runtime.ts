import {
  jsonError,
  jsonResponse,
} from "../../../src/platform/supabase/edgeResponse.ts";
import {
  createServiceClient,
  readEdgeSupabaseEnv,
  requirePublishableRequest,
} from "../_shared/econovariaAuth.ts";
import {
  dispatchPlayerWorldRoutes,
} from "./dispatchPlayerWorldRoutes.ts";
import {
  dispatchPlayerEconomyRoutes,
} from "./dispatchPlayerEconomyRoutes.ts";

interface EdgeHealthBody {
  readonly ok: true;
  readonly service: "player-api";
  readonly status: "ready";
}


Deno.serve(async (request: Request) => {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") return jsonResponse(204, null);

  if (url.pathname.endsWith("/health")) {
    return jsonResponse<EdgeHealthBody>(200, {
      ok: true,
      service: "player-api",
      status: "ready",
    });
  }

  const publishableFailure = await requirePublishableRequest(request);
  if (publishableFailure) return publishableFailure;

  const env = readEdgeSupabaseEnv();
  if (!env.ok) {
    return jsonError(500, {
      code: "player_runtime_not_configured",
      message: "The Player API runtime is not configured.",
      retryable: false,
    });
  }
  const dispatchPlayerWorldRoutesResponse = await dispatchPlayerWorldRoutes(request, url);
  if (dispatchPlayerWorldRoutesResponse) return dispatchPlayerWorldRoutesResponse;

  const dispatchPlayerEconomyRoutesResponse = await dispatchPlayerEconomyRoutes(request, url);
  if (dispatchPlayerEconomyRoutesResponse) return dispatchPlayerEconomyRoutesResponse;


  return jsonError(404, {
    code: "route_not_found",
    message: "Player API route was not found.",
    retryable: false,
  });
});
