const PRODUCTION_ORIGIN = "https://kohnerbouchard-star.github.io";
const LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
]);

function normalizedOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const secure = url.protocol === "https:";
    const loopback = url.protocol === "http:" && LOOPBACK_HOSTS.has(hostname);
    if (
      (!secure && !loopback) ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function configuredOrigins(): Set<string> {
  let configured = "";
  try {
    configured = Deno.env.get("ECONOVARIA_ALLOWED_ORIGINS") || "";
  } catch {
    configured = "";
  }

  const origins = new Set([PRODUCTION_ORIGIN]);
  for (const value of configured.split(",")) {
    const origin = normalizedOrigin(value.trim());
    if (origin) origins.add(origin);
  }
  return origins;
}

const ALLOWED_ORIGINS = configuredOrigins();

function isAllowedOrigin(origin: string): boolean {
  const normalized = normalizedOrigin(origin);
  if (!normalized) return false;
  if (ALLOWED_ORIGINS.has(normalized)) return true;

  const url = new URL(normalized);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(hostname);
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-econovaria-game-id, x-client-info, x-csrf-token, x-idempotency-key, x-econovaria-admin-action, x-requested-with, if-match, x-request-id",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };

  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}
