const PRODUCTION_ORIGIN = "https://kohnerbouchard-star.github.io";
const LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
]);

function configuredOrigins(): Set<string> {
  let configured = "";
  try {
    configured = Deno.env.get("ECONOVARIA_ALLOWED_ORIGINS") || "";
  } catch {
    configured = "";
  }
  return new Set([
    PRODUCTION_ORIGIN,
    ...configured.split(",").map((value) => value.trim()).filter(Boolean),
  ]);
}

const ALLOWED_ORIGINS = configuredOrigins();

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true;

  try {
    const url = new URL(origin);
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    return url.protocol === "http:" && LOOPBACK_HOSTS.has(hostname);
  } catch {
    return false;
  }
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
