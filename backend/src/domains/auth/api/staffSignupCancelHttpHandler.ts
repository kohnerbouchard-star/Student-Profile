import { jsonError, jsonResponse } from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import { enforcePreAuthRateLimit } from "../../../security/playerRateLimitService.ts";
import { rateLimitExceededResponse } from "../../../security/rateLimitHttp.ts";

interface Dependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly enforceVolumetric?: typeof enforcePreAuthRateLimit;
}

const MAX_BODY_BYTES = 2_048;
const HANDLE_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function handleStaffSignupCancelRequest(
  request: Request,
  dependencies: Dependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to cancel account creation.",
      retryable: false,
    });
  }

  const env = readSupabaseEnv();
  if (!env.ok) return unavailable();
  const serviceClient = dependencies.createServiceClient(env.value);
  const decision = await (dependencies.enforceVolumetric ?? enforcePreAuthRateLimit)({
    action: "staff.signup.cancel",
    profile: "login",
    request,
  }, serviceClient);
  if (!decision.allowed) return rateLimitExceededResponse(decision);

  const body = await readBody(request);
  if (!body.ok) return body.response;
  const handle = typeof body.value.continuationHandle === "string"
    ? body.value.continuationHandle.trim()
    : "";
  if (HANDLE_PATTERN.test(handle)) {
    const handleHash = await sha256Hex(
      `econovaria.staff-signup.handle.v1\n${handle}`,
    );
    const result = await serviceClient.rpc<string>("cancel_staff_signup_v1", {
      p_continuation_handle_hash: handleHash,
    });
    const authUserId = String(result.data || "").trim();
    if (!result.error && UUID_PATTERN.test(authUserId)) {
      await removeAuthUser(serviceClient, authUserId);
    }
  }

  return jsonResponse(200, {
    ok: true,
    cancelled: true,
    message: "The pending account request has been cleared when it was eligible.",
  }, {
    "cache-control": "private, no-store, max-age=0",
    "vary": "Origin, X-Econovaria-Device-Id",
  });
}

async function readBody(request: Request): Promise<
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly response: Response }
> {
  const buffer = await request.arrayBuffer().catch(() => new ArrayBuffer(0));
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: jsonError(bytes.byteLength === 0 ? 400 : 413, {
        code: bytes.byteLength === 0 ? "request_body_required" : "request_body_too_large",
        message: "A bounded JSON cancellation request is required.",
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
        message: "The cancellation request must be valid JSON.",
        retryable: false,
      }),
    };
  }
}

async function removeAuthUser(
  serviceClient: EdgeSupabaseClient,
  authUserId: string,
): Promise<void> {
  try {
    const deletion = await serviceClient.auth.admin.deleteUser(authUserId);
    if (!deletion.error) return;
  } catch {
    // Fall through to disabling the unconfirmed identity.
  }
  try {
    await serviceClient.auth.admin.updateUserById(authUserId, {
      ban_duration: "876000h",
    });
  } catch {
    // Cleanup remains fail-closed and no Auth detail is returned publicly.
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function unavailable(): Response {
  return jsonError(503, {
    code: "staff_signup_cancellation_unavailable",
    message: "Account cancellation is temporarily unavailable.",
    retryable: true,
  });
}
