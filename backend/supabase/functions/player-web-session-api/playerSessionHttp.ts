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
import {
  MAX_PROXY_PATH_BYTES,
  TRUSTED_IP_HEADER,
  MAX_BODY_BYTES,
  CSRF_HEADER,
  GAME_HEADER,
  DEVICE_HEADER,
} from "./playerSessionContracts.ts";


export function routePath(pathname: string): string {
  const marker = "/player-web-session-api";
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || "/" : pathname;
}


export function validProxyPath(suffix: string): boolean {
  return suffix.startsWith("/players/") &&
    suffix !== "/players/login" &&
    !suffix.includes("\\") &&
    !suffix.split("/").includes("..") &&
    new TextEncoder().encode(suffix).byteLength <= MAX_PROXY_PATH_BYTES;
}


export function requireAllowedOrigin(request: Request): Response | null {
  const origin = String(request.headers.get("origin") || "").trim();
  if (!origin || !allowedOrigins().has(origin)) {
    return json(request, 403, errorBody(
      "origin_not_allowed",
      "The request origin is not allowed.",
    ));
  }
  return null;
}


export function allowedOrigins(): ReadonlySet<string> {
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


export function trustedClientIp(request: Request): string | null {
  try {
    return readTrustedClientIp(request, TRUSTED_IP_HEADER);
  } catch {
    return null;
  }
}


export async function readBoundedBody(
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


export async function readBoundedResponse(
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


export function playerSessionJson(
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


export async function appendPlayerSessionCookie(
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


export function clearPlayerSessionResponse(
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


export function forwardJsonResponse(
  request: Request,
  upstream: Response,
  bytes: Uint8Array,
): Response {
  return forwardResponse(request, upstream, bytes);
}


export function forwardResponse(
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


export function json(request: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(request, "application/json"),
  });
}


export function responseHeaders(
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


export function preflightResponse(request: Request): Response {
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


export function withCors(request: Request, response: Response): Response {
  const headers = responseHeaders(request, response.headers.get("content-type"));
  const retryAfter = normalizeRetryAfter(response.headers.get("retry-after"));
  if (retryAfter) headers.set("Retry-After", retryAfter);
  return new Response(response.body, { status: response.status, headers });
}


export function methodNotAllowed(request: Request, expected: string): Response {
  return json(request, 405, errorBody(
    "method_not_allowed",
    `Use ${expected} for this Player web-session route.`,
  ));
}


export function serviceUnavailable(request: Request): Response {
  return json(request, 503, errorBody(
    "player_web_session_unavailable",
    "Player web sessions are unavailable.",
    true,
  ));
}


export function errorBody(code: string, message: string, retryable = false) {
  return { ok: false, error: { code, message, retryable } };
}


export function normalizeContentType(value: string | null): string {
  const type = String(value || "").split(";", 1)[0].trim().toLowerCase();
  if (type === "text/csv") return "text/csv; charset=utf-8";
  if (type === "application/octet-stream") return type;
  return "application/json; charset=utf-8";
}


export function normalizeRetryAfter(value: string | null): string | null {
  const candidate = String(value || "").trim();
  if (!/^\d{1,5}$/u.test(candidate)) return null;
  const seconds = Number(candidate);
  return seconds <= 86_400 ? String(seconds) : null;
}


export function isSafeHeaderValue(value: string): boolean {
  return value.length <= 8_192 && !/[\r\n\u0000]/u.test(value);
}


export function isLocalOrigin(origin: string | null): boolean {
  try {
    const url = new URL(String(origin || ""));
    return url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
}


export function isSafePlayer(
  value: unknown,
): value is WebPlayerSessionPayload["player"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const player = value as Record<string, unknown>;
  return safeText(player.displayName) &&
    (player.rosterLabel === null || safeText(player.rosterLabel)) &&
    safeText(player.playerIdentifier) &&
    safeText(player.status);
}


export function isSafeGame(
  value: unknown,
): value is WebPlayerSessionPayload["gameSession"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const game = value as Record<string, unknown>;
  return safeText(game.name) && safeText(game.status);
}


export function safeText(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}


export function parseJsonBytes<T>(bytes: Uint8Array): T | null {
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as T;
  } catch {
    return null;
  }
}


export function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
