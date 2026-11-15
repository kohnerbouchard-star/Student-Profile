import {
  createAuthClient,
  createServiceRoleClient,
  readEdgeSupabaseEnv,
  requirePublishableRequest,
} from "../_shared/econovariaAuth.ts";
import { handleStaffBootstrapRequest } from "../../../src/domains/auth/api/staffBootstrapHttpHandler.ts";
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
  validProxyPath,
  json,
  errorBody,
  clearSessionResponse,
  isBoundedIdentifier,
  trustedClientIp,
  networkMetadataUnavailable,
  readBoundedBody,
  readBoundedResponse,
  responseHeaders,
  normalizeRetryAfter,
  appendSessionCookie,
  isSafeHeaderValue,
  readJson,
  parseJwtExpiry,
} from "./sessionHttp.ts";
import {
  CSRF_HEADER,
  GAME_HEADER,
  type CurrentSession,
  type TrustedClientIp,
  DEVICE_HEADER,
  FORWARDED_REQUEST_HEADERS,
  type StaffBootstrapBody,
  type RefreshBody,
} from "./sessionContracts.ts";


export async function handleProxy(
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
  if (!clientIp) return networkMetadataUnavailable(request);

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
  return new Response(
    method === "HEAD" ? null : ownedArrayBuffer(responseBody.body),
    {
      status: upstream.status,
      headers,
    },
  );
}


export async function resolveCurrentSession(
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


export function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}


export async function sendAdminRequest(
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
    body: body && !["GET", "HEAD"].includes(source.method)
      ? ownedArrayBuffer(body)
      : undefined,
    cache: "no-store",
    redirect: "manual",
  });
}


export function mfaRequestHeaders(
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


export function mfaRouteContract(
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


export async function loadStaffBootstrap(
  accessToken: string,
  adminServiceClient: ReturnType<typeof createServiceRoleClient>,
): Promise<
  | { readonly ok: true; readonly body: StaffBootstrapBody }
  | { readonly ok: false }
> {
  const request = new Request("https://web-session.internal/staff/bootstrap", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const response = await handleStaffBootstrapRequest(request, {
    createAuthClient,
    createServiceClient: () => adminServiceClient,
  });
  const body = await readJson<StaffBootstrapBody>(response);
  return response.ok && body?.ok ? { ok: true, body } : { ok: false };
}


export async function resolveSession(
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


export async function refreshIfNeeded(payload: WebAdminSessionPayload): Promise<
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


export async function refreshSession(
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


export async function revokeAuthSession(accessToken: string): Promise<void> {
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
