import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { normalizeMfaQrCode } from "./mfaQrCode.ts";

type ServeHandler = (request: Request, info?: unknown) => Response | Promise<Response>;

interface RuntimeFactor {
  readonly id?: string;
  readonly friendly_name?: string;
  readonly status?: string;
}

const originalServe = Deno.serve.bind(Deno) as (...args: unknown[]) => unknown;
const DEFAULT_FACTOR_NAME = "Econovaria Admin";
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
    if (route === "/staff/mfa/enroll" && request.method === "POST") {
      if (!validMfaHandleKey()) {
        return json(503, {
          error: {
            code: "mfa_handle_key_unavailable",
            message: "Staff MFA handle protection is unavailable.",
            retryable: true,
          },
        });
      }

      const authorizationFailure = await authorizeEnrollment(handler, request, info);
      if (authorizationFailure) return authorizationFailure;

      const cleanupFailure = await cleanupAbandonedEnrollment(request);
      if (cleanupFailure) return cleanupFailure;
    }

    const response = await handler(request, info);
    if (
      !response.ok ||
      !String(response.headers.get("content-type") || "")
        .toLowerCase()
        .includes("application/json")
    ) {
      return response;
    }

    if (route === "/staff/mfa" && request.method === "GET") {
      return normalizeStatusResponse(response);
    }
    if (route === "/staff/mfa/enroll" && request.method === "POST") {
      return normalizeEnrollmentResponse(response, request);
    }
    return response;
  };
}

async function authorizeEnrollment(
  handler: ServeHandler,
  request: Request,
  info?: unknown,
): Promise<Response | null> {
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/\/enroll$/u, "");
  const headers = new Headers(request.headers);
  headers.delete("content-type");
  headers.delete("content-length");
  const response = await handler(new Request(url, { method: "GET", headers }), info);
  return response.ok ? null : response;
}

async function cleanupAbandonedEnrollment(request: Request): Promise<Response | null> {
  const friendlyName = await requestedFriendlyName(request);
  if (!friendlyName) return null;

  const client = authClient(request);
  if (!client) {
    return json(500, {
      error: {
        code: "missing_edge_runtime_config",
        message: "Staff MFA runtime configuration is incomplete.",
        retryable: false,
      },
    });
  }

  const { data, error } = await client.auth.mfa.listFactors();
  if (error) {
    return json(503, {
      error: {
        code: "mfa_factor_state_unavailable",
        message: "Authenticator enrollment state is temporarily unavailable.",
        retryable: true,
      },
    });
  }

  const matching = (Array.isArray(data?.totp) ? data.totp : [])
    .filter((factor: RuntimeFactor) =>
      Boolean(
        factor &&
          typeof factor === "object" &&
          String(factor.friendly_name || "") === friendlyName,
      )
    );

  if (matching.some((factor: RuntimeFactor) => factor.status === "verified")) {
    return json(409, {
      error: {
        code: "mfa_factor_name_conflict",
        message: "An authenticator with this name is already enrolled.",
        retryable: false,
      },
    });
  }

  for (const factor of matching) {
    if (factor.status !== "unverified") continue;
    const factorId = String(factor.id || "");
    if (!factorId) return staleCleanupFailure();
    const { error: cleanupError } = await client.auth.mfa.unenroll({ factorId });
    if (cleanupError) return staleCleanupFailure();
  }

  return null;
}

async function requestedFriendlyName(request: Request): Promise<string | null> {
  try {
    const body = await request.clone().json() as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return DEFAULT_FACTOR_NAME;
    }
    const value = String(body.friendlyName || "").trim();
    return value || DEFAULT_FACTOR_NAME;
  } catch {
    return null;
  }
}

function authClient(request: Request): any | null {
  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  const authorization = String(request.headers.get("authorization") || "").trim();
  if (!supabaseUrl || !anonKey || !authorization) return null;
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  }) as any;
}

async function normalizeStatusResponse(response: Response): Promise<Response> {
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
    return jsonResponseFrom(response, body);
  } catch {
    return response;
  }
}

async function normalizeEnrollmentResponse(
  response: Response,
  request: Request,
): Promise<Response> {
  try {
    const body = await response.clone().json() as Record<string, unknown>;
    const factor = body.factor && typeof body.factor === "object"
      ? body.factor as Record<string, unknown>
      : null;
    if (!factor) return response;

    const normalizedQrCode = normalizeMfaQrCode(factor.qrCode);
    if (!normalizedQrCode) {
      await cleanupAbandonedEnrollment(request);
      return json(500, {
        error: {
          code: "invalid_mfa_qr_payload",
          message: "Authenticator QR code generation failed.",
          retryable: true,
        },
      });
    }
    factor.qrCode = normalizedQrCode;
    body.factor = factor;
    return jsonResponseFrom(response, body);
  } catch {
    return response;
  }
}

function staleCleanupFailure(): Response {
  return json(503, {
    error: {
      code: "mfa_stale_factor_cleanup_failed",
      message: "An abandoned authenticator setup could not be cleared safely.",
      retryable: true,
    },
  });
}

function jsonResponseFrom(response: Response, body: unknown): Response {
  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "private, no-store, max-age=0");
  return new Response(JSON.stringify(body), {
    status: response.status,
    headers,
  });
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
