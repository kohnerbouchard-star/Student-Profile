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
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly enforceVolumetric?: typeof enforcePreAuthRateLimit;
  readonly buildThrottleBuckets?: typeof buildAuthenticationThrottleBuckets;
  readonly checkThrottle?: typeof checkAuthenticationThrottle;
  readonly recordFailure?: typeof recordAuthenticationFailure;
  readonly recordSuccess?: typeof recordAuthenticationSuccess;
  readonly refreshSession?: typeof refreshPasswordSession;
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
  readonly permission_version: number | string;
  readonly security_version: number | string;
  readonly mfa_required: boolean;
}

interface ActivatedStaffRow {
  readonly staff_user_id?: unknown;
  readonly staff_email?: unknown;
  readonly staff_display_name?: unknown;
  readonly staff_status?: unknown;
  readonly staff_role?: unknown;
  readonly permission_version?: unknown;
  readonly security_version?: unknown;
  readonly mfa_required?: unknown;
}

interface PasswordSession {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_at?: number | null;
}

interface PasswordAuthClient {
  signInWithPassword(input: {
    readonly email: string;
    readonly password: string;
  }): PromiseLike<{
    readonly data: {
      readonly session: PasswordSession | null;
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
    const inputResult = await readStaffLoginInput(request);
    if (!inputResult.ok) return inputResult.response;

    const envResult = (dependencies.readEnvironment ?? readSupabaseEnv)();
    if (!envResult.ok) return loginUnavailableResponse();

    const input = inputResult.value;
    const serviceClient = dependencies.createServiceClient(envResult.value);
    const enforceVolumetric = dependencies.enforceVolumetric ?? enforcePreAuthRateLimit;
    const buildThrottleBuckets = dependencies.buildThrottleBuckets ??
      buildAuthenticationThrottleBuckets;
    const checkThrottle = dependencies.checkThrottle ?? checkAuthenticationThrottle;
    const recordFailure = dependencies.recordFailure ?? recordAuthenticationFailure;
    const recordSuccess = dependencies.recordSuccess ?? recordAuthenticationSuccess;

    const volumetricDecision = await enforceVolumetric({
      action: "staff.login.attempt",
      profile: "login",
      request,
    }, serviceClient);
    if (!volumetricDecision.allowed) {
      return rateLimitExceededResponse(volumetricDecision);
    }

    const buckets = await buildThrottleBuckets({
      request,
      realm: "staff",
      accountIdentifier: input.email,
    });
    const before = await checkThrottle(serviceClient, buckets);
    if (!before.allowed) return authenticationThrottledResponse(before);

    const authClient = dependencies.createAuthClient(envResult.value);
    const authResult = await (authClient.auth as unknown as PasswordAuthClient)
      .signInWithPassword({ email: input.email, password: input.password });
    let session = authResult.data.session;
    const authUser = authResult.data.user;

    if (authResult.error || !session?.access_token || !authUser?.id) {
      if (isEmailNotConfirmed(authResult.error)) {
        return emailVerificationRequiredResponse();
      }
      const failure = await recordFailure(serviceClient, buckets);
      return failure.retryAfterSeconds > 0
        ? authenticationThrottledResponse(failure)
        : invalidCredentialsResponse();
    }

    const initialStaffResult = await serviceClient
      .from("staff_users")
      .select(
        "id,email,display_name,status,role,permission_version,security_version,mfa_required",
      )
      .eq("supabase_auth_user_id", authUser.id)
      .maybeSingle();
    if (initialStaffResult.error) return loginUnavailableResponse();

    let staff = initialStaffResult.data as StaffSecurityRow | null;
    let authoritativeMetadata = authUser.app_metadata ?? {};

    if (!staff?.id || staff.status === "onboarding") {
      const activation = await serviceClient.rpc<ActivatedStaffRow[]>(
        "activate_verified_staff_identity_v1",
        { p_auth_user_id: authUser.id },
      );
      const activated = firstActivationRow(activation.data);
      if (activation.error || !activated) {
        await recordFailure(serviceClient, buckets);
        return invalidCredentialsResponse();
      }

      staff = activatedStaff(activated);
      const permissionVersion = Number(staff.permission_version);
      const securityVersion = Number(staff.security_version);
      authoritativeMetadata = {
        econovaria_role: "game_admin",
        permission_version: permissionVersion,
        security_version: securityVersion,
      };
      const metadataUpdate = await serviceClient.auth.admin.updateUserById(
        authUser.id,
        { app_metadata: authoritativeMetadata },
      );
      if (metadataUpdate.error) {
        return jsonError(503, {
          code: "staff_authorization_activation_incomplete",
          message: "Administrator authorization could not be finalized. Sign in again.",
          retryable: true,
        });
      }

      const refresh = await (dependencies.refreshSession ?? refreshPasswordSession)(
        envResult.value,
        session.refresh_token,
      );
      if (!refresh) {
        return jsonError(503, {
          code: "staff_session_refresh_failed",
          message: "Administrator authorization was activated, but the session could not be refreshed. Sign in again.",
          retryable: true,
        });
      }
      session = refresh;
    }

    if (
      !staff?.id ||
      !["active", "onboarding"].includes(staff.status) ||
      staff.role !== "game_admin"
    ) {
      await recordFailure(serviceClient, buckets);
      return invalidCredentialsResponse();
    }

    const permissionVersion = Number(staff.permission_version);
    const securityVersion = Number(staff.security_version);
    if (
      !Number.isSafeInteger(permissionVersion) ||
      permissionVersion < 1 ||
      !Number.isSafeInteger(securityVersion) ||
      securityVersion < 1 ||
      authoritativeMetadata.econovaria_role !== staff.role ||
      Number(authoritativeMetadata.permission_version) !== permissionVersion ||
      Number(authoritativeMetadata.security_version) !== securityVersion
    ) {
      await recordFailure(serviceClient, buckets);
      return jsonError(403, {
        code: "staff_authorization_outdated",
        message: "Staff authorization must be reconciled before sign-in.",
        retryable: false,
      });
    }

    await recordSuccess(serviceClient, buckets);
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
        id: staff.id,
        email: staff.email,
        displayName: staff.display_name,
        role: staff.role,
        status: staff.status,
        permissionVersion,
        securityVersion,
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

async function refreshPasswordSession(
  env: SupabaseEnv,
  refreshToken: string,
): Promise<PasswordSession | null> {
  const response = await fetch(
    `${env.supabaseUrl.replace(/\/+$/u, "")}/auth/v1/token?grant_type=refresh_token`,
    {
      method: "POST",
      headers: {
        apikey: env.supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
      redirect: "error",
    },
  ).catch(() => null);
  if (!response?.ok) return null;
  try {
    const value = await response.json();
    const accessToken = String(value?.access_token || "");
    const nextRefreshToken = String(value?.refresh_token || "");
    if (!accessToken || !nextRefreshToken) return null;
    return {
      access_token: accessToken,
      refresh_token: nextRefreshToken,
      expires_at: Number.isFinite(Number(value?.expires_at))
        ? Number(value.expires_at)
        : null,
    };
  } catch {
    return null;
  }
}

function firstActivationRow(value: ActivatedStaffRow[] | null): ActivatedStaffRow | null {
  return Array.isArray(value) && value[0] && typeof value[0] === "object"
    ? value[0]
    : null;
}

function activatedStaff(row: ActivatedStaffRow): StaffSecurityRow {
  return {
    id: String(row.staff_user_id || ""),
    email: String(row.staff_email || ""),
    display_name: String(row.staff_display_name || "Staff"),
    status: String(row.staff_status || "onboarding"),
    role: String(row.staff_role || "game_admin"),
    permission_version: Number(row.permission_version || 0),
    security_version: Number(row.security_version || 0),
    mfa_required: row.mfa_required !== false,
  };
}

function isEmailNotConfirmed(
  error: { readonly message?: string; readonly code?: string } | null,
): boolean {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return code === "email_not_confirmed" || message.includes("email not confirmed");
}

async function readStaffLoginInput(request: Request): Promise<
  | { readonly ok: true; readonly value: StaffLoginInput }
  | { readonly ok: false; readonly response: Response }
> {
  const contentLength = String(request.headers.get("content-length") || "").trim();
  if (contentLength && (!/^\d{1,10}$/u.test(contentLength) || Number(contentLength) > MAX_LOGIN_BODY_BYTES)) {
    return inputFailure(413, "request_body_too_large", "The sign-in request is too large.");
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await request.arrayBuffer();
  } catch {
    return inputFailure(400, "invalid_request_body", "The sign-in request could not be read.");
  }
  if (bytes.byteLength === 0) {
    return inputFailure(400, "request_body_required", "A JSON sign-in request is required.");
  }
  if (bytes.byteLength > MAX_LOGIN_BODY_BYTES) {
    return inputFailure(413, "request_body_too_large", "The sign-in request is too large.");
  }

  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return inputFailure(400, "invalid_request_body", "The sign-in request must be valid JSON.");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return inputFailure(400, "invalid_request_body", "The sign-in request must be a JSON object.");
  }
  const record = value as Record<string, unknown>;
  const suppliedKeys = Object.keys(record);
  if (suppliedKeys.some((key) => !["email", "password"].includes(key))) {
    return inputFailure(400, "unknown_request_field", "The sign-in request contains an unsupported field.");
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
    password.length > MAX_PASSWORD_LENGTH ||
    /[\u0000-\u001f\u007f]/u.test(email)
  ) {
    return inputFailure(400, "invalid_login_input", "Email and password are required in the allowed format.");
  }

  return { ok: true, value: { email, password } };
}

function inputFailure(status: number, code: string, message: string) {
  return {
    ok: false as const,
    response: jsonError(status, { code, message, retryable: false }),
  };
}

function emailVerificationRequiredResponse(): Response {
  return jsonError(403, {
    code: "staff_email_verification_required",
    message: "Verify your email address before signing in.",
    retryable: false,
  });
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
    return claims?.aal === "aal2"
      ? "aal2"
      : claims?.aal === "aal1"
      ? "aal1"
      : "unknown";
  } catch {
    return "unknown";
  }
}
