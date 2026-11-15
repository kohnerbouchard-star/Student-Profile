import {
  json,
  errorBody,
  safePlayer,
  safeGame,
  responseHeaders,
  routePath,
  preflight,
  runtime,
  trustedClientIp,
  requireRequestBoundary,
} from "./stagingCompatV2Http.ts";
import {
  readBody,
  callClassroom,
  forward,
  parseJson,
  loadBootstrap,
  revoke,
  publicSession,
} from "./stagingCompatV2Upstream.ts";
import {
  MAX_LOGIN_BODY_BYTES,
  type JsonObject,
  type SessionPayload,
  MAX_SESSION_SECONDS,
  type SafePlayer,
  type SafeGame,
  CSRF_HEADER,
  encoder,
  MAX_PROXY_PATH_BYTES,
  MAX_BODY_BYTES,
} from "./stagingCompatV2Contracts.ts";
import {
  encodeBase64Url,
  setSessionCookie,
  resolveSession,
  clearCookies,
  constantTimeEqual,
  ownedBuffer,
  sessionKey,
} from "./stagingCompatV2Session.ts";


async function handleLogin(request: Request, key: Uint8Array): Promise<Response> {
  if (!/^application\/json(?:\s*;|$)/iu.test(String(request.headers.get("content-type") || ""))) {
    return json(request, 415, errorBody("unsupported_media_type", "Player login requires application/json."));
  }
  let body: Uint8Array | null;
  try {
    body = await readBody(request, MAX_LOGIN_BODY_BYTES);
  } catch {
    return json(request, 413, errorBody("request_body_too_large", "Player login body is too large."));
  }
  const upstream = await callClassroom(request, "/players/login", body);
  if (!upstream) return json(request, 502, errorBody("player_login_unavailable", "Player sign-in is unavailable.", true));
  if (!upstream.response.ok) return forward(request, upstream.response, upstream.bytes);
  const login = parseJson(upstream.bytes);
  const session = login?.session as JsonObject | undefined;
  const token = String(session?.token || "");
  const expiresAt = String(session?.expiresAt || "");
  if (login?.ok !== true || !token || !expiresAt || !safePlayer(login.player) || !safeGame(login.gameSession)) {
    return json(request, 502, errorBody("player_login_response_invalid", "Player sign-in returned an invalid session."));
  }
  const bootstrap = await loadBootstrap(request, token);
  if (!bootstrap) {
    await revoke(request, token);
    return json(request, 502, errorBody("player_session_bootstrap_failed", "The Player session could not be loaded.", true));
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const upstreamExpiry = Math.floor(Date.parse(String((bootstrap.session as JsonObject).expiresAt || expiresAt)) / 1000);
  if (!Number.isSafeInteger(upstreamExpiry) || upstreamExpiry <= issuedAt) {
    await revoke(request, token);
    return json(request, 502, errorBody("player_session_expiry_invalid", "The Player session expiry is invalid."));
  }
  const payload: SessionPayload = {
    schemaVersion: "econovaria-player-web-session-v1",
    sessionToken: token,
    sessionExpiresAt: upstreamExpiry,
    absoluteExpiresAt: Math.min(upstreamExpiry, issuedAt + MAX_SESSION_SECONDS),
    issuedAt,
    csrfToken: encodeBase64Url(crypto.getRandomValues(new Uint8Array(32))),
    player: bootstrap.player as SafePlayer,
    gameSession: bootstrap.gameSession as SafeGame,
  };
  const headers = responseHeaders(request);
  await setSessionCookie(request, headers, payload, key);
  return new Response(JSON.stringify(publicSession(payload, bootstrap)), { status: 200, headers });
}


async function handleStatus(request: Request, key: Uint8Array): Promise<Response> {
  const payload = await resolveSession(request, key);
  if (!payload) {
    const headers = responseHeaders(request);
    clearCookies(headers);
    return new Response(JSON.stringify(errorBody("player_session_invalid", "Player sign-in is required.")), { status: 401, headers });
  }
  const bootstrap = await loadBootstrap(request, payload.sessionToken);
  if (!bootstrap) {
    const headers = responseHeaders(request);
    clearCookies(headers);
    return new Response(JSON.stringify(errorBody("player_session_invalid", "Player sign-in is required.")), { status: 401, headers });
  }
  return json(request, 200, publicSession(payload, bootstrap));
}


async function handleLogout(request: Request, key: Uint8Array): Promise<Response> {
  const payload = await resolveSession(request, key);
  const headers = responseHeaders(request);
  if (!payload) {
    clearCookies(headers);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }
  if (!constantTimeEqual(String(request.headers.get(CSRF_HEADER) || ""), payload.csrfToken)) {
    return json(request, 403, errorBody("csrf_validation_failed", "Player request verification failed."));
  }
  const revoked = await revoke(request, payload.sessionToken);
  clearCookies(headers);
  return new Response(JSON.stringify(
    revoked ? { ok: true } : errorBody("player_session_revocation_failed", "Server revocation could not be confirmed.", true),
  ), { status: revoked ? 200 : 502, headers });
}


function validProxyPath(suffix: string): boolean {
  return suffix.startsWith("/players/") && suffix !== "/players/login" &&
    !suffix.includes("\\") && !suffix.split("/").includes("..") &&
    encoder.encode(suffix).byteLength <= MAX_PROXY_PATH_BYTES;
}


async function handleProxy(request: Request, suffix: string, key: Uint8Array): Promise<Response> {
  if (!validProxyPath(suffix)) return json(request, 400, errorBody("invalid_proxy_path", "Player proxy path is invalid."));
  const payload = await resolveSession(request, key);
  if (!payload) {
    const headers = responseHeaders(request);
    clearCookies(headers);
    return new Response(JSON.stringify(errorBody("player_session_invalid", "Player sign-in is required.")), { status: 401, headers });
  }
  if (!["GET", "HEAD"].includes(request.method.toUpperCase()) &&
    !constantTimeEqual(String(request.headers.get(CSRF_HEADER) || ""), payload.csrfToken)) {
    return json(request, 403, errorBody("csrf_validation_failed", "Player request verification failed."));
  }
  let body: Uint8Array | null;
  try {
    body = await readBody(request, MAX_BODY_BYTES);
  } catch {
    return json(request, 413, errorBody("request_body_too_large", "Player request body is too large."));
  }
  const upstream = await callClassroom(
    request,
    `${suffix}${new URL(request.url).search}`,
    body,
    payload.sessionToken,
  );
  if (!upstream) return json(request, 502, errorBody("player_service_unavailable", "The Player service is unavailable.", true));
  if (upstream.response.status === 401) {
    const headers = responseHeaders(request, upstream.response.headers.get("content-type") || "application/json");
    clearCookies(headers);
    return new Response(ownedBuffer(upstream.bytes), { status: 401, headers });
  }
  return forward(request, upstream.response, upstream.bytes);
}


Deno.serve(async (request: Request) => {
  const route = routePath(new URL(request.url).pathname);
  if (request.method === "OPTIONS") return preflight(request);
  if (route === "/health" && request.method === "GET") {
    const config = runtime();
    return json(request, 200, {
      ok: true,
      service: "player-web-session-api",
      status: "ready",
      runtimeConfigured: config.ok,
      trustedClientIpAvailable: Boolean(trustedClientIp(request)),
      compatibilityTarget: "classroom-api",
    });
  }
  const boundaryFailure = requireRequestBoundary(request);
  if (boundaryFailure) return boundaryFailure;
  let key: Uint8Array;
  try {
    key = sessionKey();
  } catch {
    return json(request, 503, errorBody("player_web_session_unavailable", "Player web sessions are unavailable.", true));
  }
  try {
    if (route === "/login") return request.method === "POST" ? handleLogin(request, key) : json(request, 405, errorBody("method_not_allowed", "Use POST for login."));
    if (route === "/status") return request.method === "GET" ? handleStatus(request, key) : json(request, 405, errorBody("method_not_allowed", "Use GET for status."));
    if (route === "/logout") return request.method === "POST" ? handleLogout(request, key) : json(request, 405, errorBody("method_not_allowed", "Use POST for logout."));
    if (route.startsWith("/proxy/")) return handleProxy(request, route.slice("/proxy".length), key);
    return json(request, 404, errorBody("route_not_found", "Player web-session route was not found."));
  } catch (error) {
    console.error(JSON.stringify({ event: "player_bff_unhandled", message: String(error instanceof Error ? error.message : error) }));
    return json(request, 500, errorBody("player_web_session_failed", "Player web-session processing failed."));
  }
});
