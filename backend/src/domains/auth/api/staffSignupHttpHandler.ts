import {
  EdgeActivationError,
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
import { validateStaffPassword } from "../../../security/staffPasswordPolicy.ts";
import {
  sendStaffSignupVerificationEmail,
} from "../application/staffSignupVerificationEmail.ts";
import {
  generateInitialStaffSignupLink,
} from "../application/staffSignupSupabaseLink.ts";

interface StaffSignupDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly enforceVolumetric?: typeof enforcePreAuthRateLimit;
  readonly buildThrottleBuckets?: typeof buildAuthenticationThrottleBuckets;
  readonly checkThrottle?: typeof checkAuthenticationThrottle;
  readonly recordFailure?: typeof recordAuthenticationFailure;
  readonly recordSuccess?: typeof recordAuthenticationSuccess;
  readonly generateSignupLink?: typeof generateInitialStaffSignupLink;
  readonly sendVerificationEmail?: typeof sendStaffSignupVerificationEmail;
  readonly padGenericResponse?: (startedAtMs: number) => Promise<void>;
}

interface StaffSignupInput {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
}

interface SignupClaimRow {
  readonly decision?: unknown;
  readonly signup_request_id?: unknown;
  readonly verification_expires_at?: unknown;
}

const MAX_EMAIL_LENGTH = 320;
const MAX_DISPLAY_NAME_LENGTH = 120;
const SIGNUP_TTL_HOURS = 24;
const RESEND_AFTER_SECONDS = 60;
const MINIMUM_GENERIC_RESPONSE_MS = 1_200;
const MAXIMUM_GENERIC_RESPONSE_JITTER_MS = 200;

export async function handleStaffSignupRequest(
  request: Request,
  dependencies: StaffSignupDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to create a staff account.",
      retryable: false,
    });
  }

  const responseTimingStartedAt = monotonicNow();

  try {
    const envResult = readSupabaseEnv();
    if (!envResult.ok) return signupUnavailableResponse();

    const input = parseStaffSignupInput(await readJsonBody(request));
    const serviceClient = dependencies.createServiceClient(envResult.value);
    const enforceVolumetric = dependencies.enforceVolumetric ?? enforcePreAuthRateLimit;
    const buildThrottleBuckets = dependencies.buildThrottleBuckets ??
      buildAuthenticationThrottleBuckets;
    const checkThrottle = dependencies.checkThrottle ?? checkAuthenticationThrottle;
    const recordFailure = dependencies.recordFailure ?? recordAuthenticationFailure;
    const recordSuccess = dependencies.recordSuccess ?? recordAuthenticationSuccess;
    const generateSignupLink = dependencies.generateSignupLink ??
      generateInitialStaffSignupLink;
    const sendVerificationEmail = dependencies.sendVerificationEmail ??
      sendStaffSignupVerificationEmail;
    const padGenericResponse = dependencies.padGenericResponse ??
      padGenericSignupResponse;

    const volumetricDecision = await enforceVolumetric({
      action: "staff.signup.attempt",
      profile: "login",
      request,
    }, serviceClient);
    if (!volumetricDecision.allowed) {
      return rateLimitExceededResponse(volumetricDecision);
    }

    const throttleBuckets = await buildThrottleBuckets({
      request,
      realm: "staff-signup",
      accountIdentifier: input.email,
    });
    const throttleDecision = await checkThrottle(serviceClient, throttleBuckets);
    if (!throttleDecision.allowed) {
      return authenticationThrottledResponse(throttleDecision);
    }

    const continuationHandle = randomBase64Url(32);
    const emailKey = await sha256Hex(`econovaria.staff-signup.email.v1\n${input.email}`);
    const handleHash = await sha256Hex(
      `econovaria.staff-signup.handle.v1\n${continuationHandle}`,
    );
    const expiresAt = new Date(
      Date.now() + SIGNUP_TTL_HOURS * 60 * 60 * 1000,
    ).toISOString();

    const claimResponse = await serviceClient.rpc<SignupClaimRow[]>(
      "claim_staff_signup_identity_v1",
      {
        p_email_key: emailKey,
        p_normalized_email: input.email,
        p_display_name: input.displayName,
        p_continuation_handle_hash: handleHash,
        p_expires_at: expiresAt,
      },
    );
    if (claimResponse.error) return signupUnavailableResponse();

    const claim = firstRow(claimResponse.data);
    const decision = String(claim?.decision || "");
    const signupRequestId = String(claim?.signup_request_id || "");
    const verificationExpiresAt = safeIsoDate(
      claim?.verification_expires_at,
      expiresAt,
    );
    let returnHandle = randomBase64Url(32);

    if (decision === "create_new" && signupRequestId) {
      const generated = await generateSignupLink(serviceClient, {
        email: input.email,
        password: input.password,
        displayName: input.displayName,
      });
      if (!generated) {
        await serviceClient.rpc("cancel_staff_signup_v1", {
          p_continuation_handle_hash: handleHash,
        });
        await recordFailure(serviceClient, throttleBuckets);
        await safelyPadGenericResponse(padGenericResponse, responseTimingStartedAt);
        return genericSignupResponse(returnHandle, input.email, verificationExpiresAt);
      }

      const attachResponse = await serviceClient.rpc<boolean>(
        "attach_staff_signup_auth_user_v1",
        {
          p_signup_request_id: signupRequestId,
          p_auth_user_id: generated.authUserId,
        },
      );
      if (attachResponse.error || attachResponse.data !== true) {
        await compensateAuthUser(serviceClient, generated.authUserId);
        await serviceClient.rpc("cancel_staff_signup_v1", {
          p_continuation_handle_hash: handleHash,
        });
        return signupUnavailableResponse();
      }

      returnHandle = continuationHandle;
      await sendVerificationEmail({
        email: generated.email,
        displayName: input.displayName,
        tokenHash: generated.tokenHash,
        verificationType: generated.verificationType,
        signupRequestId,
        deliveryVersion: 1,
        expiresAt: verificationExpiresAt,
      });
      await recordSuccess(serviceClient, throttleBuckets);
    } else {
      // Existing verified and pending identities are intentionally
      // indistinguishable and do not trigger email from a fresh public signup.
      await recordSuccess(serviceClient, throttleBuckets);
    }

    await safelyPadGenericResponse(padGenericResponse, responseTimingStartedAt);
    return genericSignupResponse(
      returnHandle,
      input.email,
      verificationExpiresAt,
    );
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    return signupUnavailableResponse();
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }
}

function parseStaffSignupInput(value: unknown): StaffSignupInput {
  if (!isRecord(value)) {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  const allowedKeys = new Set(["email", "password", "displayName"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new EdgeActivationError(
      "unknown_request_field",
      "Request body contains an unsupported field.",
      400,
    );
  }

  const email = requiredText(
    value.email,
    "email_required",
    "email is required.",
    MAX_EMAIL_LENGTH,
  ).toLowerCase();
  const password = typeof value.password === "string" ? value.password : "";
  const passwordResult = validateStaffPassword(password);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new EdgeActivationError("invalid_email", "email must be valid.", 400);
  }
  if (!passwordResult.ok) {
    throw new EdgeActivationError(
      passwordResult.code || "invalid_password",
      passwordResult.message || "Password does not meet the security policy.",
      400,
    );
  }

  return {
    email,
    password,
    displayName: requiredText(
      value.displayName,
      "display_name_required",
      "displayName is required.",
      MAX_DISPLAY_NAME_LENGTH,
    ),
  };
}

function requiredText(
  value: unknown,
  code: string,
  message: string,
  maxLength: number,
): string {
  const normalizedValue = typeof value === "string" ? value.trim() : "";
  if (!normalizedValue) {
    throw new EdgeActivationError(code, message, 400);
  }
  if (
    normalizedValue.length > maxLength ||
    /[\u0000-\u001f\u007f]/u.test(normalizedValue)
  ) {
    throw new EdgeActivationError(
      `${code}_invalid`,
      `${message.replace(/\.$/u, "")} and must be within the allowed length.`,
      400,
    );
  }
  return normalizedValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstRow(value: SignupClaimRow[] | null): SignupClaimRow | null {
  return Array.isArray(value) && isRecord(value[0])
    ? value[0] as SignupClaimRow
    : isRecord(value) ? value as SignupClaimRow : null;
}

async function compensateAuthUser(
  serviceClient: EdgeSupabaseClient,
  authUserId: string,
): Promise<void> {
  try {
    const result = await serviceClient.auth.admin.deleteUser(authUserId);
    if (!result.error) return;
  } catch {
  }
  try {
    await serviceClient.auth.admin.updateUserById(authUserId, {
      ban_duration: "876000h",
    });
  } catch {
  }
}

function genericSignupResponse(
  continuationHandle: string,
  email: string,
  expiresAt: string,
): Response {
  return jsonResponse(202, {
    ok: true,
    signupStatus: "check_email_or_sign_in",
    message: "Check your email. If you already have an account, sign in instead.",
    verification: {
      continuationHandle,
      maskedEmail: maskEmail(email),
      expiresAt,
      resendAfterSeconds: RESEND_AFTER_SECONDS,
    },
  }, {
    "cache-control": "private, no-store, max-age=0",
    "pragma": "no-cache",
    "vary": "Origin, X-Econovaria-Device-Id",
  });
}

function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@", 2);
  const visible = local.slice(0, Math.min(1, local.length));
  return `${visible}${"•".repeat(Math.max(4, Math.min(8, local.length - visible.length)))}@${domain}`;
}

function safeIsoDate(value: unknown, fallback: string): string {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomBase64Url(size: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
}

async function safelyPadGenericResponse(
  pad: (startedAtMs: number) => Promise<void>,
  startedAtMs: number,
): Promise<void> {
  try {
    await pad(startedAtMs);
  } catch {
    // Timing defense failure must not expose account state through a different
    // public response. Operational monitoring should detect runtime failures.
  }
}

async function padGenericSignupResponse(startedAtMs: number): Promise<void> {
  const jitterSource = crypto.getRandomValues(new Uint16Array(1))[0] ?? 0;
  const jitterMs = jitterSource % (MAXIMUM_GENERIC_RESPONSE_JITTER_MS + 1);
  const targetMs = MINIMUM_GENERIC_RESPONSE_MS + jitterMs;
  const remainingMs = Math.ceil(targetMs - (monotonicNow() - startedAtMs));
  if (remainingMs <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, remainingMs));
}

function monotonicNow(): number {
  try {
    return performance.now();
  } catch {
    return Date.now();
  }
}

function authenticationThrottledResponse(
  decision: AuthenticationThrottleDecision,
): Response {
  return jsonResponse(429, {
    ok: false,
    error: {
      code: "authentication_temporarily_locked",
      message: "Too many failed account-creation attempts. Try again later.",
      retryable: true,
    },
  }, {
    "retry-after": String(Math.max(1, decision.retryAfterSeconds)),
    "x-ratelimit-reset": decision.lockedUntil || "",
    "vary": "Origin, X-Econovaria-Device-Id",
  });
}

function signupUnavailableResponse(): Response {
  return jsonError(503, {
    code: "staff_signup_unavailable",
    message: "Staff account signup is temporarily unavailable.",
    retryable: true,
  });
}
