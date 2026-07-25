import {
  jsonError,
  jsonResponse,
} from "../../../src/platform/supabase/edgeResponse.ts";
import {
  handleStaffSignupRequest,
} from "../../../src/domains/auth/api/staffSignupHttpHandler.ts";
import {
  handleLicensingActivationRequest,
} from "../../../src/domains/licensing/api/licensingActivationHttpHandler.ts";
import {
  createAuthClient,
  createServiceClient,
  readEdgeSupabaseEnv,
  requirePublishableRequest,
} from "../_shared/econovariaAuth.ts";

interface EdgeHealthBody {
  readonly ok: true;
  readonly service: "bootstrap-api";
  readonly status: "ready";
}

Deno.serve(async (request: Request) => {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") return jsonResponse(204, null);

  if (url.pathname.endsWith("/health")) {
    return jsonResponse<EdgeHealthBody>(200, {
      ok: true,
      service: "bootstrap-api",
      status: "ready",
    });
  }

  const publishableFailure = await requirePublishableRequest(request);
  if (publishableFailure) return publishableFailure;

  const env = readEdgeSupabaseEnv();
  if (!env.ok) {
    return jsonError(500, {
      code: "bootstrap_runtime_not_configured",
      message: "The account bootstrap service is not configured.",
      retryable: false,
    });
  }

  if (url.pathname.endsWith("/staff/signup")) {
    return handleStaffSignupRequest(request, { createServiceClient });
  }

  if (url.pathname.endsWith("/licensing/activate")) {
    return handleLicensingActivationRequest(request, {
      createAuthClient,
      createServiceClient,
    });
  }

  return jsonError(404, {
    code: "route_not_found",
    message: "Bootstrap API route was not found.",
    retryable: false,
  });
});
