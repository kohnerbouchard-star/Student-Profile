import {
  jsonError,
  jsonResponse,
} from "../../../src/platform/supabase/edgeResponse.ts";
import {
  handleStaffLoginRequest,
} from "../../../src/domains/auth/api/staffLoginHttpHandler.ts";
import {
  handleStaffSignupRequest,
} from "../../../src/domains/auth/api/staffSignupHttpHandler.ts";
import {
  handleStaffSignupResendRequest,
} from "../../../src/domains/auth/api/staffSignupResendHttpHandler.ts";
import {
  handleStaffSignupCancelRequest,
} from "../../../src/domains/auth/api/staffSignupCancelHttpHandler.ts";
import {
  handleLicensingActivationRequest,
} from "../../../src/domains/licensing/api/licensingActivationHttpHandler.ts";
import {
  enforceEdgeRequestBoundary,
} from "../../../src/security/edgeRequestBoundary.ts";
import {
  bindGatewayTrustedClientIp,
} from "../../../src/security/edgeGatewayClientIp.ts";
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

function environmentValue(name: string): string {
  try {
    return String(Deno.env.get(name) || "").trim();
  } catch {
    return "";
  }
}

Deno.serve(async (incomingRequest: Request) => {
  if (incomingRequest.method === "OPTIONS") return jsonResponse(204, null);

  const boundary = await enforceEdgeRequestBoundary(incomingRequest, {
    allowedMethods: ["GET", "POST"],
    maxBodyBytes: 32_768,
    requireJsonBody: true,
  });
  if (!boundary.ok) return boundary.response;
  const request = bindGatewayTrustedClientIp(
    boundary.request,
    environmentValue("ECONOVARIA_TRUSTED_CLIENT_IP_HEADER"),
  );
  const url = new URL(request.url);

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

  if (url.pathname.endsWith("/staff/login")) {
    return handleStaffLoginRequest(request, {
      createAuthClient,
      createServiceClient,
    });
  }

  if (url.pathname.endsWith("/staff/signup/resend")) {
    return handleStaffSignupResendRequest(request, { createServiceClient });
  }

  if (url.pathname.endsWith("/staff/signup/cancel")) {
    return handleStaffSignupCancelRequest(request, { createServiceClient });
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
