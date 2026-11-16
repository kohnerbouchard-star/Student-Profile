import {
  createAuthClient,
  createServiceRoleClient,
  readEdgeSupabaseEnv,
  requirePublishableRequest,
} from "../_shared/econovariaAuth.ts";
import { handleStaffLoginRequest } from "../../../src/domains/auth/api/staffLoginHttpHandler.ts";
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
  withCors,
  readJson,
  json,
  errorBody,
  parseAccessExpiry,
  sessionJson,
  publicSession,
  clearSessionResponse,
  trustedClientIp,
  networkMetadataUnavailable,
  readBoundedBody,
  retryableErrorBody,
  readBoundedResponse,
  parseJsonBytes,
  responseHeaders,
  normalizeRetryAfter,
  appendSessionCookie,
} from "./sessionHttp.ts";
import {
  type StaffLoginBody,
  CSRF_HEADER,
  MAX_MFA_BODY_BYTES,
  type StaffMfaVerifyBody,
} from "./sessionContracts.ts";
import {
  loadStaffBootstrap,
  revokeAuthSession,
  resolveCurrentSession,
  resolveSession,
  mfaRouteContract,
  mfaRequestHeaders,
  ownedArrayBuffer,
} from "./sessionUpstream.ts";


export async function handleLogin(
  request: Request,
  key: Uint8Array,
  adminServiceClient: ReturnType<typeof createServiceRoleClient>,
): Promise<Response> {
  const loginResponse = await handleStaffLoginRequest(request, {
    createAuthClient,
    createServiceClient: () => adminServiceClient,
    readEnvironment: readEdgeSupabaseEnv,
  });
  if (!loginResponse.ok) return withCors(request, loginResponse);

  const login = await readJson<StaffLoginBody>(loginResponse);
  if (
    !login?.ok ||
    !login.session?.accessToken ||
    !login.session?.refreshToken ||
    !login.user?.id
  ) {
    return json(request, 502, errorBody(
      "web_session_login_failed",
      "Administrator sign-in did not return a valid session.",
    ));
  }

  const payload = createWebAdminSessionPayload({
    accessToken: login.session.accessToken,
    refreshToken: login.session.refreshToken,
    accessExpiresAt: parseAccessExpiry(
      login.session.expiresAt,
      login.session.accessToken,
    ),
    csrfToken: randomWebAdminCsrfToken(),
    mfaRequired: login.session.mfaRequired,
    user: {
      id: login.user.id,
      email: login.user.email,
      role: "game_admin",
      permissionVersion: login.user.permissionVersion,
      securityVersion: login.user.securityVersion,
    },
  });
  const bootstrap = await loadStaffBootstrap(
    payload.accessToken,
    adminServiceClient,
  );
  if (!bootstrap.ok) {
    await revokeAuthSession(payload.accessToken);
    return json(request, 403, errorBody(
      "staff_bootstrap_failed",
      "The administrator session could not be loaded.",
    ));
  }

  return sessionJson(request, 200, {
    ok: true,
    session: publicSession(
      payload,
      login.session.assuranceLevel,
      login.session.mfaRequired,
    ),
    user: {
      id: login.user.id,
      email: login.user.email,
      displayName: login.user.displayName,
      role: "game_admin",
      permissionVersion: login.user.permissionVersion,
      securityVersion: login.user.securityVersion,
    },
    activeGameSessions: bootstrap.body.activeGameSessions,
    csrfToken: payload.csrfToken,
  }, payload, key);
}


export async function handleStatus(
  request: Request,
  key: Uint8Array,
  adminServiceClient: ReturnType<typeof createServiceRoleClient>,
): Promise<Response> {
  const resolved = await resolveCurrentSession(request, key);
  if (resolved.ok === false) {
    return clearSessionResponse(request, 401, resolved.code);
  }
  const bootstrap = await loadStaffBootstrap(
    resolved.payload.accessToken,
    adminServiceClient,
  );
  if (!bootstrap.ok) {
    return clearSessionResponse(request, 401, "staff_session_invalid");
  }

  return sessionJson(request, 200, {
    ok: true,
    session: publicSession(resolved.payload),
    user: {
      ...resolved.payload.user,
      displayName: bootstrap.body.staff.displayName,
    },
    activeGameSessions: bootstrap.body.activeGameSessions,
    csrfToken: resolved.payload.csrfToken,
  }, resolved.payload, key, resolved.refreshed);
}


export async function handleLogout(
  request: Request,
  key: Uint8Array,
  supabaseUrl: string,
  publishableKey: string,
): Promise<Response> {
  const resolved = await resolveSession(request, key);
  if (resolved.ok === true) {
    await fetch(`${supabaseUrl}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${resolved.payload.accessToken}`,
      },
      cache: "no-store",
    }).catch(() => null);
  }
  return clearSessionResponse(request, 200, "signed_out", { ok: true });
}


export async function handleMfa(
  request: Request,
  route: string,
  key: Uint8Array,
  supabaseUrl: string,
  publishableKey: string,
  adminServiceClient: ReturnType<typeof createServiceRoleClient>,
): Promise<Response> {
  const routeContract = mfaRouteContract(route, request.method);
  if (!routeContract) {
    return json(request, 404, errorBody(
      "route_not_found",
      "Administrator MFA route was not found.",
    ));
  }

  const current = await resolveCurrentSession(request, key);
  if (current.ok === false) {
    return clearSessionResponse(request, 401, current.code);
  }

  if (routeContract.mutation) {
    const suppliedCsrf = String(request.headers.get(CSRF_HEADER) || "");
    if (!constantTimeTextEqual(suppliedCsrf, current.payload.csrfToken)) {
      return json(request, 403, errorBody(
        "csrf_validation_failed",
        "Administrator request verification failed.",
      ));
    }
  }

  const clientIp = trustedClientIp(request);
  if (!clientIp) return networkMetadataUnavailable(request);

  const bodyResult = await readBoundedBody(request);
  if (bodyResult.ok === false) return bodyResult.response;
  if ((bodyResult.body?.byteLength || 0) > MAX_MFA_BODY_BYTES) {
    return json(request, 413, errorBody(
      "request_body_too_large",
      "Administrator MFA request is too large.",
    ));
  }

  const upstream = await fetch(
    `${supabaseUrl}/functions/v1/staff-mfa-api${routeContract.upstreamPath}`,
    {
      method: routeContract.method,
      headers: mfaRequestHeaders(
        request,
        publishableKey,
        current.payload.accessToken,
        clientIp,
        Boolean(bodyResult.body),
      ),
      body: bodyResult.body && routeContract.mutation
        ? ownedArrayBuffer(bodyResult.body)
        : undefined,
      cache: "no-store",
      redirect: "manual",
    },
  ).catch(() => null);
  if (!upstream) {
    return json(request, 502, retryableErrorBody(
      "staff_mfa_unavailable",
      "Administrator MFA service is unavailable.",
    ));
  }

  const responseBody = await readBoundedResponse(request, upstream);
  if (responseBody.ok === false) return responseBody.response;
  const parsed = parseJsonBytes<Record<string, unknown>>(responseBody.body);

  if (upstream.status === 401 && parsed?.error && route !== "/mfa/verify") {
    return clearSessionResponse(request, 401, "staff_session_invalid");
  }

  if (route === "/mfa/verify" && upstream.ok) {
    const verified = parsed as StaffMfaVerifyBody | null;
    const accessToken = String(verified?.session?.accessToken || "");
    const refreshToken = String(verified?.session?.refreshToken || "");
    if (!accessToken || !refreshToken) {
      return json(request, 502, errorBody(
        "mfa_session_invalid",
        "MFA verification did not return a valid elevated session.",
      ));
    }

    const elevated: WebAdminSessionPayload = {
      ...current.payload,
      accessToken,
      refreshToken,
      accessExpiresAt: parseAccessExpiry(
        typeof verified?.session?.expiresAt === "string"
          ? verified.session.expiresAt
          : null,
        accessToken,
      ),
      csrfToken: randomWebAdminCsrfToken(),
    };
    const bootstrap = await loadStaffBootstrap(
      elevated.accessToken,
      adminServiceClient,
    );
    if (!bootstrap.ok) {
      return clearSessionResponse(request, 401, "staff_session_invalid");
    }
    return sessionJson(request, 200, {
      ok: true,
      verified: true,
      session: publicSession(elevated, "aal2", true),
      user: {
        ...elevated.user,
        displayName: bootstrap.body.staff.displayName,
      },
      activeGameSessions: bootstrap.body.activeGameSessions,
      csrfToken: elevated.csrfToken,
    }, elevated, key);
  }

  const headers = responseHeaders(request, upstream.headers.get("content-type"));
  const retryAfter = normalizeRetryAfter(upstream.headers.get("retry-after"));
  if (retryAfter) headers.set("Retry-After", retryAfter);
  if (current.refreshed) {
    await appendSessionCookie(headers, current.payload, key, request);
  }
  return new Response(ownedArrayBuffer(responseBody.body), {
    status: upstream.status,
    headers,
  });
}
