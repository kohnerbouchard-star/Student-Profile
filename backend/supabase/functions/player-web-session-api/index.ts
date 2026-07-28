import {
  readEdgeSupabaseEnv,
  requirePublishableRequest,
} from "../_shared/econovariaAuth.ts";
import { readTrustedClientIp } from "../../../src/security/rateLimitKeying.ts";
import {
  constantTimePlayerTextEqual,
  createWebPlayerSessionPayload,
  openWebPlayerSession,
  parsePlayerCookieHeader,
  randomWebPlayerCsrfToken,
  readWebPlayerSessionKey,
  sealWebPlayerSession,
  WEB_PLAYER_SESSION_COOKIE,
  WEB_PLAYER_SESSION_LOCAL_COOKIE,
  type WebPlayerSessionPayload,
} from "../../../src/security/webPlayerSession.ts";

const MAX_BODY_BYTES = 1_048_576;
const MAX_LOGIN_BODY_BYTES = 4_096;
const MAX_PROXY_PATH_BYTES = 2_048;
const CSRF_HEADER = "x-econovaria-csrf-token";
const DEVICE_HEADER = "x-econovaria-device-id";
const GAME_HEADER = "x-econovaria-game-id";
const TRUSTED_IP_HEADER = "x-real-ip";
const FORWARDED_REQUEST_HEADERS = new Map([
  ["content-type", "Content-Type"],
  ["x-idempotency-key", "X-Idempotency-Key"],
  ["idempotency-key", "Idempotency-Key"],
  ["x-request-id", "X-Request-Id"],
  [GAME_HEADER, "X-Econovaria-Game-Id"],
]);

interface PlayerLoginBody {
  readonly ok?: unknown;
  readonly gameSession?: unknown;
  readonly player?: unknown;
  readonly session?: {
    readonly token?: unknown;
    readonly status?: unknown;
    readonly expiresAt?: unknown;
  };
}

interface PlayerBootstrapBody {
  readonly ok?: unknown;
  readonly gameSession?: unknown;
  readonly player?: unknown;
  readonly session?: {
    readonly status?: unknown;
    readonly expiresAt?: unknown;
  };
  readonly balances?: unknown;
  readonly attendance?: unknown;
  readonly availableActions?: unknown;
}

Deno.serve(async (request: Request) => {
  const route = routePath(new URL(request.url).pathname);

  if (request.method === "OPTIONS") return preflightResponse(request);
  if (route === "/health" && request.method === "GET") {
    return json(request, 200, {
      ok: true,
      service: "player-web-session-api",
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
    key = readWebPlayerSessionKey();
  } catch {
    return serviceUnavailable(request);
  }

  try {
    if (route === "/login") {
      return request.method === "POST"
        ? handleLogin(
          request,
          key,
          env.value.supabaseUrl,
          env.value.supabaseAnonKey,
        )
        : methodNotAllowed(request, "POST");
    }
    if (route === "/status") {
      return request.method === "GET"
        ? handleStatus(
          request,
          key,
          env.value.supabaseUrl,
          env.value.supabaseAnonKey,
        )
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
      "Player web-session route was not found.",
    ));
  } catch {
    return json(request, 500, errorBody(
      "player_web_session_failed",
      "Player web-session processing failed.",
    ));
  }
});

async function handleLogin(
  request: Request,
  key: Uint8Array,
  supabaseUrl: string,
  publishableKey: string,
): Promise<Response> {
  if (!/^application\/json(?:\s*;|$)/iu.test(
    String(request.headers.get("content-type") || ""),
  )) {
    return json(request, 415, errorBody(
      "unsupported_media_type",
      "Player login requires an application/json request.",
    ));
  }
  const bodyResult = await readBoundedBody(request, MAX_LOGIN_BODY_BYTES);
  if (bodyResult.ok === false) return bodyResult.response;
  const clientIp = trustedClientIp(request);
  if (!clientIp) {
    return json(request, 400, errorBody(
      "trusted_client_ip_unavailable",
      "Trusted client network metadata is unavailable.",
    ));
  }

  const upstream = await fetch(
    `${supabaseUrl}/functions/v1/player-api/players/login`,
    {
      method: "POST",
      headers: upstreamHeaders(
        request,
        publishableKey,
        clientIp,
        true,
      ),
      body: ownedArrayBuffer(bodyResult.body ?? new Uint8Array()),
      cache: "no-store",
      redirect: "manual",
    },
  ).catch(() => null);
  if (!upstream) {
    return json(request, 502, errorBody(
      "player_login_unavailable",
      "Player sign-in is unavailable.",
      true,
    ));
  }
  const loginBytes = await readBoundedResponse(request, upstream);
  if (loginBytes.ok === false) return loginBytes.response;
  const login = parseJsonBytes<PlayerLoginBody>(loginBytes.body);
  if (!upstream.ok) {
    return forwardJsonResponse(request, upstream, loginBytes.body);
  }

  const token = String(login?.session?.token || "");
  const expiresAt = String(login?.session?.expiresAt || "");
  if (
    login?.ok !== true ||
    !token ||
    !expiresAt ||
    !isSafePlayer(login.player) ||
    !isSafeGame(login.gameSession)
  ) {
    if (token) {
      await revokeUpstreamSession(
        supabaseUrl,
        publishableKey,
        token,
        request,
        clientIp,
      );
    }
    return json(request, 502, errorBody(
      "player_login_response_invalid",
      "Player sign-in returned an invalid session.",
    ));
  }

  const bootstrap = await loadPlayerBootstrap(
    supabaseUrl,
    publishableKey,
    token,
    request,
    clientIp,
  );
  if (!bootstrap.ok) {
    await revokeUpstreamSession(
      supabaseUrl,
      publishableKey,
      token,
      request,
      clientIp,
    );
    return json(request, 502, errorBody(
      "player_session_bootstrap_failed",
      "The Player session could not be loaded.",
      true,
    ));
  }

  const payload = createWebPlayerSessionPayload({
    sessionToken: token,
    sessionExpiresAt: String(bootstrap.body.session?.expiresAt || expiresAt),
    csrfToken: randomWebPlayerCsrfToken(),
    player: bootstrap.body.player,
    gameSession: bootstrap.body.gameSession,
  });

  return playerSessionJson(
    request,
    200,
    publicPlayerSessionBody(payload, bootstrap.body),
    payload,
    key,
  );
}

async function handleStatus(
  request: Request,
  key: Uint8Array,
  supabaseUrl: string,
  publishableKey: string,
): Promise<Response> {
  const resolved = await resolveSession(request, key);
  if (resolved.ok === false) {
    return clearPlayerSessionResponse(request, 401, resolved.code);
  }
  const clientIp = trustedClientIp(request);
  if (!clientIp) {
    return clearPlayerSessionResponse(
      request,
      401,
      "trusted_client_ip_unavailable",
    );
  }
  const bootstrap = await loadPlayerBootstrap(
    supabaseUrl,
    publishableKey,
    resolved.payload.sessionToken,
    request,
    clientIp,
  );
  if (!bootstrap.ok) {
    return clearPlayerSessionResponse(request, 401, "player_session_invalid");
  }
  return playerSessionJson(
    request,
    200,
    publicPlayerSessionBody(resolved.payload, bootstrap.body),
    resolved.payload,
    key,
    false,
  );
}

async function handleLogout(
  request: Request,
  key: Uint8Array,
  supabaseUrl: string,
  publishableKey: string,
): Promise<Response> {
  const resolved = await resolveSession(request, key);
  if (resolved.ok === false) {
    return clearPlayerSessionResponse(request, 200, "signed_out", { ok: true });
  }
  const suppliedCsrf = String(request.headers.get(CSRF_HEADER) || "");
  if (!constantTimePlayerTextEqual(suppliedCsrf, resolved.payload.csrfToken)) {
    return json(request, 403, errorBody(
      "csrf_validation_failed",
      "Player request verification failed.",
    ));
  }
  const clientIp = trustedClientIp(request);
  const revoked = clientIp
    ? await revokeUpstreamSession(
      supabaseUrl,
      publishableKey,
      resolved.payload.sessionToken,
      request,
      clientIp,
    )
    : false;
  if (!revoked) {
    return clearPlayerSessionResponse(
      request,
      502,
      "player_session_revocation_failed",
      errorBody(
        "player_session_revocation_failed",
        "The local Player session was closed, but server revocation could not be confirmed.",
        true,
      ),
    );
  }
  return clearPlayerSessionResponse(request, 200, "signed_out", { ok: true });
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
      "Player proxy path is invalid.",
    ));
  }
  const resolved = await resolveSession(request, key);
  if (resolved.ok === false) {
    return clearPlayerSessionResponse(request, 401, resolved.code);
  }
  const isMutation = !["GET", "HEAD"].includes(request.method.toUpperCase());
  if (isMutation) {
    const suppliedCsrf = String(request.headers.get(CSRF_HEADER) || "");
    if (!constantTimePlayerTextEqual(suppliedCsrf, resolved.payload.csrfToken)) {
      return json(request, 403, errorBody(
        "csrf_validation_failed",
        "Player request verification failed.",
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
  const bodyResult = await readBoundedBody(request, MAX_BODY_BYTES);
  if (bodyResult.ok === false) return bodyResult.response;
  const headers = upstreamHeaders(
    request,
    publishableKey,
    clientIp,
    Boolean(bodyResult.body),
    resolved.payload.sessionToken,
  );
  const upstream = await fetch(
    `${supabaseUrl}/functions/v1/player-api${suffix}${new URL(request.url).search}`,
    {
      method: request.method,
      headers,
      body: bodyResult.body ? ownedArrayBuffer(bodyResult.body) : undefined,
      cache: "no-store",
      redirect: "manual",
    },
  ).catch(() => null);
  if (!upstream) {
    return json(request, 502, errorBody(
      "player_service_unavailable",
      "The Player service is unavailable.",
      true,
    ));
  }
  const responseBody = await readBoundedResponse(request, upstream);
  if (responseBody.ok === false) return responseBody.response;
  if (upstream.status === 401) {
    return clearPlayerSessionResponse(
      request,
      401,
      "player_session_invalid",
      parseJsonBytes(responseBody.body) ?? errorBody(
        "player_session_invalid",
        "Player sign-in is required.",
      ),
    );
  }
  return forwardResponse(request, upstream, responseBody.body);
}

async function loadPlayerBootstrap(
  supabaseUrl: string,
  publishableKey: string,
  sessionToken: string,
  source: Request,
  clientIp: string,
): Promise<
  | { readonly ok: true; readonly body: RequiredPlayerBootstrapBody }
  | { readonly ok: false }
> {
  const request = new Request(
    `${supabaseUrl}/functions/v1/player-api/players/me`,
    {
      method: "GET",
      headers: upstreamHeaders(
        source,
        publishableKey,
        clientIp,
        false,
        sessionToken,
      ),
      cache: "no-store",
      redirect: "manual",
    },
  );
  const response = await fetch(request).catch(() => null);
  if (!response?.ok) return { ok: false };
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) return { ok: false };
  const body = parseJsonBytes<PlayerBootstrapBody>(bytes);
  if (
    body?.ok !== true ||
    !isSafePlayer(body.player) ||
    !isSafeGame(body.gameSession) ||
    typeof body.session?.expiresAt !== "string" ||
    !Array.isArray(body.balances) ||
    !Array.isArray(body.availableActions)
  ) {
    return { ok: false };
  }
  return { ok: true, body: body as RequiredPlayerBootstrapBody };
}

type RequiredPlayerBootstrapBody = PlayerBootstrapBody & {
  readonly ok: true;
  readonly player: WebPlayerSessionPayload["player"];
  readonly gameSession: WebPlayerSessionPayload["gameSession"];
  readonly session: { readonly status: string; readonly expiresAt: string };
  readonly balances: readonly unknown[];
  readonly availableActions: readonly unknown[];
};

async function revokeUpstreamSession(
  supabaseUrl: string,
  publishableKey: string,
  sessionToken: string,
  source: Request,
  clientIp: string,
): Promise<boolean> {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/player-api/players/me/session/logout`,
    {
      method: "POST",
      headers: upstreamHeaders(
        source,
        publishableKey,
        clientIp,
        true,
        sessionToken,
      ),
      body: "{}",
      cache: "no-store",
      redirect: "manual",
    },
  ).catch(() => null);
  return response?.ok === true || response?.status === 401;
}

function publicPlayerSessionBody(
  payload: WebPlayerSessionPayload,
  bootstrap: RequiredPlayerBootstrapBody,
) {
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
    balances: bootstrap.balances,
    attendance: bootstrap.attendance ?? { status: "not_configured" },
    availableActions: bootstrap.availableActions,
    csrfToken: payload.csrfToken,
  };
}

function upstreamHeaders(
  source: Request,
  publishableKey: string,
  clientIp: string,
  hasBody: boolean,
  sessionToken = "",
): Headers {
  const headers = new Headers({
    apikey: publishableKey,
    "x-real-ip": clientIp,
  });
  const deviceId = String(source.headers.get(DEVICE_HEADER) || "");
  if (isSafeHeaderValue(deviceId)) headers.set(DEVICE_HEADER, deviceId);
  if (sessionToken) headers.set("x-player-session-token", sessionToken);
  for (const [sourceName, targetName] of FORWARDED_REQUEST_HEADERS) {
    const value = String(source.headers.get(sourceName) || "");
    if (value && isSafeHeaderValue(value)) headers.set(targetName, value);
  }
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

async function resolveSession(
  request: Request,
  key: Uint8Array,
): Promise<
  | { readonly ok: true; readonly payload: WebPlayerSessionPayload }
  | { readonly ok: false; readonly code: string }
> {
  const cookies = parsePlayerCookieHeader(request.headers.get("cookie"));
  const envelope = cookies.get(WEB_PLAYER_SESSION_COOKIE) ||
    cookies.get(WEB_PLAYER_SESSION_LOCAL_COOKIE) || "";
  if (!envelope) return { ok: false, code: "player_session_missing" };
  try {
    return { ok: true, payload: await openWebPlayerSession(envelope, key) };
  } catch {
    return { ok: false, code: "player_session_invalid" };
  }
}

function routePath(pathname: string): string {
  const marker = "/player-web-session-api";
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || "/" : pathname;
}

function validProxyPath(suffix: string): boolean {
  return suffix.startsWith("/players/") &&
    suffix !== "/players/login" &&
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

function trustedClientIp(request: Request): string | null {
  try {
    return readTrustedClientIp(request, TRUSTED_IP_HEADER);
  } catch {
    return null;
  }
}

async function readBoundedBody(
  request: Request,
  maximum: number,
): Promise<
  | { readonly ok: true; readonly body: Uint8Array | null }
  | { readonly ok: false; readonly response: Response }
> {
  if (["GET", "HEAD"].includes(request.method.toUpperCase())) {
    return { ok: true, body: null };
  }
  const declared = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > maximum) {
    return { ok: false, response: json(request, 413, errorBody(
      "request_body_too_large",
      "Player request body is too large.",
    )) };
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maximum) {
    return { ok: false, response: json(request, 413, errorBody(
      "request_body_too_large",
      "Player request body is too large.",
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
      "Player response was too large.",
    )) };
  }
  return { ok: true, body: bytes };
}

function playerSessionJson(
  request: Request,
  status: number,
  body: unknown,
  payload: WebPlayerSessionPayload,
  key: Uint8Array,
  forceCookie = true,
): Promise<Response> {
  const headers = responseHeaders(request, "application/json");
  return (async () => {
    if (forceCookie) await appendPlayerSessionCookie(headers, payload, key, request);
    return new Response(JSON.stringify(body), { status, headers });
  })();
}

async function appendPlayerSessionCookie(
  headers: Headers,
  payload: WebPlayerSessionPayload,
  key: Uint8Array,
  request: Request,
): Promise<void> {
  const envelope = await sealWebPlayerSession(payload, key);
  const local = isLocalOrigin(request.headers.get("origin"));
  const name = local ? WEB_PLAYER_SESSION_LOCAL_COOKIE : WEB_PLAYER_SESSION_COOKIE;
  const maxAge = Math.max(
    1,
    payload.absoluteExpiresAt - Math.floor(Date.now() / 1000),
  );
  headers.append(
    "Set-Cookie",
    `${name}=${envelope}; Path=/; Max-Age=${maxAge}; HttpOnly; ${local ? "" : "Secure; "}SameSite=Strict`,
  );
}

function clearPlayerSessionResponse(
  request: Request,
  status: number,
  code: string,
  body: unknown = errorBody(code, "Player sign-in is required."),
): Response {
  const headers = responseHeaders(request, "application/json");
  headers.append(
    "Set-Cookie",
    `${WEB_PLAYER_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
  );
  headers.append(
    "Set-Cookie",
    `${WEB_PLAYER_SESSION_LOCAL_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`,
  );
  return new Response(JSON.stringify(body), { status, headers });
}

function forwardJsonResponse(
  request: Request,
  upstream: Response,
  bytes: Uint8Array,
): Response {
  return forwardResponse(request, upstream, bytes);
}

function forwardResponse(
  request: Request,
  upstream: Response,
  bytes: Uint8Array,
): Response {
  const headers = responseHeaders(
    request,
    upstream.headers.get("content-type"),
  );
  const retryAfter = normalizeRetryAfter(upstream.headers.get("retry-after"));
  if (retryAfter) headers.set("Retry-After", retryAfter);
  return new Response(ownedArrayBuffer(bytes), {
    status: upstream.status,
    headers,
  });
}

function json(request: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(request, "application/json"),
  });
}

function responseHeaders(
  request: Request,
  contentType: string | null,
): Headers {
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
  headers.set(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
  );
  headers.set(
    "Access-Control-Allow-Headers",
    `apikey,content-type,${CSRF_HEADER},${GAME_HEADER},${DEVICE_HEADER},x-idempotency-key,idempotency-key,x-request-id`,
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
    `Use ${expected} for this Player web-session route.`,
  ));
}

function serviceUnavailable(request: Request): Response {
  return json(request, 503, errorBody(
    "player_web_session_unavailable",
    "Player web sessions are unavailable.",
    true,
  ));
}

function errorBody(code: string, message: string, retryable = false) {
  return { ok: false, error: { code, message, retryable } };
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

function isSafeHeaderValue(value: string): boolean {
  return value.length <= 8_192 && !/[\r\n\u0000]/u.test(value);
}

function isLocalOrigin(origin: string | null): boolean {
  try {
    const url = new URL(String(origin || ""));
    return url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
}

function isSafePlayer(
  value: unknown,
): value is WebPlayerSessionPayload["player"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const player = value as Record<string, unknown>;
  return safeText(player.displayName) &&
    (player.rosterLabel === null || safeText(player.rosterLabel)) &&
    safeText(player.playerIdentifier) &&
    safeText(player.status);
}

function isSafeGame(
  value: unknown,
): value is WebPlayerSessionPayload["gameSession"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const game = value as Record<string, unknown>;
  return safeText(game.name) && safeText(game.status);
}

function safeText(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

function parseJsonBytes<T>(bytes: Uint8Array): T | null {
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as T;
  } catch {
    return null;
  }
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
