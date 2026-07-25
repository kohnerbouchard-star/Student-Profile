import {
  EdgeActivationError,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import type { JsonObject } from "../../../supabase/tableTypes.ts";
import {
  normalizeRequiredStockMarketWindowSetting,
  StockMarketWindowConfigError,
} from "../../stocks/calendars/stockMarketWindowConfig.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  handleLicensingActivationRequest as handleLicensingActivationRouteRequest,
} from "../../licensing/application/licensingActivationRouteAdapter.ts";
import {
  createLicensingActivationRouteAdapterDependencies,
} from "../../licensing/infrastructure/licensingActivationFactory.ts";
import {
  createSupabaseLicensingActivationRepository,
  type SupabaseLicensingActivationRepositoryClient,
} from "../../licensing/infrastructure/licensingRepository.ts";
import {
  createSupabaseStaffRepository,
  type SupabaseStaffRepositoryClient,
} from "../../../supabase/staffRepository.ts";
import {
  buildAuthenticationThrottleBuckets,
  checkAuthenticationThrottle,
  recordAuthenticationFailure,
  recordAuthenticationSuccess,
  type AuthenticationThrottleBucket,
  type AuthenticationThrottleDecision,
} from "../../../security/authenticationThrottle.ts";
import { enforcePreAuthRateLimit } from "../../../security/playerRateLimitService.ts";
import { rateLimitExceededResponse } from "../../../security/rateLimitHttp.ts";
import { validateStaffPassword } from "../../../security/staffPasswordPolicy.ts";

interface StaffSignupDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly enforceVolumetric?: typeof enforcePreAuthRateLimit;
  readonly buildThrottleBuckets?: typeof buildAuthenticationThrottleBuckets;
  readonly checkThrottle?: typeof checkAuthenticationThrottle;
  readonly recordFailure?: typeof recordAuthenticationFailure;
  readonly recordSuccess?: typeof recordAuthenticationSuccess;
}

interface StaffSignupInput {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  readonly purchaseCode: string;
  readonly gameName: string;
  readonly difficultyPreset: string;
  readonly stockMarketWindow: JsonObject;
}

const VALID_DIFFICULTIES = new Set(["easy", "moderate", "hard", "insane"]);
const CANONICAL_PACK_ID = "econovaria.beta-seed-pack.v1";
const MAX_EMAIL_LENGTH = 320;
const MAX_DISPLAY_NAME_LENGTH = 120;
const MAX_PURCHASE_CODE_LENGTH = 256;
const MAX_GAME_NAME_LENGTH = 160;

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

  try {
    const envResult = readSupabaseEnv();
    if (!envResult.ok) return signupFailedResponse();

    const input = parseStaffSignupInput(await readJsonBody(request));
    const serviceClient = dependencies.createServiceClient(envResult.value);
    const enforceVolumetric = dependencies.enforceVolumetric ?? enforcePreAuthRateLimit;
    const buildThrottleBuckets = dependencies.buildThrottleBuckets ??
      buildAuthenticationThrottleBuckets;
    const checkThrottle = dependencies.checkThrottle ?? checkAuthenticationThrottle;
    const recordFailure = dependencies.recordFailure ?? recordAuthenticationFailure;
    const recordSuccess = dependencies.recordSuccess ?? recordAuthenticationSuccess;

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
    const throttleDecision = await checkThrottle(
      serviceClient,
      throttleBuckets,
    );
    if (!throttleDecision.allowed) {
      return authenticationThrottledResponse(throttleDecision);
    }

    const provisioningPreflight = await serviceClient.rpc(
      "game_provisioning_preflight_v1",
      { p_pack_id: CANONICAL_PACK_ID },
    );
    if (provisioningPreflight.error) {
      return provisioningUnavailableResponse();
    }

    const authResponse = await serviceClient.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      app_metadata: {
        econovaria_role: "game_admin",
        permission_version: 1,
        security_version: 1,
      },
      user_metadata: {
        display_name: input.displayName,
      },
    } as never);
    const authUser = authResponse.data.user;

    if (authResponse.error || !authUser?.id) {
      const failure = await recordFailure(serviceClient, throttleBuckets);
      return failure.retryAfterSeconds > 0
        ? authenticationThrottledResponse(failure)
        : jsonError(409, {
          code: "staff_signup_failed",
          message: "Staff account could not be created.",
          retryable: false,
        });
    }

    try {
      const staffRepository = createSupabaseStaffRepository(
        serviceClient as unknown as SupabaseStaffRepositoryClient,
      );
      const staff = await staffRepository.createStaffUser({
        supabase_auth_user_id: authUser.id,
        email: input.email,
        display_name: input.displayName,
      });
      const activationRepository = createSupabaseLicensingActivationRepository(
        serviceClient as unknown as SupabaseLicensingActivationRepositoryClient,
      );
      const activationResult = await handleLicensingActivationRouteRequest(
        {
          purchaseCode: input.purchaseCode,
          gameName: input.gameName,
          difficultyPreset: input.difficultyPreset,
          stockMarketWindow: input.stockMarketWindow,
        },
        {
          staffUserId: staff.id,
          requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
          source: "bootstrap_api_edge_staff_signup_v2",
        },
        createLicensingActivationRouteAdapterDependencies({
          activationRepository,
        }),
      );

      if (!activationResult.body.ok) {
        await recordFailure(serviceClient, throttleBuckets);
        await compensateStaffSignup(serviceClient, authUser.id);
        return jsonResponse(activationResult.httpStatus, activationResult.body);
      }

      await recordSuccess(serviceClient, throttleBuckets);
      return jsonResponse(201, {
        ok: true,
        staff: {
          email: staff.email,
          displayName: staff.display_name,
          role: "game_admin",
        },
        activation: {
          gameSessionId: activationResult.body.activation.gameSessionId,
          provisioningStatus: "ready",
          packId: CANONICAL_PACK_ID,
        },
      });
    } catch {
      await recordFailure(serviceClient, throttleBuckets);
      await compensateStaffSignup(serviceClient, authUser.id);
      return signupFailedResponse();
    }
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    return signupFailedResponse();
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

  const allowedKeys = new Set([
    "email",
    "password",
    "displayName",
    "purchaseCode",
    "gameName",
    "difficultyPreset",
    "stockMarketWindow",
  ]);
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
  const difficultyPreset = requiredText(
    value.difficultyPreset,
    "difficulty_required",
    "difficultyPreset is required.",
    32,
  ).toLowerCase();
  const stockMarketWindow = parseRequiredStockMarketWindow(
    value.stockMarketWindow,
  );

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
  if (!VALID_DIFFICULTIES.has(difficultyPreset)) {
    throw new EdgeActivationError(
      "invalid_difficulty",
      "difficultyPreset must be easy, moderate, hard, or insane.",
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
    purchaseCode: requiredText(
      value.purchaseCode,
      "purchase_code_required",
      "purchaseCode is required.",
      MAX_PURCHASE_CODE_LENGTH,
    ),
    gameName: requiredText(
      value.gameName,
      "game_name_required",
      "gameName is required.",
      MAX_GAME_NAME_LENGTH,
    ),
    difficultyPreset,
    stockMarketWindow,
  };
}

function parseRequiredStockMarketWindow(value: unknown): JsonObject {
  try {
    return normalizeRequiredStockMarketWindowSetting(value) as JsonObject;
  } catch (error) {
    if (error instanceof StockMarketWindowConfigError) {
      throw new EdgeActivationError(
        "invalid_stock_market_timezone",
        error.message,
        400,
      );
    }
    throw error;
  }
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

async function compensateStaffSignup(
  serviceClient: EdgeSupabaseClient,
  authUserId: string,
): Promise<void> {
  try {
    await serviceClient
      .from("staff_users")
      .delete()
      .eq("supabase_auth_user_id", authUserId);
  } catch {
    // Best-effort cleanup continues by removing or disabling the Auth user.
  }

  try {
    const deleteResult = await serviceClient.auth.admin.deleteUser(authUserId);
    if (deleteResult.error) {
      await serviceClient.auth.admin.updateUserById(authUserId, {
        ban_duration: "876000h",
      });
    }
  } catch {
    try {
      await serviceClient.auth.admin.updateUserById(authUserId, {
        ban_duration: "876000h",
      });
    } catch {
      // Cleanup is best-effort and no internal error is exposed to the browser.
    }
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

function provisioningUnavailableResponse(): Response {
  return jsonError(503, {
    code: "game_provisioning_unavailable",
    message: "Game creation is unavailable until the canonical content pack is ready.",
    retryable: true,
  });
}

function signupFailedResponse(): Response {
  return jsonError(500, {
    code: "staff_signup_failed",
    message: "Staff account signup failed.",
    retryable: false,
  });
}
