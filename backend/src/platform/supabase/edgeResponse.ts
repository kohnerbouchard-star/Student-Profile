/// <reference lib="dom" />

export interface EdgeErrorBody {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
}

export class EdgeActivationError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(
    code: string,
    message: string,
    status: number,
    retryable = false,
  ) {
    super(message);
    this.name = "EdgeActivationError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

const PRODUCTION_BROWSER_ORIGIN = "https://kohnerbouchard-star.github.io";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

type DenoEnvironmentRuntime = {
  readonly env?: {
    get(name: string): string | undefined;
  };
};

function environmentValue(name: string): string {
  try {
    const runtime = Deno as unknown as DenoEnvironmentRuntime;
    return runtime.env?.get(name)?.trim() || "";
  } catch {
    return "";
  }
}

function validatedBrowserOrigin(value: string): string {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const secure = url.protocol === "https:";
    const loopback = url.protocol === "http:" && LOOPBACK_HOSTS.has(hostname);
    if ((!secure && !loopback) || url.pathname !== "/" || url.search || url.hash) {
      return PRODUCTION_BROWSER_ORIGIN;
    }
    return url.origin;
  } catch {
    return PRODUCTION_BROWSER_ORIGIN;
  }
}

export const EDGE_BROWSER_ORIGIN = validatedBrowserOrigin(
  environmentValue("ECONOVARIA_BROWSER_ORIGIN") || PRODUCTION_BROWSER_ORIGIN,
);

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": EDGE_BROWSER_ORIGIN,
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers":
    "authorization, apikey, content-type, x-client-info, x-request-id, x-player-session-token, x-econovaria-player-session-token, x-econovaria-game-id, x-econovaria-game-session-id, x-idempotency-key, idempotency-key",
  "access-control-max-age": "86400",
  "vary": "Origin",
};

export function jsonError(
  status: number,
  error: EdgeErrorBody["error"],
): Response {
  return jsonResponse<EdgeErrorBody>(status, {
    ok: false,
    error,
  }, {
    "cache-control": "private, no-store, max-age=0",
    "pragma": "no-cache",
    "vary": "Origin, Authorization, X-Player-Session-Token",
  });
}

export function jsonResponse<TBody>(
  status: number,
  body: TBody,
  additionalHeaders: HeadersInit = {},
): Response {
  const headers = new Headers(JSON_HEADERS);
  new Headers(additionalHeaders).forEach((value, key) => {
    headers.set(key, value);
  });

  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers,
  });
}
