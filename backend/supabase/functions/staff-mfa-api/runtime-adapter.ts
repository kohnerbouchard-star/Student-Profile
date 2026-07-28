type ServeHandler = (request: Request, info?: unknown) => Response | Promise<Response>;

const originalServe = Deno.serve.bind(Deno) as (...args: unknown[]) => unknown;
const MFA_HANDLE_KEY_NAME = "ECONOVARIA_MFA_HANDLE_KEY";
const MFA_FUNCTION_MARKER = "/staff-mfa-api";

(Deno as unknown as { serve: (...args: unknown[]) => unknown }).serve = (
  ...args: unknown[]
): unknown => {
  if (typeof args[0] === "function") {
    return originalServe(wrapHandler(args[0] as ServeHandler));
  }
  if (typeof args[1] === "function") {
    return originalServe(args[0], wrapHandler(args[1] as ServeHandler));
  }
  return originalServe(...args);
};

function wrapHandler(handler: ServeHandler): ServeHandler {
  return async (request: Request, info?: unknown): Promise<Response> => {
    const route = functionRoute(request);
    if (
      route === "/staff/mfa/enroll" &&
      request.method === "POST" &&
      !validMfaHandleKey()
    ) {
      return json(503, {
        error: {
          code: "mfa_handle_key_unavailable",
          message: "Staff MFA handle protection is unavailable.",
          retryable: true,
        },
      });
    }

    const response = await handler(request, info);
    if (
      route !== "/staff/mfa" ||
      request.method !== "GET" ||
      !response.ok ||
      !String(response.headers.get("content-type") || "")
        .toLowerCase()
        .includes("application/json")
    ) {
      return response;
    }

    try {
      const body = await response.clone().json() as Record<string, unknown>;
      const factors = Array.isArray(body.factors)
        ? body.factors.filter((factor) =>
          Boolean(
            factor &&
              typeof factor === "object" &&
              (factor as Record<string, unknown>).status === "verified",
          )
        )
        : [];
      body.factors = factors;
      body.needsEnrollment = factors.length === 0;
      const headers = new Headers(response.headers);
      headers.set("content-type", "application/json; charset=utf-8");
      headers.set("cache-control", "private, no-store, max-age=0");
      return new Response(JSON.stringify(body), {
        status: response.status,
        headers,
      });
    } catch {
      return response;
    }
  };
}

function validMfaHandleKey(): boolean {
  const secret = String(Deno.env.get(MFA_HANDLE_KEY_NAME) || "");
  return secret.length >= 32 && secret.length <= 1024;
}

function functionRoute(request: Request): string {
  const pathname = new URL(request.url).pathname;
  const markerIndex = pathname.indexOf(MFA_FUNCTION_MARKER);
  return markerIndex >= 0
    ? pathname.slice(markerIndex + MFA_FUNCTION_MARKER.length) || "/"
    : pathname;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      "pragma": "no-cache",
      "x-content-type-options": "nosniff",
    },
  });
}
