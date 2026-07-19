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

interface StaffSignupDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
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
const MIN_PASSWORD_LENGTH = 8;

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

    if (!envResult.ok) {
      return signupFailedResponse();
    }

    const input = parseStaffSignupInput(await readJsonBody(request));
    const serviceClient = dependencies.createServiceClient(envResult.value);
    const authResponse = await serviceClient.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
    });
    const authUser = authResponse.data.user;

    if (authResponse.error || !authUser?.id) {
      return jsonError(409, {
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
          source: "classroom_api_edge_staff_signup",
        },
        createLicensingActivationRouteAdapterDependencies({
          activationRepository,
        }),
      );

      if (!activationResult.body.ok) {
        await compensateStaffSignup(serviceClient, authUser.id);
        return jsonResponse(activationResult.httpStatus, activationResult.body);
      }

      return jsonResponse(201, {
        ok: true,
        staff: {
          id: staff.id,
          email: staff.email,
          displayName: staff.display_name,
        },
        activation: {
          gameSessionId: activationResult.body.activation.gameSessionId,
        },
      });
    } catch {
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

  const email = requiredText(
    value.email,
    "email_required",
    "email is required.",
  ).toLowerCase();
  const password = typeof value.password === "string" ? value.password : "";
  const difficultyPreset = requiredText(
    value.difficultyPreset,
    "difficulty_required",
    "difficultyPreset is required.",
  ).toLowerCase();
  const stockMarketWindow = parseRequiredStockMarketWindow(
    value.stockMarketWindow,
  );

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new EdgeActivationError("invalid_email", "email must be valid.", 400);
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new EdgeActivationError(
      "password_too_short",
      `password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
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
    ),
    purchaseCode: requiredText(
      value.purchaseCode,
      "purchase_code_required",
      "purchaseCode is required.",
    ),
    gameName: requiredText(
      value.gameName,
      "game_name_required",
      "gameName is required.",
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
): string {
  const normalizedValue = typeof value === "string" ? value.trim() : "";

  if (!normalizedValue) {
    throw new EdgeActivationError(code, message, 400);
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

function signupFailedResponse(): Response {
  return jsonError(500, {
    code: "staff_signup_failed",
    message: "Staff account signup failed.",
    retryable: false,
  });
}
