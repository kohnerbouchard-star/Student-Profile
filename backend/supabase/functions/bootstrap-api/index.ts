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

function allowedOrigins(): Set<string> {
  const raw = [
    environmentValue("ECONOVARIA_WEB_ALLOWED_ORIGINS"),
    environmentValue("ECONOVARIA_BROWSER_ORIGIN"),
  ].filter(Boolean).join(",");
  const values = raw.split(",").map((value) => value.trim()).filter(Boolean);
  const result = new Set<string>();
  for (const value of values) {
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && url.pathname === "/" && !url.search && !url.hash) {
        result.add(url.origin);
      }
    } catch {
    }
  }
  return result;
}

const ALLOWED_ORIGINS = allowedOrigins();

function finish(request: Request, response: Response): Response {
  const origin = String(request.headers.get("origin") || "").trim();
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

Deno.serve(async (incomingRequest: Request) => {
  const origin = String(incomingRequest.headers.get("origin") || "").trim();
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return jsonError(403, {
      code: "origin_not_allowed",
      message: "The request origin is not allowed.",
      retryable: false,
    });
  }
  const respond = (response: Response) => finish(incomingRequest, response);

  if (incomingRequest.method === "OPTIONS") return respond(jsonResponse(204, null));

  const boundary = await enforceEdgeRequestBoundary(incomingRequest, {
    allowedMethods: ["GET", "POST"],
    maxBodyBytes: 32_768,
    requireJsonBody: true,
  });
  if (!boundary.ok) return respond(boundary.response);
  const request = bindGatewayTrustedClientIp(
    boundary.request,
    environmentValue("ECONOVARIA_TRUSTED_CLIENT_IP_HEADER"),
  );
  const url = new URL(request.url);

  if (url.pathname.endsWith("/health")) {
    return respond(jsonResponse<EdgeHealthBody>(200, {
      ok: true,
      service: "bootstrap-api",
      status: "ready",
    }));
  }

  const publishableFailure = await requirePublishableRequest(request);
  if (publishableFailure) return respond(publishableFailure);

  const env = readEdgeSupabaseEnv();
  if (!env.ok) {
    return respond(jsonError(500, {
      code: "bootstrap_runtime_not_configured",
      message: "The account bootstrap service is not configured.",
      retryable: false,
    }));
  }

  if (url.pathname.endsWith("/staff/login")) {
    return respond(await handleStaffLoginRequest(request, {
      createAuthClient,
      createServiceClient,
    }));
  }

  if (url.pathname.endsWith("/staff/signup/resend")) {
    return respond(await handleStaffSignupResendRequest(request, { createServiceClient }));
  }

  if (url.pathname.endsWith("/staff/signup/cancel")) {
    return respond(await handleStaffSignupCancelRequest(request, { createServiceClient }));
  }

  if (url.pathname.endsWith("/staff/signup")) {
    return respond(await handleStaffSignupRequest(request, { createServiceClient }));
  }

  if (url.pathname.endsWith("/licensing/activate")) {
    return respond(await handleLicensingActivationRequest(request, {
      createAuthClient,
      createServiceClient,
    }));
  }

  return respond(jsonError(404, {
    code: "route_not_found",
    message: "Bootstrap API route was not found.",
    retryable: false,
  }));
});
