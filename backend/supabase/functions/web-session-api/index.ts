import {
  createAuthClient,
  createServiceClient,
  readEdgeSupabaseEnv,
  requirePublishableRequest,
} from "../_shared/econovariaAuth.ts";
import { handleStaffLoginRequest } from "../../../src/domains/auth/api/staffLoginHttpHandler.ts";
import { handleStaffBootstrapRequest } from "../../../src/domains/auth/api/staffBootstrapHttpHandler.ts";
import {
  readTrustedClientIp,
  type TrustedIpHeader,
} from "../../../src/security/rateLimitKeying.ts";
import { readPlayerRateLimitConfig } from "../../../src/security/playerRateLimitService.ts";
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

const MAX_BODY_BYTES = 1_048_576;
const MAX_MFA_BODY_BYTES = 8_192;
const MAX_PROXY_PATH_BYTES = 2_048;
const CSRF_HEADER = "x-econovaria-csrf-token";
const GAME_HEADER = "x-econovaria-game-id";
const DEVICE_HEADER = "x-econovaria-device-id";
const FORWARDED_REQUEST_HEADERS = new Map([
  ["content-type", "Content-Type"],
  ["x-idempotency-key", "X-Idempotency-Key"],
  ["x-request-id", "X-Request-Id"],
]);

interface StaffLoginBody {
  readonly ok: true;
  readonly session: {
    readonly accessToken: string;
    readonly refreshToken: string;
    readonly expiresAt: string | null;
    readonly assuranceLevel: string;
    readonly mfaRequired: boolean;
  };
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string;
    readonly role: "game_admin";
    readonly permissionVersion: number;
    readonly securityVersion: number;
  };
}

interface StaffBootstrapBody {
  readonly ok: true;
  readonly staff: {
    readonly id: string;
    readonly email: string | null;
    readonly displayName: string;
  };
  readonly activeGameSessions: readonly Record<string, unknown>[];
}

interface RefreshBody {
  readonly access_token?: string;
  readonly refresh_token?: string;
  readonly expires_at?: number;
}

interface StaffMfaVerifyBody {
  readonly ok?: unknown;
  readonly session?: {
    readonly accessToken?: unknown;
    readonly refreshToken?: unknown;
    readonly assuranceLevel?: unknown;
    readonly expiresAt?: unknown;
  };
}

interface CurrentSession {
  readonly ok: true;
  readonly payload: WebAdminSessionPayload;
  readonly refreshed: boolean;
}

interface TrustedClientIp {
  readonly header: TrustedIpHeader;
  readonly address: string;
}

Deno.serve(async (request: Request) => {
  const route = routePath(new URL(request.url).pathname);

  if (request.method === "OPTIONS") return preflightResponse(request);
  if (route === "/health" && request.method === "GET") {
    return json(request, 200, {
      ok: true,
      service: "web-session-api",
      status: "ready",
    });
  }

  const originFailure = requireAllowedOrigin(request);
  if (originFailure) return originFailure;
  const publishableFailure = await requirePublishableRequest(request);
  if (publishableFailure) return withCors(request, publishableFailure);

  const env = readEdgeSupabaseEnv();
  if (!env.ok) return serviceUnavailable(request);

  let key: Uint8Array;
  try {
    key = readWebAdminSessionKey();
  } catch {
    return serviceUnavailable(request);
  }

  try {
    if (route === "/login") {
      return request.method === "POST"
        ? handleLogin(request, key)
        : methodNotAllowed(request, "POST");
    }
    if (route === "/status") {
      return request.method === "GET"
        ? handleStatus(request, key)
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

async function handleLogin(request: Request, key: Uint8Array): Promise<Response> {
  const loginResponse = await handleStaffLoginRequest(request, {
    createAuthClient,
    createServiceClient,
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
  const bootstrap = await loadStaffBootstrap(payload.accessToken);
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

async function handleStatus(request: Request, key: Uint8Array): Promise<Response> {
  const resolved = await resolveCurrentSession(request, key);
  if (resolved.ok === false) {
    return clearSessionResponse(request, 401, resolved.code);
  }
  const bootstrap = await loadStaffBootstrap(resolved.payload.accessToken);
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

async function handleLogout(
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

async function handleMfa(
  request: Request,
  route: string,
  key: Uint8Array,
  supabaseUrl: string,
  publishableKey: string,
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
  if (!clientIp) {
    return json(request, 400, errorBody(
      "trusted_client_ip_unavailable",
      "Trusted client network metadata is unavailable.",
    ));
  }

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
        ? bodyResult.body
        : undefined,
      cache: "no-store",
      redirect: "manual",
    },
  ).catch(() => null);
  if (!upstream) {
    return json(request, 502, errorBody(
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
    const bootstrap = await loadStaffBootstrap(elevated.accessToken);
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
  return new Response(responseBody.body, {
    status: upstream.status,
    headers,
  });
}

async function handleProxy(
  request: Request,
  suffix: string,
  key: Uint8Array,
  supabaseUrl: string,
  publishableKey: string,
): Promise<Response> {
  if (!validProxyPath(suffix)) {
    return json(request, 400, errorBody(
      "invalid_proxy_path",
      "Administrator request path is invalid.",
    ));
  }

  let current = await resolveCurrentSession(request, key);
  if (current.ok === false) {
    return clearSessionResponse(request, 401, current.code);
  }

  const method = request.method.toUpperCase();
  const isMutation = !["GET", "HEAD"].includes(method);
  if (isMutation) {
    const suppliedCsrf = String(request.headers.get(CSRF_HEADER) || "");
    if (!constantTimeTextEqual(suppliedCsrf, current.payload.csrfToken)) {
      return json(request, 403, errorBody(
        "csrf_validation_failed",
        "Administrator request verification failed.",
      ));
    }
  }

  const selectedGameId = String(request.headers.get(GAME_HEADER) || "").trim();
  if (selectedGameId && !isBoundedIdentifier(selectedGameId)) {
    return json(request, 400, errorBody(
      "invalid_game_scope",
      "Administrator game scope is invalid.",
    ));
  }
  const clientIp = trustedClientIp(request);
  if (!clientIp) {
    return json(request, 400, errorBody(
      "trusted_client_ip_unavailable",
      "Trusted client network metadata is unavailable.",
    ));
  }

  const bodyResult = await readBoundedBody(request);
  if (bodyResult.ok === false) return bodyResult.response;
  const target = `${supabaseUrl}/functions/v1/admin-api${suffix}${new URL(request.url).search}`;

  let upstream = await sendAdminRequest(
    target,
    request,
    bodyResult.body,
    current.payload.accessToken,
    publishableKey,
    selectedGameId,
    clientIp,
  );
  if (upstream.status === 401 && current.payload.refreshToken) {
    const refreshed = await refreshSession(
      current.payload,
      supabaseUrl,
      publishableKey,
    );
    if (refreshed.ok === false) {
      return clearSessionResponse(request, 401, refreshed.code);
    }
    current = refreshed;
    upstream = await sendAdminRequest(
      target,
      request,
      bodyResult.body,
      current.payload.accessToken,
      publishableKey,
      selectedGameId,
      clientIp,
    );
  }

  if (upstream.status === 401) {
    return clearSessionResponse(request, 401, "staff_session_invalid");
  }

  const responseBody = await readBoundedResponse(request, upstream);
  if (responseBody.ok === false) return responseBody.response;
  const headers = responseHeaders(request, upstream.headers.get("content-type"));
  const retryAfter = normalizeRetryAfter(upstream.headers.get("retry-after"));
  if (retryAfter) headers.set("Retry-After", retryAfter);
  if (current.refreshed) {
    await appendSessionCookie(headers, current.payload, key, request);
  }
  return new Response(method === "HEAD" ? null : responseBody.body, {
    status: upstream.status,
    headers,
  });
}

async function resolveCurrentSession(
  request: Request,
  key: Uint8Array,
): Promise<
  | CurrentSession
  | { readonly ok: false; readonly code: string }
> {
  const resolved = await resolveSession(request, key);
  if (resolved.ok === false) return resolved;
  return refreshIfNeeded(resolved.payload);
}

async function sendAdminRequest(
  target: string,
  source: Request,
  body: Uint8Array | null,
  accessToken: string,
  publishableKey: string,
  selectedGameId: string,
  clientIp: TrustedClientIp,
): Promise<Response> {
  const headers = new Headers({
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
    [clientIp.header]: clientIp.address,
  });
  if (selectedGameId) headers.set("X-Econovaria-Game-Id", selectedGameId);
  const deviceId = source.headers.get(DEVICE_HEADER);
  if (deviceId && isSafeHeaderValue(deviceId)) {
    headers.set(DEVICE_HEADER, deviceId);
  }
  for (const [sourceName, targetName] of FORWARDED_REQUEST_HEADERS) {
    const value = source.headers.get(sourceName);
    if (value && isSafeHeaderValue(value)) headers.set(targetName, value);
  }
  return fetch(target, {
    method: source.method,
    headers,
    body: body && !["GET", "HEAD"].includes(source.method) ? body : undefined,
    cache: "no-store",
    redirect: "manual",
  });
}

function mfaRequestHeaders(
  source: Request,
  publishableKey: string,
  accessToken: string,
  clientIp: TrustedClientIp,
  hasBody: boolean,
): Headers {
  const headers = new Headers({
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
    [clientIp.header]: clientIp.address,
  });
  const deviceId = source.headers.get(DEVICE_HEADER);
  if (deviceId && isSafeHeaderValue(deviceId)) {
    headers.set(DEVICE_HEADER, deviceId);
  }
  if (hasBody) headers.set("Content-Type", "application/json");
  return headers;
}

function mfaRouteContract(
  route: string,
  method: string,
): {
  readonly method: "GET" | "POST";
  readonly mutation: boolean;
  readonly upstreamPath: string;
} | null {
  const normalizedMethod = method.toUpperCase();
  if (route === "/mfa" && normalizedMethod === "GET") {
    return { method: "GET", mutation: false, upstreamPath: "/staff/mfa" };
  }
  if (route === "/mfa/enroll" && normalizedMethod === "POST") {
    return {
      method: "POST",
      mutation: true,
      upstreamPath: "/staff/mfa/enroll",
    };
  }
  if (route === "/mfa/verify" && normalizedMethod === "POST") {
    return {
      method: "POST",
      mutation: true,
      upstreamPath: "/staff/mfa/verify",
    };
  }
  return null;
}

async function loadStaffBootstrap(accessToken: string): Promise<
  | { readonly ok: true; readonly body: StaffBootstrapBody }
  | { readonly ok: false }
> {
  const request = new Request("https://web-session.internal/staff/bootstrap", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const response = await handleStaffBootstrapRequest(request, {
    createAuthClient,
    createServiceClient,
  });
  const body = await readJson<StaffBootstrapBody>(response);
  return response.ok && body?.ok ? { ok: true, body } : { ok: false };
}

async function resolveSession(
  request: Request,
  key: Uint8Array,
): Promise<
  | { readonly ok: true; readonly payload: WebAdminSessionPayload }
  | { readonly ok: false; readonly code: string }
> {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const envelope = cookies.get(WEB_ADMIN_SESSION_COOKIE) ||
    cookies.get(WEB_ADMIN_SESSION_LOCAL_COOKIE) || "";
  if (!envelope) return { ok: false, code: "staff_session_missing" };
  try {
    return { ok: true, payload: await openWebAdminSession(envelope, key) };
  } catch {
    return { ok: false, code: "staff_session_invalid" };
  }
}

async function refreshIfNeeded(payload: WebAdminSessionPayload): Promise<
  | CurrentSession
  | { readonly ok: false; readonly code: string }
> {
  const now = Math.floor(Date.now() / 1000);
  if (payload.accessExpiresAt > now + 120) {
    return { ok: true, payload, refreshed: false };
  }
  const env = readEdgeSupabaseEnv();
  if (!env.ok) return { ok: false, code: "staff_session_refresh_failed" };
  return refreshSession(payload, env.value.supabaseUrl, env.value.supabaseAnonKey);
}

async function refreshSession(
  payload: WebAdminSessionPayload,
  supabaseUrl: string,
  publishableKey: string,
): Promise<
  | CurrentSession
  | { readonly ok: false; readonly code: string }
> {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: payload.refreshToken }),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return { ok: false, code: "staff_session_refresh_failed" };
  const refreshed = await readJson<RefreshBody>(response);
  if (!refreshed?.access_token || !refreshed.refresh_token) {
    return { ok: false, code: "staff_session_refresh_failed" };
  }
  return {
    ok: true,
    refreshed: true,
    payload: {
      ...payload,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      accessExpiresAt: refreshed.expires_at || parseJwtExpiry(refreshed.access_token),
    },
  };
}

async function revokeAuthSession(accessToken: string): Promise<void> {
  const env = readEdgeSupabaseEnv();
  if (!env.ok) return;
  await fetch(`${env.value.supabaseUrl}/auth/v1/logout?scope=local`, {
    method: "POST",
    headers: {
      apikey: env.value.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  }).catch(() => null);
}

function routePath(pathname: string): string {
  const marker = "/web-session-api";
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || "/" : pathname;
}

function validProxyPath(suffix: string): boolean {
  return suffix.startsWith("/") &&
    !suffix.includes("\\") &&
    !suffix.split("/").includes("..") &&
    new TextEncoder().encode(suffix).byteLength <= MAX_PROXY_PATH_BYTES;
}

function requireAllowedOrigin(request: Request): Response | null {
  const origin = String(request.headers.get("origin") || "").trim();
  if (!origin || !allowedOrigins().has(origin)) {
    return json(request, 403, errorBody(
      "origin_not_allowed",
      "The request origin is not allowed.",
    ));
  }
  return null;
}

function allowedOrigins(): ReadonlySet<string> {
  const configured = String(Deno.env.get("ECONOVARIA_WEB_ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set([
    "http://127.0.0.1:4173",
    "http://localhost:4173",
    ...configured,
  ]);
}

function trustedClientIp(request: Request): TrustedClientIp | null {
  try {
    const trustedIpHeader = readPlayerRateLimitConfig().trustedIpHeader;
    return {
      header: trustedIpHeader,
      address: readTrustedClientIp(request, trustedIpHeader),
    };
  } catch {
    return null;
  }
}

function publicSession(
  payload: WebAdminSessionPayload,
  assuranceLevel = String(parseJwtClaim(payload.accessToken, "aal") || "aal1"),
  mfaRequired = payload.mfaRequired,
) {
  return {
    authenticated: true,
    expiresAt: new Date(payload.accessExpiresAt * 1000).toISOString(),
    absoluteExpiresAt: new Date(payload.absoluteExpiresAt * 1000).toISOString(),
    assuranceLevel,
    mfaRequired,
  };
}

function parseAccessExpiry(value: string | null, token: string): number {
  const parsed = value ? Math.floor(Date.parse(value) / 1000) : 0;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : parseJwtExpiry(token);
}

function parseJwtExpiry(token: string): number {
  const value = Number(parseJwtClaim(token, "exp"));
  if (!Number.isSafeInteger(value) || value <= Math.floor(Date.now() / 1000)) {
    throw new Error("JWT expiry is invalid.");
  }
  return value;
}

function parseJwtClaim(token: string, claim: string): unknown {
  try {
    const segment = token.split(".")[1];
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded))?.[claim];
  } catch {
    return null;
  }
}

async function readBoundedBody(request: Request): Promise<
  | { readonly ok: true; readonly body: Uint8Array | null }
  | { readonly ok: false; readonly response: Response }
> {
  if (["GET", "HEAD"].includes(request.method)) return { ok: true, body: null };
  const declared = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { ok: false, response: json(request, 413, errorBody(
      "request_body_too_large",
      "Administrator request body is too large.",
    )) };
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) {
    return { ok: false, response: json(request, 413, errorBody(
      "request_body_too_large",
      "Administrator request body is too large.",
    )) };
  }
  return { ok: true, body: bytes };
}

async function readBoundedResponse(
  request: Request,
  response: Response,
): Promise<
  | { readonly ok: true; readonly body: Uint8Array }
  | { readonly ok: false; readonly response: Response }
> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) {
    return { ok: false, response: json(request, 502, errorBody(
      "upstream_response_too_large",
      "Administrator response was too large.",
    )) };
  }
  return { ok: true, body: bytes };
}

function parseJsonBytes<T>(bytes: Uint8Array): T | null {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as T;
  } catch {
    return null;
  }
}

function sessionJson(
  request: Request,
  status: number,
  body: unknown,
  payload: WebAdminSessionPayload,
  key: Uint8Array,
  forceCookie = true,
): Promise<Response> {
  const headers = responseHeaders(request, "application/json");
  return (async () => {
    if (forceCookie) await appendSessionCookie(headers, payload, key, request);
    return new Response(JSON.stringify(body), { status, headers });
  })();
}

async function appendSessionCookie(
  headers: Headers,
  payload: WebAdminSessionPayload,
  key: Uint8Array,
  request: Request,
): Promise<void> {
  const envelope = await sealWebAdminSession(payload, key);
  const local = isLocalOrigin(request.headers.get("origin"));
  const name = local ? WEB_ADMIN_SESSION_LOCAL_COOKIE : WEB_ADMIN_SESSION_COOKIE;
  headers.append(
    "Set-Cookie",
    `${name}=${envelope}; Path=/; Max-Age=${WEB_ADMIN_SESSION_ABSOLUTE_SECONDS}; HttpOnly; ${local ? "" : "Secure; "}SameSite=Strict`,
  );
}

function clearSessionResponse(
  request: Request,
  status: number,
  code: string,
  body: unknown = errorBody(code, "Administrator sign-in is required."),
): Response {
  const headers = responseHeaders(request, "application/json");
  headers.append(
    "Set-Cookie",
    `${WEB_ADMIN_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
  );
  headers.append(
    "Set-Cookie",
    `${WEB_ADMIN_SESSION_LOCAL_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`,
  );
  return new Response(JSON.stringify(body), { status, headers });
}

function json(request: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(request, "application/json"),
  });
}

function responseHeaders(request: Request, contentType: string | null): Headers {
  const origin = String(request.headers.get("origin") || "");
  const headers = new Headers({
    "Content-Type": normalizeContentType(contentType),
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-site",
    Vary: "Origin",
  });
  if (allowedOrigins().has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  return headers;
}

function preflightResponse(request: Request): Response {
  const origin = String(request.headers.get("origin") || "");
  if (!allowedOrigins().has(origin)) return new Response(null, { status: 403 });
  const headers = responseHeaders(request, "text/plain");
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    `apikey,content-type,${CSRF_HEADER},${GAME_HEADER},${DEVICE_HEADER},x-idempotency-key,x-request-id`,
  );
  headers.set("Access-Control-Max-Age", "600");
  return new Response(null, { status: 204, headers });
}

function withCors(request: Request, response: Response): Response {
  const headers = responseHeaders(request, response.headers.get("content-type"));
  const retryAfter = normalizeRetryAfter(response.headers.get("retry-after"));
  if (retryAfter) headers.set("Retry-After", retryAfter);
  return new Response(response.body, { status: response.status, headers });
}

function methodNotAllowed(request: Request, expected: string): Response {
  return json(request, 405, errorBody(
    "method_not_allowed",
    `Use ${expected} for this administrator web-session route.`,
  ));
}

function serviceUnavailable(request: Request): Response {
  return json(request, 503, errorBody(
    "web_session_unavailable",
    "Administrator web sessions are unavailable.",
  ));
}

function errorBody(code: string, message: string) {
  return { ok: false, error: { code, message, retryable: false } };
}

function normalizeContentType(value: string | null): string {
  const type = String(value || "").split(";", 1)[0].trim().toLowerCase();
  if (type === "text/csv") return "text/csv; charset=utf-8";
  if (type === "application/octet-stream") return type;
  return "application/json; charset=utf-8";
}

function normalizeRetryAfter(value: string | null): string | null {
  const candidate = String(value || "").trim();
  if (!/^\d{1,5}$/u.test(candidate)) return null;
  const seconds = Number(candidate);
  return seconds <= 86_400 ? String(seconds) : null;
}

function isBoundedIdentifier(value: string): boolean {
  return value.length <= 128 && /^[A-Za-z0-9._:-]+$/u.test(value);
}

function isSafeHeaderValue(value: string): boolean {
  return value.length <= 8_192 && !/[\r\n\u0000]/u.test(value);
}

function isLocalOrigin(origin: string | null): boolean {
  try {
    const url = new URL(String(origin || ""));
    return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
}
