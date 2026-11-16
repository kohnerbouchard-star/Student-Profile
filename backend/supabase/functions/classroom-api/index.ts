import {
  jsonError,
  jsonResponse,
} from "../../../src/platform/supabase/edgeResponse.ts";
import {
  dispatchPlayerWorldRoutes,
} from "./dispatchPlayerWorldRoutes.ts";
import {
  dispatchPlayerEconomyRoutes,
} from "./dispatchPlayerEconomyRoutes.ts";
import {
  dispatchStaffRoutes,
} from "./dispatchStaffRoutes.ts";


interface EdgeHealthBody {
  readonly ok: true;
  readonly service: "classroom-api";
  readonly status: "ready";
}


Deno.serve(async (request) => {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return jsonResponse(204, null);
  }

  if (url.pathname.endsWith("/health")) {
    return jsonResponse<EdgeHealthBody>(200, {
      ok: true,
      service: "classroom-api",
      status: "ready",
    });
  }
  const dispatchPlayerWorldRoutesResponse = await dispatchPlayerWorldRoutes(request, url);
  if (dispatchPlayerWorldRoutesResponse) return dispatchPlayerWorldRoutesResponse;

  const dispatchPlayerEconomyRoutesResponse = await dispatchPlayerEconomyRoutes(request, url);
  if (dispatchPlayerEconomyRoutesResponse) return dispatchPlayerEconomyRoutesResponse;

  const dispatchStaffRoutesResponse = await dispatchStaffRoutes(request, url);
  if (dispatchStaffRoutesResponse) return dispatchStaffRoutesResponse;


  return jsonError(404, {
    code: "route_not_found",
    message: "Classroom API route was not found.",
    retryable: false,
  });
});
