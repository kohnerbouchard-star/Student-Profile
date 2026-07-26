import {
  createAuthClient,
  createServiceClient,
  readEdgeSupabaseEnv,
  requirePublishableRequest,
  resolveStaffForRequest,
} from "../_shared/econovariaAuth.ts";
import { validateStaffPassword } from "../../../src/security/staffPasswordPolicy.ts";

const MAX_BODY_BYTES = 4_096;

interface PasswordResetBody {
  readonly password?: unknown;
}

interface SecurityTransitionRow {
  readonly staff_user_id?: unknown;
  readonly staff_role?: unknown;
  readonly permission_version?: unknown;
  readonly security_version?: unknown;
  readonly staff_status?: unknown;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return preflight(request);
  const originFailure = requireAllowedOrigin(request);
  if (originFailure) return originFailure;

  const publishableFailure = await requirePublishableRequest(request);
  if (publishableFailure) return withCors(request, publishableFailure);
  if (request.method !== "POST") {
    return json(request, 405, errorBody(
      "method_not_allowed",
      "Use POST to reset an administrator password.",
    ));
  }
  if (!/^application\/json(?:\s*;|$)/iu.test(
    String(request.headers.get("content-type") || ""),
  )) {
    return json(request, 415, errorBody(
      "unsupported_media_type",
      "Password reset requires an application/json request.",
    ));
  }

  const bodyResult = await readBody(request);
  if (!bodyResult.ok) return bodyResult.response;
  const policy = validateStaffPassword(bodyResult.password);
  if (!policy.ok) {
    return json(request, 400, errorBody(policy.code, policy.message));
  }

  const env = readEdgeSupabaseEnv();
  if (!env.ok) return unavailable(request);
  const resolved = await resolveStaffForRequest(request, env.value, {
    missingMessage: "A valid password-recovery session is required.",
  });
  if (!resolved.ok) return withCors(request, resolved.response);

  const service = resolved.serviceClient as any;
  const passwordUpdate = await service.auth.admin.updateUserById(
    resolved.authUser.id,
    { password: bodyResult.password },
  );
  if (passwordUpdate.error) {
    return json(request, 500, errorBody(
      "password_reset_failed",
      "The administrator password could not be updated.",
    ));
  }

  await revokeAllSessions(
    env.value.supabaseUrl,
    env.value.supabaseAnonKey,
    resolved.accessToken,
  );

  const transitionResponse = await resolved.serviceClient.rpc<
    readonly SecurityTransitionRow[] | SecurityTransitionRow
  >(
    "complete_staff_password_reset_security_v2",
    { p_auth_user_id: resolved.authUser.id },
  );
  const transition = Array.isArray(transitionResponse.data)
    ? transitionResponse.data[0]
    : transitionResponse.data;
  if (transitionResponse.error || !validTransition(transition)) {
    return json(request, 500, errorBody(
      "password_reset_security_transition_failed",
      "The password changed, but the account security transition did not complete. Contact support before signing in.",
    ));
  }

  const appMetadata = {
    ...(resolved.authUser.app_metadata ?? {}),
    econovaria_role: transition.staff_role,
    permission_version: Number(transition.permission_version),
    security_version: Number(transition.security_version),
  };
  const metadataUpdate = await service.auth.admin.updateUserById(
    resolved.authUser.id,
    { app_metadata: appMetadata },
  );
  if (metadataUpdate.error) {
    return json(request, 500, errorBody(
      "password_reset_security_transition_failed",
      "The password changed, but the account security transition did not complete. Contact support before signing in.",
    ));
  }

  return json(request, 200, {
    ok: true,
    passwordReset: true,
    sessionsRevoked: true,
  });
});

async function readBody(request: Request): Promise<
  | { readonly ok: true; readonly password: string }
  | { readonly ok: false; readonly response: Response }
> {
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return { ok: false, response: json(request, 413, errorBody(
      "request_body_too_large",
      "Password reset request is too large.",
    )) };
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) {
    return { ok: false, response: json(request, 413, errorBody(
      "request_body_too_large",
      "Password reset request is too large.",
    )) };
  }

  let body: PasswordResetBody;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, response: json(request, 400, errorBody(
      "invalid_request_body",
      "Password reset request must be valid JSON.",
    )) };
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => key !== "password") ||
    typeof body.password !== "string"
  ) {
    return { ok: false, response: json(request, 400, errorBody(
      "invalid_request_body",
      "Password reset request is invalid.",
    )) };
  }
  return { ok: true, password: body.password };
}

async function revokeAllSessions(
  supabaseUrl: string,
  publishableKey: string,
  accessToken: string,
): Promise<void> {
  await fetch(`${supabaseUrl}/auth/v1/logout?scope=global`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  }).catch(() => null);
}

function validTransition(value: unknown): value is Required<SecurityTransitionRow> {
  if (!value || typeof value !== "object") return false;
  const row = value as SecurityTransitionRow;
  return typeof row.staff_user_id === "string" &&
    row.staff_role === "game_admin" &&
    Number.isSafeInteger(Number(row.permission_version)) &&
    Number(row.permission_version) >= 1 &&
    Number.isSafeInteger(Number(row.security_version)) &&
    Number(row.security_version) >= 2 &&
    row.staff_status === "active";
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

function preflight(request: Request): Response {
  const origin = String(request.headers.get("origin") || "");
  if (!allowedOrigins().has(origin)) return new Response(null, { status: 403 });
  const headers = responseHeaders(request);
  headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "apikey,authorization,content-type");
  headers.set("Access-Control-Max-Age", "600");
  return new Response(null, { status: 204, headers });
}

function withCors(request: Request, response: Response): Response {
  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders(request),
  });
}

function unavailable(request: Request): Response {
  return json(request, 503, errorBody(
    "password_reset_unavailable",
    "Administrator password reset is unavailable.",
  ));
}

function json(request: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(request),
  });
}

function responseHeaders(request: Request): Headers {
  const origin = String(request.headers.get("origin") || "");
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    Vary: "Origin",
  });
  if (allowedOrigins().has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

function errorBody(code: string, message: string) {
  return { ok: false, error: { code, message, retryable: false } };
}
