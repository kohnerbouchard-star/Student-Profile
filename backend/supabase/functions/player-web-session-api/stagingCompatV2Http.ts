import {
  type SafePlayer,
  type JsonObject,
  type SafeGame,
} from "./stagingCompatV2Contracts.ts";


export function env(name: string): string {
  try {
    return String(Deno.env.get(name) || "").trim();
  } catch {
    return "";
  }
}


export function runtime() {
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


export function allowedOrigins(): ReadonlySet<string> {
  return new Set([
    "http://127.0.0.1:4173",
    "http://localhost:4173",
    ...env("ECONOVARIA_WEB_ALLOWED_ORIGINS")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ]);
}


export function routePath(pathname: string): string {
  const marker = "/player-web-session-api";
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length) || "/" : pathname;
}


export function errorBody(code: string, message: string, retryable = false) {
  return { ok: false, error: { code, message, retryable } };
}


export function responseHeaders(request: Request, contentType = "application/json"): Headers {
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


export function json(request: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(request),
  });
}


export function preflight(request: Request): Response {
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


export function requireRequestBoundary(request: Request): Response | null {
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


export function normalizeIp(value: string): string | null {
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


export function trustedClientIp(request: Request): string | null {
  for (const header of ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"] as const) {
    const normalized = normalizeIp(String(request.headers.get(header) || ""));
    if (normalized) return normalized;
  }
  return null;
}


export function safeText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}


export function safePlayer(value: unknown): value is SafePlayer {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const player = value as JsonObject;
  return safeText(player.displayName) &&
    (player.rosterLabel === null || safeText(player.rosterLabel)) &&
    safeText(player.playerIdentifier) && safeText(player.status);
}


export function safeGame(value: unknown): value is SafeGame {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const game = value as JsonObject;
  return safeText(game.name) && safeText(game.status);
}
