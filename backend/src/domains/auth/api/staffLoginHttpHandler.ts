import {
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  buildAuthenticationThrottleBuckets,
  checkAuthenticationThrottle,
  recordAuthenticationFailure,
  recordAuthenticationSuccess,
  type AuthenticationThrottleDecision,
} from "../../../security/authenticationThrottle.ts";
import { enforcePreAuthRateLimit } from "../../../security/playerRateLimitService.ts";
import { rateLimitExceededResponse } from "../../../security/rateLimitHttp.ts";

interface StaffLoginDependencies {
  readonly createAuthClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
}

interface StaffLoginInput {
  readonly email: string;
  readonly password: string;
}

interface StaffSecurityRow {
  readonly id: string;
  readonly email: string;
  readonly display_name: string;
  readonly status: string;
  readonly role: string;
  readonly permission_version: number;
  readonly security_version: number | string;
  readonly mfa_required: boolean;
}

interface PasswordAuthClient {
  signInWithPassword(input: {
    readonly email: string;
    readonly password: string;
  }): PromiseLike<{
    readonly data: {
      readonly session: {
        readonly access_token: string;
        readonly refresh_token: string;
        readonly expires_at?: number | null;
      } | null;
      readonly user: {
        readonly id: string;
        readonly email?: string | null;
        readonly app_metadata?: Record<string, unknown>;
      } | null;
    };
    readonly error: { readonly message: string; readonly code?: string } | null;
  }>;
}

const MAX_LOGIN_BODY_BYTES = 4_096;
const MAX_EMAIL_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 128;

export async function handleStaffLoginRequest(
  request: Request,
  dependencies: StaffLoginDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to sign in as staff.",
      retryable: false,
    });
  }

  try {
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_LOGIN_BODY_BYTES) {
      return jsonError(413, {
        code: "request_body_too_large",
        message: "The sign-in request is too large.",
        retryable: false,
      });
    }

    const envResult = readSupabaseEnv();
    if (!envResult.ok) return loginUnavailableResponse();

    const input = parseStaffLoginInput(await request.json());
    const serviceClient = dependencies.createServiceClient(envResult.value);

    const volumetricDecision = await enforcePreAuthRateLimit({
      action: "staff.login.attempt",
      profile: "login",
      request,
    }, serviceClient);
    if (!volumetricDecision.allowed) {
      return rateLimitExceededResponse(volumetricDecision);
    }

    const buckets = await buildAuthenticationThrottleBuckets({
      request,
      realm: "staff",
      accountIdentifier: input.email,
    });
    const before = await checkAuthenticationThrottle(serviceClient, buckets);
    if (!before.allowed) return authenticationThrottledResponse(before);

    const authClient = dependencies.createAuthClient(envResult.value);
    const authResult = await (authClient.auth as unknown as PasswordAuthClient)
      .signInWithPassword({ email: input.email, password: input.password });
    const session = authResult.data.session;
    const authUser = authResult.data.user;

    if (authResult.error || !session?.access_token || !authUser?.id) {
      const failure = await recordAuthenticationFailure(serviceClient, buckets);
      return failure.retryAfterSeconds > 0
        ? authenticationThrottledResponse(failure)
        : invalidCredentialsResponse();
    }

    const staffResult = await serviceClient
      .from("staff_users")
      .select(
        "id,email,display_name,status,role,permission_version,security_version,mfa_required",
      )
      .eq("supabase_auth_user_id", authUser.id)
      .maybeSingle();
    const staff = staffResult.data as StaffSecurityRow | null;

    if (
      staffResult.error ||
      !staff?.id ||
      staff.status !== "active" ||
      staff.role !== "game_admin"
    ) {
      await recordAuthenticationFailure(serviceClient, buckets);
      return invalidCredentialsResponse();
    }

    await recordAuthenticationSuccess(serviceClient, buckets);
    const assuranceLevel = readJwtAssuranceLevel(session.access_token);

    return jsonResponse(200, {
      ok: true,
      session: {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at
          ? new Date(session.expires_at * 1000).toISOString()
          : null,
        assuranceLevel,
        mfaRequired: staff.mfa_required,
      },
      user: {
        email: staff.email,
        displayName: staff.display_name,
        role: staff.role,
        permissionVersion: staff.permission_version,
        securityVersion: Number(staff.security_version),
      },
    }, {
      "cache-control": "private, no-store, max-age=0",
      "pragma": "no-cache",
      "vary": "Origin, X-Econovaria-Device-Id",
    });
  } catch {
    return loginUnavailableResponse();
  }
}

function parseStaffLoginInput(value: unknown): StaffLoginInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid login body");
  }
  const record = value as Record<string, unknown>;
  const suppliedKeys = Object.keys(record);
  if (suppliedKeys.some((key) => !["email", "password"].includes(key))) {
    throw new Error("unknown login field");
  }

  const email = typeof record.email === "string"
    ? record.email.trim().toLowerCase()
    : "";
  const password = typeof record.password === "string" ? record.password : "";
  if (
    !email ||
    email.length > MAX_EMAIL_LENGTH ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ||
    !password ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    throw new Error("invalid login input");
  }
  return { email, password };
}

function authenticationThrottledResponse(
  decision: AuthenticationThrottleDecision,
): Response {
  const retryAfter = Math.max(1, decision.retryAfterSeconds);
  return jsonResponse(429, {
    ok: false,
    error: {
      code: "authentication_temporarily_locked",
      message: "Too many failed sign-in attempts. Try again later.",
      retryable: true,
    },
  }, {
    "cache-control": "private, no-store, max-age=0",
    "retry-after": String(retryAfter),
    "x-ratelimit-reset": decision.lockedUntil || "",
    "vary": "Origin, X-Econovaria-Device-Id",
  });
}

function invalidCredentialsResponse(): Response {
  return jsonError(401, {
    code: "invalid_staff_credentials",
    message: "The email or password is invalid.",
    retryable: false,
  });
}

function loginUnavailableResponse(): Response {
  return jsonError(503, {
    code: "staff_login_unavailable",
    message: "Staff sign-in is temporarily unavailable.",
    retryable: true,
  });
}

function readJwtAssuranceLevel(token: string): "aal1" | "aal2" | "unknown" {
  try {
    const payload = token.split(".")[1];
    if (!payload) return "unknown";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const claims = JSON.parse(atob(padded));
    return claims?.aal === "aal2" ? "aal2" : claims?.aal === "aal1" ? "aal1" : "unknown";
  } catch {
    return "unknown";
  }
}
