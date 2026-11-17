import {
  json,
  errorBody,
  safePlayer,
  safeGame,
  responseHeaders,
  routePath,
  preflight,
  requireOrigin,
  requirePublishableRequest,
} from "./stagingCompatHttp.ts";
import {
  readBody,
  upstreamRequest,
  forward,
  parseJson,
  loadBootstrap,
  revoke,
  publicSession,
} from "./stagingCompatUpstream.ts";
import {
  MAX_LOGIN_BODY_BYTES,
  type JsonRecord,
  type SessionPayload,
  SESSION_ABSOLUTE_SECONDS,
  CSRF_HEADER,
  encoder,
  MAX_PROXY_PATH_BYTES,
  MAX_BODY_BYTES,
} from "./stagingCompatContracts.ts";
import {
  randomBase64Url,
  appendSessionCookie,
  resolveSession,
  appendClearCookie,
  constantTimeEqual,
  ownedBuffer,
  sessionKey,
} from "./stagingCompatSession.ts";


async function handleLogin(request: Request, key: Uint8Array): Promise<Response> {
  if (!/^application\/json(?:\s*;|$)/iu.test(String(request.headers.get("content-type") || ""))) {
    return json(request, 415, errorBody("unsupported_media_type", "Player login requires application/json."));
  }
  let body;
  try {
    body = await readBody(request, MAX_LOGIN_BODY_BYTES);
  } catch {
    return json(request, 413, errorBody("request_body_too_large", "Player login body is too large."));
  }
  const upstream = await upstreamRequest(request, "/players/login", body);
  if (!upstream) return json(request, 502, errorBody("player_login_unavailable", "Player sign-in is unavailable.", true));
  if (!upstream.response.ok) return forward(request, upstream.response, upstream.bytes);
  const login = parseJson<JsonRecord>(upstream.bytes);
  const session = login?.session as JsonRecord | undefined;
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
  const upstreamExpiry = Math.floor(Date.parse(String((bootstrap.session as JsonRecord).expiresAt || expiresAt)) / 1000);
  if (!Number.isSafeInteger(upstreamExpiry) || upstreamExpiry <= issuedAt) {
    await revoke(request, token);
    return json(request, 502, errorBody("player_session_expiry_invalid", "The Player session expiry is invalid."));
  }
  const payload: SessionPayload = {
    schemaVersion: "econovaria-player-web-session-v1",
    sessionToken: token,
    sessionExpiresAt: upstreamExpiry,
    absoluteExpiresAt: Math.min(upstreamExpiry, issuedAt + SESSION_ABSOLUTE_SECONDS),
    issuedAt,
    csrfToken: randomBase64Url(32),
    player: bootstrap.player as SessionPayload["player"],
    gameSession: bootstrap.gameSession as SessionPayload["gameSession"],
  };
  const headers = responseHeaders(request, "application/json");
  await appendSessionCookie(request, headers, payload, key);
  return new Response(JSON.stringify(publicSession(payload, bootstrap)), { status: 200, headers });
}


async function handleStatus(request: Request, key: Uint8Array): Promise<Response> {
  const payload = await resolveSession(request, key);
  if (!payload) {
    const headers = responseHeaders(request, "application/json");
    appendClearCookie(headers);
    return new Response(JSON.stringify(errorBody("player_session_invalid", "Player sign-in is required.")), { status: 401, headers });
  }
  const bootstrap = await loadBootstrap(request, payload.sessionToken);
  if (!bootstrap) {
    const headers = responseHeaders(request, "application/json");
    appendClearCookie(headers);
    return new Response(JSON.stringify(errorBody("player_session_invalid", "Player sign-in is required.")), { status: 401, headers });
  }
  return json(request, 200, publicSession(payload, bootstrap));
}


async function handleLogout(request: Request, key: Uint8Array): Promise<Response> {
  const payload = await resolveSession(request, key);
  const headers = responseHeaders(request, "application/json");
  if (!payload) {
    appendClearCookie(headers);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }
  if (!constantTimeEqual(String(request.headers.get(CSRF_HEADER) || ""), payload.csrfToken)) {
    return json(request, 403, errorBody("csrf_validation_failed", "Player request verification failed."));
  }
  const revoked = await revoke(request, payload.sessionToken);
  appendClearCookie(headers);
  return new Response(JSON.stringify(
    revoked
      ? { ok: true }
      : errorBody("player_session_revocation_failed", "Server revocation could not be confirmed.", true),
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
    const headers = responseHeaders(request, "application/json");
    appendClearCookie(headers);
    return new Response(JSON.stringify(errorBody("player_session_invalid", "Player sign-in is required.")), { status: 401, headers });
  }
  if (!["GET", "HEAD"].includes(request.method.toUpperCase()) &&
    !constantTimeEqual(String(request.headers.get(CSRF_HEADER) || ""), payload.csrfToken)) {
    return json(request, 403, errorBody("csrf_validation_failed", "Player request verification failed."));
  }
  let body;
  try {
    body = await readBody(request, MAX_BODY_BYTES);
  } catch {
    return json(request, 413, errorBody("request_body_too_large", "Player request body is too large."));
  }
  const search = new URL(request.url).search;
  const upstream = await upstreamRequest(request, `${suffix}${search}`, body, payload.sessionToken);
  if (!upstream) return json(request, 502, errorBody("player_service_unavailable", "The Player service is unavailable.", true));
  if (upstream.response.status === 401) {
    const headers = responseHeaders(request, upstream.response.headers.get("content-type"));
    appendClearCookie(headers);
    return new Response(ownedBuffer(upstream.bytes), { status: 401, headers });
  }
  return forward(request, upstream.response, upstream.bytes);
}


Deno.serve(async (request: Request) => {
  const route = routePath(new URL(request.url).pathname);
  if (request.method === "OPTIONS") return preflight(request);
  if (route === "/health" && request.method === "GET") {
    return json(request, 200, { ok: true, service: "player-web-session-api", status: "ready", compatibilityTarget: "classroom-api" });
  }
  const originFailure = requireOrigin(request);
  if (originFailure) return originFailure;
  const publishableFailure = requirePublishableRequest(request);
  if (publishableFailure) return publishableFailure;
  let key;
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
  } catch {
    return json(request, 500, errorBody("player_web_session_failed", "Player web-session processing failed."));
  }
});
