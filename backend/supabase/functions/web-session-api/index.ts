import {
  createAuthClient,
  createServiceRoleClient,
  readEdgeSupabaseEnv,
  requirePublishableRequest,
} from "../_shared/econovariaAuth.ts";
import {
  authorizeAdminBffRequest,
} from "../../../src/security/adminBffRequestAuth.ts";
import {
  constantTimeTextEqual,
  createWebAdminSessionPayload,
  openWebAdminSession,
  parseCookieHeader,
  randomWebAdminCsrfToken,
  readWebAdminSessionKey,
  sealWebAdminSession,
  WEB_ADMIN_SESSION_ABSOLUTE_SECONDS,
  WEB_ADMIN_SESSION_COOKIE,
  WEB_ADMIN_SESSION_LOCAL_COOKIE,
  type WebAdminSessionPayload,
} from "../../../src/security/webAdminSession.ts";
import {
  routePath,
  preflightResponse,
  json,
  requireAllowedOrigin,
  withCors,
  serviceUnavailable,
  methodNotAllowed,
  errorBody,
} from "./sessionHttp.ts";
import {
  readAdminServiceRoleKey,
} from "./sessionContracts.ts";
import {
  handleLogin,
  handleStatus,
  handleLogout,
  handleMfa,
} from "./sessionActions.ts";
import {
  handleProxy,
} from "./sessionUpstream.ts";


Deno.serve(async (incomingRequest: Request) => {
  const route = routePath(new URL(incomingRequest.url).pathname);

  if (incomingRequest.method === "OPTIONS") return preflightResponse(incomingRequest);
  if (route === "/health" && incomingRequest.method === "GET") {
    return json(incomingRequest, 200, {
      ok: true,
      service: "web-session-api",
      status: "ready",
    });
  }

  const originFailure = requireAllowedOrigin(incomingRequest);
  if (originFailure) return originFailure;
  const publishableFailure = await requirePublishableRequest(incomingRequest);
  if (publishableFailure) return withCors(incomingRequest, publishableFailure);

  const env = readEdgeSupabaseEnv();
  if (!env.ok) return serviceUnavailable(incomingRequest);

  const serviceRoleKey = readAdminServiceRoleKey();
  if (!serviceRoleKey) return serviceUnavailable(incomingRequest);
  const adminServiceClient = createServiceRoleClient(
    env.value.supabaseUrl,
    serviceRoleKey,
    "econovaria-admin-bff-service-role-v1",
  );
  const authorization = await authorizeAdminBffRequest(incomingRequest, {
    supabaseUrl: env.value.supabaseUrl,
    dependencies: {
      claimNonce: async (claim) => {
        const { data, error } = await adminServiceClient.rpc<boolean>(
          "claim_internal_runner_nonce_v2",
          {
            p_runner_name: claim.runnerName,
            p_nonce_hash: claim.nonceHash,
            p_timestamp_seconds: claim.timestampSeconds,
            p_expires_at: claim.expiresAt,
          },
        );
        if (error) throw new Error("ADMIN_BFF_NONCE_CLAIM_FAILED");
        return data === true;
      },
    },
  });
  if (!authorization.ok) {
    return withCors(incomingRequest, authorization.response);
  }
  const request = authorization.request;

  let key: Uint8Array;
  try {
    key = readWebAdminSessionKey();
  } catch {
    return serviceUnavailable(request);
  }

  try {
    if (route === "/login") {
      return request.method === "POST"
        ? handleLogin(request, key, adminServiceClient)
        : methodNotAllowed(request, "POST");
    }
    if (route === "/status") {
      return request.method === "GET"
        ? handleStatus(request, key, adminServiceClient)
        : methodNotAllowed(request, "GET");
    }
    if (route === "/logout") {
      return request.method === "POST"
        ? handleLogout(
          request,
          key,
          env.value.supabaseUrl,
          env.value.supabaseAnonKey,
        )
        : methodNotAllowed(request, "POST");
    }
    if (route === "/mfa" || route.startsWith("/mfa/")) {
      return handleMfa(
        request,
        route,
        key,
        env.value.supabaseUrl,
        env.value.supabaseAnonKey,
        adminServiceClient,
      );
    }
    if (route.startsWith("/proxy/")) {
      return handleProxy(
        request,
        route.slice("/proxy".length),
        key,
        env.value.supabaseUrl,
        env.value.supabaseAnonKey,
      );
    }
    return json(request, 404, errorBody(
      "route_not_found",
      "Administrator web-session route was not found.",
    ));
  } catch {
    return json(request, 500, errorBody(
      "web_session_failed",
      "Administrator web-session processing failed.",
    ));
  }
});
