import {
  readEdgeSupabaseEnv,
  requirePublishableRequest,
} from "../_shared/econovariaAuth.ts";
import {
  constantTimeTextEqual,
  openWebAdminSession,
  parseCookieHeader,
  readWebAdminSessionKey,
  WEB_ADMIN_SESSION_COOKIE,
  WEB_ADMIN_SESSION_LOCAL_COOKIE,
} from "../../../src/security/webAdminSession.ts";

const CSRF_HEADER = "x-econovaria-csrf-token";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return preflight(request);
  const originFailure = requireAllowedOrigin(request);
  if (originFailure) return originFailure;
  const publishableFailure = await requirePublishableRequest(request);
  if (publishableFailure) return withCors(request, publishableFailure);
  if (request.method !== "POST") {
    return json(request, 405, errorBody(
      "method_not_allowed",
      "Use POST to sign out an administrator.",
    ));
  }

  const env = readEdgeSupabaseEnv();
  if (!env.ok) return unavailable(request);

  let key: Uint8Array;
  try {
    key = readWebAdminSessionKey();
  } catch {
    return unavailable(request);
  }

  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const envelope = cookies.get(WEB_ADMIN_SESSION_COOKIE) ||
    cookies.get(WEB_ADMIN_SESSION_LOCAL_COOKIE) || "";
  if (!envelope) {
    return clearSessionResponse(request, 200, { ok: true, alreadySignedOut: true });
  }

  let session;
  try {
    session = await openWebAdminSession(envelope, key);
  } catch {
    return clearSessionResponse(request, 200, { ok: true, alreadySignedOut: true });
  }

  const suppliedCsrf = String(request.headers.get(CSRF_HEADER) || "");
  if (!constantTimeTextEqual(suppliedCsrf, session.csrfToken)) {
    return json(request, 403, errorBody(
      "csrf_validation_failed",
      "Administrator request verification failed.",
    ));
  }

  const revoked = await revokeAuthSession(
    env.value.supabaseUrl,
    env.value.supabaseAnonKey,
    session.accessToken,
  );
  if (!revoked) {
    return clearSessionResponse(request, 502, errorBody(
      "staff_logout_revocation_failed",
      "The local administrator session was closed, but server revocation could not be confirmed.",
      true,
    ));
  }

  return clearSessionResponse(request, 200, {
    ok: true,
    signedOut: true,
    sessionRevoked: true,
  });
});

async function revokeAuthSession(
  supabaseUrl: string,
  publishableKey: string,
  accessToken: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${supabaseUrl}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      redirect: "manual",
    }).catch(() => null);
    if (response?.ok || response?.status === 401) return true;
  }
  return false;
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
  headers.set(
    "Access-Control-Allow-Headers",
    "apikey,content-type,x-econovaria-csrf-token",
  );
  headers.set("Access-Control-Max-Age", "600");
  return new Response(null, { status: 204, headers });
}

function clearSessionResponse(
  request: Request,
  status: number,
  body: unknown,
): Response {
  const headers = responseHeaders(request);
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

function withCors(request: Request, response: Response): Response {
  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders(request),
  });
}

function unavailable(request: Request): Response {
  return json(request, 503, errorBody(
    "staff_logout_unavailable",
    "Administrator sign-out is unavailable.",
    true,
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
    "Cross-Origin-Resource-Policy": "same-site",
    Vary: "Origin",
  });
  if (allowedOrigins().has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  return headers;
}

function errorBody(code: string, message: string, retryable = false) {
  return { ok: false, error: { code, message, retryable } };
}
