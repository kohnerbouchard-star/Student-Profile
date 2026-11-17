import { readTrustedClientIp } from "../../../src/security/rateLimitKeying.ts";
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
  MAX_PROXY_PATH_BYTES,
  type TrustedClientIp,
  INTERNAL_TRUSTED_IP_HEADER,
  MAX_BODY_BYTES,
  CSRF_HEADER,
  GAME_HEADER,
  DEVICE_HEADER,
} from "./sessionContracts.ts";


export function routePath(pathname: string): string {
  const marker = "/web-session-api";
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || "/" : pathname;
}


export function validProxyPath(suffix: string): boolean {
  return suffix.startsWith("/") &&
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


export function trustedClientIp(request: Request): TrustedClientIp | null {
  try {
    return {
      header: INTERNAL_TRUSTED_IP_HEADER,
      address: readTrustedClientIp(request, INTERNAL_TRUSTED_IP_HEADER),
    };
  } catch {
    return null;
  }
}


export function publicSession(
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


export function parseAccessExpiry(value: string | null, token: string): number {
  const parsed = value ? Math.floor(Date.parse(value) / 1000) : 0;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : parseJwtExpiry(token);
}


export function parseJwtExpiry(token: string): number {
  const value = Number(parseJwtClaim(token, "exp"));
  if (!Number.isSafeInteger(value) || value <= Math.floor(Date.now() / 1000)) {
    throw new Error("JWT expiry is invalid.");
  }
  return value;
}


export function parseJwtClaim(token: string, claim: string): unknown {
  try {
    const segment = token.split(".")[1];
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded))?.[claim];
  } catch {
    return null;
  }
}


export async function readBoundedBody(request: Request): Promise<
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
      "Administrator response was too large.",
    )) };
  }
  return { ok: true, body: bytes };
}


export function parseJsonBytes<T>(bytes: Uint8Array): T | null {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as T;
  } catch {
    return null;
  }
}


export function sessionJson(
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


export async function appendSessionCookie(
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


export function clearSessionResponse(
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


export function json(request: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(request, "application/json"),
  });
}


export function responseHeaders(request: Request, contentType: string | null): Headers {
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
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    `apikey,content-type,${CSRF_HEADER},${GAME_HEADER},${DEVICE_HEADER},idempotency-key,x-request-id`,
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
    `Use ${expected} for this administrator web-session route.`,
  ));
}


export function serviceUnavailable(request: Request): Response {
  return json(request, 503, retryableErrorBody(
    "web_session_unavailable",
    "Administrator web sessions are unavailable.",
  ));
}


export function networkMetadataUnavailable(request: Request): Response {
  return json(request, 503, retryableErrorBody(
    "trusted_client_ip_unavailable",
    "Trusted client network metadata is unavailable.",
  ));
}


export function errorBody(code: string, message: string) {
  return { ok: false, error: { code, message, retryable: false } };
}


export function retryableErrorBody(code: string, message: string) {
  return { ok: false, error: { code, message, retryable: true } };
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


export function isBoundedIdentifier(value: string): boolean {
  return value.length <= 128 && /^[A-Za-z0-9._:-]+$/u.test(value);
}


export function isSafeHeaderValue(value: string): boolean {
  return value.length <= 8_192 && !/[\r\n\u0000]/u.test(value);
}


export function isLocalOrigin(origin: string | null): boolean {
  try {
    const url = new URL(String(origin || ""));
    return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
}


export async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
}
