import { jsonError, jsonResponse } from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import { enforcePreAuthRateLimit } from "../../../security/playerRateLimitService.ts";
import { rateLimitExceededResponse } from "../../../security/rateLimitHttp.ts";

declare const Deno: {
  readonly env: {
    get(name: string): string | undefined;
  };
};

interface Dependencies {
  readonly createAuthClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly enforceVolumetric?: typeof enforcePreAuthRateLimit;
}

interface SignupEmailAuthClient {
  resend(input: {
    readonly type: "signup";
    readonly email: string;
    readonly options: { readonly emailRedirectTo: string };
  }): PromiseLike<{ readonly error: { readonly message?: string } | null }>;
}

interface ResendClaimRow {
  readonly normalized_email?: unknown;
  readonly allowed?: unknown;
  readonly retry_after_seconds?: unknown;
}

const MAX_BODY_BYTES = 2_048;
const HANDLE_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export async function handleStaffSignupResendRequest(
  request: Request,
  dependencies: Dependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to resend account verification.",
      retryable: false,
    });
  }

  const env = readSupabaseEnv();
  if (!env.ok) return unavailable();
  const serviceClient = dependencies.createServiceClient(env.value);
  const decision = await (dependencies.enforceVolumetric ?? enforcePreAuthRateLimit)({
    action: "staff.signup.verification.resend",
    profile: "login",
    request,
  }, serviceClient);
  if (!decision.allowed) return rateLimitExceededResponse(decision);

  const body = await readBody(request);
  if (!body.ok) return body.response;
  const handle = typeof body.value.continuationHandle === "string"
    ? body.value.continuationHandle.trim()
    : "";
  if (!HANDLE_PATTERN.test(handle)) return genericResponse(60);

  const handleHash = await sha256Hex(
    `econovaria.staff-signup.handle.v1\n${handle}`,
  );
  const claimResult = await serviceClient.rpc<ResendClaimRow[]>(
    "claim_staff_signup_resend_v1",
    { p_continuation_handle_hash: handleHash },
  );
  const claim = Array.isArray(claimResult.data) ? claimResult.data[0] : null;
  const retryAfterSeconds = boundedSeconds(claim?.retry_after_seconds, 60);
  const email = String(claim?.normalized_email || "").trim().toLowerCase();

  if (!claimResult.error && claim?.allowed === true && email) {
    try {
      await (dependencies.createAuthClient(env.value).auth as unknown as SignupEmailAuthClient)
        .resend({
          type: "signup",
          email,
          options: { emailRedirectTo: verificationRedirectUrl(env.value) },
        });
    } catch {
      // The public response remains generic; the user can retry after cooldown.
    }
  }

  return genericResponse(retryAfterSeconds);
}

async function readBody(request: Request): Promise<
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly response: Response }
> {
  const bytes = new Uint8Array(await request.arrayBuffer().catch(() => new ArrayBuffer(0)));
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: jsonError(bytes.byteLength === 0 ? 400 : 413, {
        code: bytes.byteLength === 0 ? "request_body_required" : "request_body_too_large",
        message: "A bounded JSON resend request is required.",
        retryable: false,
      }),
    };
  }
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    if (Object.keys(value).some((key) => key !== "continuationHandle")) throw new Error();
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      response: jsonError(400, {
        code: "invalid_request_body",
        message: "The resend request must be valid JSON.",
        retryable: false,
      }),
    };
  }
}

function verificationRedirectUrl(env: SupabaseEnv): string {
  const configured = environmentValue("ECONOVARIA_EMAIL_VERIFICATION_URL");
  const fallback = `${env.supabaseUrl.replace(/\/+$/u, "")}/functions/v1/admin-email-verification`;
  try {
    const parsed = new URL(configured || fallback);
    return parsed.protocol === "https:" ? parsed.href : fallback;
  } catch {
    return fallback;
  }
}

function environmentValue(name: string): string {
  try {
    return String(Deno.env.get(name) || "").trim();
  } catch {
    return "";
  }
}

function boundedSeconds(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(3600, Math.ceil(parsed))) : fallback;
}

function genericResponse(retryAfterSeconds: number): Response {
  return jsonResponse(202, {
    ok: true,
    signupStatus: "check_email_or_sign_in",
    message: "If verification is still pending, a new email will be sent when allowed.",
    resendAfterSeconds: retryAfterSeconds,
  }, {
    "cache-control": "private, no-store, max-age=0",
    "retry-after": String(retryAfterSeconds),
    "vary": "Origin, X-Econovaria-Device-Id",
  });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function unavailable(): Response {
  return jsonError(503, {
    code: "staff_signup_verification_unavailable",
    message: "Account verification is temporarily unavailable.",
    retryable: true,
  });
}
