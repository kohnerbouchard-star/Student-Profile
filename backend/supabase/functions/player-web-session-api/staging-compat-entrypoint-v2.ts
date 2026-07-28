const MAX_BODY_BYTES = 1_048_576;
const MAX_LOGIN_BODY_BYTES = 4_096;
const MAX_PROXY_PATH_BYTES = 2_048;
const MAX_COOKIE_BYTES = 4_096;
const MAX_SESSION_SECONDS = 4 * 60 * 60;
const SESSION_CONTEXT = "econovaria-player-web-session-v1";
const COOKIE_LOCAL = "econovaria_player_session";
const COOKIE_HOST = "__Host-econovaria_player_session";
const CSRF_HEADER = "x-econovaria-csrf-token";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

interface SafePlayer {
  readonly displayName: string;
  readonly rosterLabel: string | null;
  readonly playerIdentifier: string;
  readonly status: string;
}

interface SafeGame {
  readonly name: string;
  readonly status: string;
}

interface SessionPayload {
  readonly schemaVersion: "econovaria-player-web-session-v1";
  readonly sessionToken: string;
  readonly sessionExpiresAt: number;
  readonly absoluteExpiresAt: number;
  readonly issuedAt: number;
  readonly csrfToken: string;
  readonly player: SafePlayer;
  readonly gameSession: SafeGame;
}

type JsonObject = Record<string, unknown>;

function env(name: string): string {
  try {
    return String(Deno.env.get(name) || "").trim();
  } catch {
    return "";
  }
}

function runtime() {
  const supabaseUrl = env("SUPABASE_URL").replace(/\/+$/u, "");
  const publishableKey = env("SUPABASE_PUBLISHABLE_KEY") ||
    env("PUBLISHABLE_KEY") ||
    env("SUPABASE_ANON_KEY");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY") ||
    env("SUPABASE_SECRET_KEY") ||
    env("SECRET_KEY");
  return {
    supabaseUrl,
    publishableKey,
    serviceRoleKey,
    ok: Boolean(supabaseUrl && publishableKey && serviceRoleKey),
  };
}

function allowedOrigins(): ReadonlySet<string> {
  return new Set([
    "http://127.0.0.1:4173",
    "http://localhost:4173",
    ...env("ECONOVARIA_WEB_ALLOWED_ORIGINS")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ]);
}

function routePath(pathname: string): string {
  const marker = "/player-web-session-api";
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || "/" : pathname;
}

function errorBody(code: string, message: string, retryable = false) {
  return { ok: false, error: { code, message, retryable } };
}

function responseHeaders(request: Request, contentType = "application/json"): Headers {
  const origin = String(request.headers.get("origin") || "").trim();
  const normalizedType = String(contentType).split(";", 1)[0].trim().toLowerCase();
  const headers = new Headers({
    "Content-Type": normalizedType === "application/octet-stream"
      ? normalizedType
      : normalizedType === "text/csv"
      ? "text/csv; charset=utf-8"
      : "application/json; charset=utf-8",
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

function json(request: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(request),
  });
}

function preflight(request: Request): Response {
  const origin = String(request.headers.get("origin") || "").trim();
  if (!allowedOrigins().has(origin)) return new Response(null, { status: 403 });
  const headers = responseHeaders(request, "text/plain");
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "apikey,content-type,x-econovaria-csrf-token,x-econovaria-device-id,x-econovaria-game-id,x-idempotency-key,idempotency-key,x-request-id",
  );
  headers.set("Access-Control-Max-Age", "600");
  return new Response(null, { status: 204, headers });
}

function requireRequestBoundary(request: Request): Response | null {
  const origin = String(request.headers.get("origin") || "").trim();
  if (!allowedOrigins().has(origin)) {
    return json(request, 403, errorBody("origin_not_allowed", "The request origin is not allowed."));
  }
  const authorization = String(request.headers.get("authorization") || "").trim();
  if (/^Bearer\s+sb_publishable_/iu.test(authorization)) {
    return json(request, 401, errorBody(
      "publishable_key_bearer_prohibited",
      "The publishable key must be sent only in the apikey header.",
    ));
  }
  const configured = runtime().publishableKey;
  const supplied = String(request.headers.get("apikey") || "").trim();
  if (!configured || supplied !== configured) {
    return json(request, 401, errorBody("invalid_publishable_key", "The request API key is invalid."));
  }
  return null;
}

function normalizeIp(value: string): string | null {
  const candidate = value.trim();
  if (!candidate || candidate.length > 128 || candidate.includes(",") || /[\r\n%]/u.test(candidate)) {
    return null;
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(candidate)) {
    const octets = candidate.split(".").map(Number);
    return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
      ? octets.join(".")
      : null;
  }
  const bracketless = candidate.startsWith("[") && candidate.endsWith("]")
    ? candidate.slice(1, -1)
    : candidate;
  return /^[0-9a-f:.]+$/iu.test(bracketless) && bracketless.includes(":")
    ? bracketless.toLowerCase()
    : null;
}

function trustedClientIp(request: Request): string | null {
  for (const header of ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"] as const) {
    const normalized = normalizeIp(String(request.headers.get(header) || ""));
    if (normalized) return normalized;
  }
  return null;
}

function safeText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

function safePlayer(value: unknown): value is SafePlayer {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const player = value as JsonObject;
  return safeText(player.displayName) &&
    (player.rosterLabel === null || safeText(player.rosterLabel)) &&
    safeText(player.playerIdentifier) && safeText(player.status);
}

function safeGame(value: unknown): value is SafeGame {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const game = value as JsonObject;
  return safeText(game.name) && safeText(game.status);
}

function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return new Uint8Array();
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  try {
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
}

function sessionKey(): Uint8Array {
  const encoded = env("ECONOVARIA_PLAYER_SESSION_ENCRYPTION_KEY") ||
    env("ECONOVARIA_WEB_SESSION_ENCRYPTION_KEY");
  const key = decodeBase64Url(encoded);
  if (key.byteLength !== 32) throw new Error("player_session_key_unavailable");
  return key;
}

function validateSession(value: unknown): asserts value is SessionPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_session");
  const payload = value as Partial<SessionPayload>;
  if (
    payload.schemaVersion !== "econovaria-player-web-session-v1" ||
    typeof payload.sessionToken !== "string" ||
    payload.sessionToken.length < 16 || payload.sessionToken.length > 512 ||
    !Number.isSafeInteger(payload.sessionExpiresAt) ||
    !Number.isSafeInteger(payload.absoluteExpiresAt) ||
    !Number.isSafeInteger(payload.issuedAt) ||
    typeof payload.csrfToken !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/u.test(payload.csrfToken) ||
    !safePlayer(payload.player) || !safeGame(payload.gameSession)
  ) throw new Error("invalid_session");
}

async function sealSession(payload: SessionPayload, keyBytes: Uint8Array): Promise<string> {
  validateSession(payload);
  const plaintext = encoder.encode(JSON.stringify(payload));
  if (plaintext.byteLength > 2_048) throw new Error("session_too_large");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", ownedBuffer(keyBytes), "AES-GCM", false, ["encrypt"]);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({
    name: "AES-GCM",
    iv: ownedBuffer(iv),
    additionalData: encoder.encode(SESSION_CONTEXT),
    tagLength: 128,
  }, key, ownedBuffer(plaintext)));
  return `v1.${encodeBase64Url(iv)}.${encodeBase64Url(encrypted)}`;
}

async function openSession(envelope: string, keyBytes: Uint8Array): Promise<SessionPayload> {
  const parts = envelope.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("invalid_session");
  const iv = decodeBase64Url(parts[1]);
  const encrypted = decodeBase64Url(parts[2]);
  if (iv.byteLength !== 12 || encrypted.byteLength < 17 || encrypted.byteLength > 2_112) {
    throw new Error("invalid_session");
  }
  const key = await crypto.subtle.importKey("raw", ownedBuffer(keyBytes), "AES-GCM", false, ["decrypt"]);
  const plaintext = new Uint8Array(await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: ownedBuffer(iv),
    additionalData: encoder.encode(SESSION_CONTEXT),
    tagLength: 128,
  }, key, ownedBuffer(encrypted)));
  const payload = JSON.parse(decoder.decode(plaintext));
  validateSession(payload);
  const now = Math.floor(Date.now() / 1000);
  if (payload.sessionExpiresAt <= now || payload.absoluteExpiresAt <= now || payload.issuedAt > now + 60) {
    throw new Error("expired_session");
  }
  return payload;
}

function cookieEnvelope(request: Request): string {
  for (const segment of String(request.headers.get("cookie") || "").split(";")) {
    const separator = segment.indexOf("=");
    if (separator <= 0) continue;
    const name = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if ([COOKIE_LOCAL, COOKIE_HOST].includes(name) && value.length <= MAX_COOKIE_BYTES &&
      /^[A-Za-z0-9._-]+$/u.test(value)) return value;
  }
  return "";
}

async function resolveSession(request: Request, key: Uint8Array): Promise<SessionPayload | null> {
  const envelope = cookieEnvelope(request);
  if (!envelope) return null;
  try {
    return await openSession(envelope, key);
  } catch {
    return null;
  }
}

function clearCookies(headers: Headers): void {
  headers.append("Set-Cookie", `${COOKIE_HOST}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
  headers.append("Set-Cookie", `${COOKIE_LOCAL}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`);
}

async function setSessionCookie(
  request: Request,
  headers: Headers,
  payload: SessionPayload,
  key: Uint8Array,
): Promise<void> {
  const envelope = await sealSession(payload, key);
  const origin = new URL(String(request.headers.get("origin") || "http://127.0.0.1:4173"));
  const local = origin.protocol === "http:" && ["127.0.0.1", "localhost"].includes(origin.hostname);
  const name = local ? COOKIE_LOCAL : COOKIE_HOST;
  const maxAge = Math.max(1, payload.absoluteExpiresAt - Math.floor(Date.now() / 1000));
  headers.append(
    "Set-Cookie",
    `${name}=${envelope}; Path=/; Max-Age=${maxAge}; HttpOnly; ${local ? "" : "Secure; "}SameSite=Strict`,
  );
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.byteLength, b.byteLength);
  let difference = a.byteLength ^ b.byteLength;
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] || 0) ^ (b[index] || 0);
  }
  return difference === 0;
}

async function readBody(request: Request, maximum: number): Promise<Uint8Array | null> {
  if (["GET", "HEAD"].includes(request.method.toUpperCase())) return null;
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maximum) throw new Error("request_body_too_large");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maximum) throw new Error("request_body_too_large");
  return bytes;
}

function upstreamHeaders(request: Request, token = ""): Headers | null {
  const config = runtime();
  const clientIp = trustedClientIp(request);
  if (!config.ok || !clientIp) {
    console.warn(JSON.stringify({
      event: "player_bff_upstream_unavailable",
      runtimeConfigured: config.ok,
      trustedClientIpAvailable: Boolean(clientIp),
    }));
    return null;
  }
  const headers = new Headers({
    apikey: config.publishableKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    "x-real-ip": clientIp,
  });
  if (token) headers.set("x-player-session-token", token);
  for (const name of [
    "content-type",
    "x-econovaria-device-id",
    "x-econovaria-game-id",
    "x-idempotency-key",
    "idempotency-key",
    "x-request-id",
  ]) {
    const value = String(request.headers.get(name) || "");
    if (value && value.length <= 8_192 && !/[\r\n\0]/u.test(value)) headers.set(name, value);
  }
  return headers;
}

async function callClassroom(
  request: Request,
  route: string,
  body: Uint8Array | null,
  token = "",
): Promise<{ readonly response: Response; readonly bytes: Uint8Array } | null> {
  const config = runtime();
  const headers = upstreamHeaders(request, token);
  if (!headers) return null;
  if (body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${config.supabaseUrl}/functions/v1/classroom-api${route}`, {
    method: request.method,
    headers,
    body: body ? ownedBuffer(body) : undefined,
    cache: "no-store",
    redirect: "manual",
  }).catch(() => null);
  if (!response) {
    console.warn(JSON.stringify({ event: "player_bff_upstream_fetch_failed", route }));
    return null;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  console.info(JSON.stringify({
    event: "player_bff_upstream_response",
    route,
    status: response.status,
    bytes: bytes.byteLength,
  }));
  return bytes.byteLength <= MAX_BODY_BYTES ? { response, bytes } : null;
}

function parseJson(bytes: Uint8Array): JsonObject | null {
  try {
    return JSON.parse(decoder.decode(bytes)) as JsonObject;
  } catch {
    return null;
  }
}

function forward(request: Request, upstream: Response, bytes: Uint8Array): Response {
  const headers = responseHeaders(request, upstream.headers.get("content-type") || "application/json");
  const retryAfter = String(upstream.headers.get("retry-after") || "").trim();
  if (/^\d{1,5}$/u.test(retryAfter) && Number(retryAfter) <= 86_400) headers.set("Retry-After", retryAfter);
  return new Response(ownedBuffer(bytes), { status: upstream.status, headers });
}

function publicSession(payload: SessionPayload, bootstrap: JsonObject) {
  return {
    ok: true,
    session: {
      authenticated: true,
      status: "active",
      expiresAt: new Date(payload.sessionExpiresAt * 1000).toISOString(),
      absoluteExpiresAt: new Date(payload.absoluteExpiresAt * 1000).toISOString(),
    },
    player: bootstrap.player,
    gameSession: bootstrap.gameSession,
    balances: Array.isArray(bootstrap.balances) ? bootstrap.balances : [],
    attendance: bootstrap.attendance || { status: "not_configured" },
    availableActions: Array.isArray(bootstrap.availableActions) ? bootstrap.availableActions : [],
    csrfToken: payload.csrfToken,
  };
}

async function loadBootstrap(request: Request, token: string): Promise<JsonObject | null> {
  const source = new Request(request.url, { method: "GET", headers: request.headers });
  const upstream = await callClassroom(source, "/players/me", null, token);
  if (!upstream?.response.ok) return null;
  const body = parseJson(upstream.bytes);
  const session = body?.session;
  if (
    body?.ok !== true || !safePlayer(body.player) || !safeGame(body.gameSession) ||
    !session || typeof session !== "object" ||
    typeof (session as JsonObject).expiresAt !== "string" ||
    !Array.isArray(body.balances) || !Array.isArray(body.availableActions)
  ) return null;
  return body;
}

async function revoke(request: Request, token: string): Promise<boolean> {
  const source = new Request(request.url, { method: "POST", headers: request.headers });
  const upstream = await callClassroom(source, "/players/me/session/logout", encoder.encode("{}"), token);
  return upstream?.response.ok === true || upstream?.response.status === 401;
}

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
