import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EdgeActivationError,
  type EdgeErrorBody,
  jsonError,
  jsonResponse,
} from "../../../src/platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  type SupabaseEnv,
  readSupabaseEnv,
} from "../../../src/platform/supabase/edgeStaffSession.ts";
import { sha256Hex } from "../../../src/platform/supabase/edgeCrypto.ts";
import { extractBearerToken } from "../../../src/platform/supabase/edgeAuth.ts";
import {
  isRecord,
  normalizeCurrencyCode,
  parseOptionalJsonObject,
  parseOptionalText,
  parseRequiredText,
  readBalanceNumber,
} from "../../../src/platform/supabase/edgeParsing.ts";
import {
  readLocalDateForTimeZone,
  readLocalMinutesForTimeZone,
  readOptionalNonNegativeAmount,
  readOptionalTimeMinutes,
} from "../../../src/platform/supabase/edgeTime.ts";
import {
  type GameJoinCodeRoute,
  readGameJoinCodeRoutePath,
} from "../../../src/domains/game-sessions/api/gameJoinCodeRoutePaths.ts";
import {
  handleResetGameJoinCodeRequest,
} from "../../../src/domains/game-sessions/api/gameJoinCodeResetHttpHandler.ts";
import {
  type InitialBalanceSeedRoute,
  type StaffLedgerAdjustmentRoute,
  type StaffPlayerLedgerHistoryRoute,
  readInitialBalanceSeedRoutePath,
  readStaffLedgerAdjustmentRoutePath,
  readStaffPlayerLedgerHistoryRoutePath,
} from "../../../src/domains/economy/api/economyRoutePaths.ts";
import {
  handlePlayerLedgerHistoryRequest,
} from "../../../src/domains/economy/api/playerLedgerHistoryHttpHandler.ts";
import {
  handleStaffPlayerLedgerHistoryRequest,
} from "../../../src/domains/economy/api/staffPlayerLedgerHistoryHttpHandler.ts";
import {
  handleStaffLedgerAdjustmentRequest,
} from "../../../src/domains/economy/api/staffLedgerAdjustmentHttpHandler.ts";
import {
  handleInitialBalanceSeedRequest,
} from "../../../src/domains/economy/api/initialBalanceSeedHttpHandler.ts";
import {
  type StaffAttendanceDailyRoute,
  type StaffAttendanceScanRoute,
  readStaffAttendanceDailyRoutePath,
  readStaffAttendanceScanRoutePath,
} from "../../../src/domains/attendance/api/attendanceRoutePaths.ts";
import {
  readAttendanceDateQuery,
} from "../../../src/domains/attendance/api/attendanceHttpHelpers.ts";
import {
  handleStaffAttendanceDailyRequest,
} from "../../../src/domains/attendance/api/staffAttendanceDailyHttpHandler.ts";
import {
  handleStaffAttendanceScanRequest,
} from "../../../src/domains/attendance/api/staffAttendanceScanHttpHandler.ts";
import {
  handlePlayerAttendanceClockInRequest,
} from "../../../src/domains/attendance/api/playerAttendanceClockInHttpHandler.ts";
import {
  type PlayerRosterRoute,
  readPlayerRosterRoutePath,
} from "../../../src/domains/players/api/playerRosterRoutePaths.ts";
import {
  handlePlayerSessionBootstrapRequest,
} from "../../../src/domains/players/api/playerSessionBootstrapHttpHandler.ts";
import {
  handlePlayerLoginRequest,
} from "../../../src/domains/players/api/playerLoginHttpHandler.ts";
import {
  handlePlayerRosterRequest,
} from "../../../src/domains/players/api/playerRosterHttpHandler.ts";
import {
  handleResetPlayerAccessCodeRequest,
} from "../../../src/domains/players/api/playerAccessCodeResetHttpHandler.ts";
import { isUuid } from "../../../src/platform/supabase/uuid.ts";
import { readGameSettingsRoutePath } from "../../../src/domains/game-sessions/api/gameSettingsRoutePaths.ts";
import {
  type StaffStoreCatalogRoute,
  readStaffStoreCatalogRoutePath,
} from "../../../src/domains/store/api/storeCatalogRoutePaths.ts";
import {
  handleStaffStoreCatalogRequest,
} from "../../../src/domains/store/api/storeCatalogHttpHandler.ts";

interface EdgeHealthBody {
  readonly ok: true;
  readonly service: "classroom-api";
  readonly status: "ready";
}

interface ActivationSuccessBody {
  readonly ok: true;
  readonly activation: {
    readonly gameSessionId: string;
    readonly entitlementId: string;
    readonly purchaseCodeId: string;
    readonly purchaseCodeStatus: string;
    readonly redeemedCount: number;
    readonly maxRedemptions: number;
    readonly activatedAt: string;
  };
}

interface StaffBootstrapBody {
  readonly ok: true;
  readonly staff: {
    readonly id: string;
    readonly supabaseAuthUserId: string;
    readonly email: string;
    readonly displayName: string;
  };
  readonly activeGameSessions: readonly {
    readonly id: string;
    readonly name: string;
    readonly status: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  }[];
}

interface GameSettingsBody {
  readonly ok: true;
  readonly gameSession: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  };
  readonly settings: {
    readonly difficultyPreset: string;
    readonly attendanceWindow: Record<string, unknown>;
    readonly businessMarketWindow: Record<string, unknown>;
    readonly stockMarketWindow: Record<string, unknown>;
    readonly newsSchedule: Record<string, unknown>;
    readonly updatedAt: string;
  };
}

interface GameSettingsPatchBody {
  readonly difficultyPreset?: string | null;
  readonly attendanceWindow?: Record<string, unknown> | null;
  readonly businessMarketWindow?: Record<string, unknown> | null;
  readonly stockMarketWindow?: Record<string, unknown> | null;
  readonly newsSchedule?: Record<string, unknown> | null;
}











      readonly gameSessionId: string;
    }
  | {
      readonly kind: "resetAccessCode";
      readonly gameSessionId: string;
      readonly playerId: string;
    };

interface ActivationRequestBody {
  readonly purchaseCode: string;
  readonly gameName: string;
  readonly difficultyPreset?: string | null;
  readonly attendanceWindow?: Record<string, unknown> | null;
  readonly businessMarketWindow?: Record<string, unknown> | null;
  readonly stockMarketWindow?: Record<string, unknown> | null;
  readonly newsSchedule?: Record<string, unknown> | null;
}

interface ActivationRpcRow {
  readonly game_session_id: string;
  readonly entitlement_id: string;
  readonly purchase_code_id: string;
  readonly purchase_code_status: string;
  readonly redeemed_count: number;
  readonly max_redemptions: number;
  readonly activated_at: string;
}

interface ParsedRequestBodyResult {
  readonly body: ActivationRequestBody;
}

Deno.serve(async (request) => {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return jsonResponse(204, null);
  }

  if (url.pathname.endsWith("/health")) {
    return jsonResponse<EdgeHealthBody>(200, {
      ok: true,
      service: "classroom-api",
      status: "ready",
    });
  }

  if (url.pathname.endsWith("/players/me/ledger")) {
    return handlePlayerLedgerHistoryRequest(request, {
      createServiceClient,
    });
  }

  if (url.pathname.endsWith("/players/me")) {
    return handlePlayerSessionBootstrapRequest(request, {
      createServiceClient,
    });
  }

  if (url.pathname.endsWith("/players/login")) {
    return handlePlayerLoginRequest(request, {
      createServiceClient,
    });
  }

  const gameJoinCodeRoute = readGameJoinCodeRoutePath(url.pathname);

  if (gameJoinCodeRoute) {
    return handleResetGameJoinCodeRequest(request, gameJoinCodeRoute.gameSessionId, {
      resolveStaffForRequest,
    });
  }

  const gameSettingsRoute = readGameSettingsRoutePath(url.pathname);

  if (gameSettingsRoute) {
    return handleGameSettingsRequest(request, gameSettingsRoute.gameSessionId);
  }

  const staffStoreCatalogRoute = readStaffStoreCatalogRoutePath(url.pathname);

  if (staffStoreCatalogRoute) {
    return handleStaffStoreCatalogRequest(request, staffStoreCatalogRoute, {
      resolveStaffForRequest,
    });
  }

  const playerRosterRoute = readPlayerRosterRoutePath(url.pathname);

  if (playerRosterRoute?.kind === "players") {
    return handlePlayerRosterRequest(request, playerRosterRoute.gameSessionId, {
      resolveStaffForRequest,
    });
  }

  if (playerRosterRoute?.kind === "resetAccessCode") {
    return handleResetPlayerAccessCodeRequest(
      request,
      playerRosterRoute.gameSessionId,
      playerRosterRoute.playerId,
      {
        resolveStaffForRequest,
      },
    );
  }

  const staffAttendanceDailyRoute = readStaffAttendanceDailyRoutePath(url.pathname);

  if (staffAttendanceDailyRoute) {
    return handleStaffAttendanceDailyRequest(
      request,
      staffAttendanceDailyRoute.gameSessionId,
      {
        resolveStaffForRequest,
      },
    );
  }

  const staffAttendanceScanRoute = readStaffAttendanceScanRoutePath(url.pathname);

  if (staffAttendanceScanRoute) {
    return handleStaffAttendanceScanRequest(
      request,
      staffAttendanceScanRoute.gameSessionId,
      {
        resolveStaffForRequest,
      },
    );
  }

  const initialBalanceSeedRoute = readInitialBalanceSeedRoutePath(url.pathname);

  if (initialBalanceSeedRoute) {
    return handleInitialBalanceSeedRequest(
      request,
      initialBalanceSeedRoute.gameSessionId,
      { resolveStaffForRequest },
    );
  }

  const staffPlayerLedgerHistoryRoute = readStaffPlayerLedgerHistoryRoutePath(url.pathname);

  if (staffPlayerLedgerHistoryRoute) {
    return handleStaffPlayerLedgerHistoryRequest(
      request,
      staffPlayerLedgerHistoryRoute.gameSessionId,
      staffPlayerLedgerHistoryRoute.playerId,
      { resolveStaffForRequest },
    );
  }

  const staffLedgerAdjustmentRoute = readStaffLedgerAdjustmentRoutePath(url.pathname);

  if (staffLedgerAdjustmentRoute) {
    return handleStaffLedgerAdjustmentRequest(
      request,
      staffLedgerAdjustmentRoute.gameSessionId,
      staffLedgerAdjustmentRoute.playerId,
      { resolveStaffForRequest },
    );
  }

  if (url.pathname.endsWith("/staff/bootstrap")) {
    return handleStaffBootstrapRequest(request);
  }

  if (url.pathname.endsWith("/licensing/activate")) {
    return handleLicensingActivationRequest(request);
  }

  return jsonError(404, {
    code: "route_not_found",
    message: "Classroom API route was not found.",
    retryable: false,
  });
});


function createServiceClient(env: SupabaseEnv): EdgeSupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

interface StaffRequestResolution {
  readonly ok: true;
  readonly staff: {
    readonly id: string;
    readonly supabase_auth_user_id: string;
    readonly email: string;
    readonly display_name: string;
  };
  readonly serviceClient: EdgeSupabaseClient;
}

async function resolveStaffForRequest(
  request: Request,
  env: SupabaseEnv,
  options: { readonly missingMessage: string },
): Promise<
  | StaffRequestResolution
  | {
      readonly ok: false;
      readonly status: number;
      readonly error: EdgeErrorBody["error"];
    }
> {
  const authHeader = request.headers.get("authorization");
  const accessToken = extractBearerToken(authHeader);

  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      error: {
        code: "missing_staff_auth_user",
        message: options.missingMessage,
        retryable: false,
      },
    };
  }

  const authClient = createClient(env.supabaseUrl, env.supabaseAnonKey);
  const authUserResult = await authClient.auth.getUser(accessToken);
  const authUser = authUserResult.data.user;

  if (authUserResult.error || !authUser?.id) {
    return {
      ok: false,
      status: 401,
      error: {
        code: "missing_staff_auth_user",
        message: options.missingMessage,
        retryable: false,
      },
    };
  }

  const serviceClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const staffResponse = await serviceClient
    .from("staff_users")
    .select("id,supabase_auth_user_id,email,display_name")
    .eq("supabase_auth_user_id", authUser.id)
    .maybeSingle();

  if (staffResponse.error) {
    return {
      ok: false,
      status: 500,
      error: {
        code: "staff_lookup_failed",
        message: "Staff lookup failed.",
        retryable: false,
      },
    };
  }

  const staff = staffResponse.data;

  if (!staff?.id) {
    return {
      ok: false,
      status: 403,
      error: {
        code: "staff_not_found",
        message: "No staff user is linked to the Supabase Auth user.",
        retryable: false,
      },
    };
  }

  return {
    ok: true,
    staff,
    serviceClient,
  };
}






















async function handleGameSettingsRequest(
  request: Request,
  gameSessionId: string,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "PATCH") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET or PATCH for game settings.",
      retryable: false,
    });
  }

  try {
    const envResult = readSupabaseEnv();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const staffResult = await resolveStaffForRequest(request, envResult.value, {
      missingMessage: "A verified Supabase Auth user is required to load game settings.",
    });

    if (!staffResult.ok) {
      return jsonError(staffResult.status, staffResult.error);
    }

    const serviceClient = staffResult.serviceClient;

    const gameResponse = await serviceClient
      .from("game_sessions")
      .select("id,name,status,owner_staff_user_id")
      .eq("id", gameSessionId)
      .eq("owner_staff_user_id", staffResult.staff.id)
      .maybeSingle();

    if (gameResponse.error) {
      return jsonError(500, {
        code: "game_settings_failed",
        message: "Game settings request failed.",
        retryable: false,
      });
    }

    const gameSession = gameResponse.data;

    if (!gameSession?.id) {
      return jsonError(404, {
        code: "game_session_not_found",
        message: "Game session was not found for this staff user.",
        retryable: false,
      });
    }

    if (request.method === "PATCH") {
      const patchBody = await readGameSettingsPatchBody(request);
      const updatePayload = buildGameSettingsUpdatePayload(patchBody);

      if (Object.keys(updatePayload).length === 0) {
        return jsonError(400, {
          code: "settings_update_empty",
          message: "At least one game setting must be provided.",
          retryable: false,
        });
      }

      const updateResponse = await serviceClient
        .from("game_settings")
        .update(updatePayload)
        .eq("game_session_id", gameSession.id);

      if (updateResponse.error) {
        return jsonError(500, {
          code: "game_settings_failed",
          message: "Game settings request failed.",
          retryable: false,
        });
      }
    }

    const settingsResponse = await serviceClient
      .from("game_settings")
      .select("difficulty_preset,attendance_window,business_market_window,stock_market_window,news_schedule,updated_at")
      .eq("game_session_id", gameSession.id)
      .maybeSingle();

    if (settingsResponse.error) {
      return jsonError(500, {
        code: "game_settings_failed",
        message: "Game settings request failed.",
        retryable: false,
      });
    }

    const settings = settingsResponse.data;

    if (!settings) {
      return jsonError(404, {
        code: "game_settings_not_found",
        message: "Game settings were not found.",
        retryable: false,
      });
    }

    return jsonResponse<GameSettingsBody>(200, {
      ok: true,
      gameSession: {
        id: gameSession.id,
        name: gameSession.name,
        status: gameSession.status,
      },
      settings: {
        difficultyPreset: settings.difficulty_preset,
        attendanceWindow: readJsonObjectSetting(settings.attendance_window),
        businessMarketWindow: readJsonObjectSetting(settings.business_market_window),
        stockMarketWindow: readJsonObjectSetting(settings.stock_market_window),
        newsSchedule: readJsonObjectSetting(settings.news_schedule),
        updatedAt: settings.updated_at,
      },
    });
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    return jsonError(500, {
      code: "game_settings_failed",
      message: "Game settings request failed.",
      retryable: false,
    });
  }
}

async function handleStaffBootstrapRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to load staff bootstrap data.",
      retryable: false,
    });
  }

  try {
    const envResult = readSupabaseEnv();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const authHeader = request.headers.get("authorization");
    const accessToken = extractBearerToken(authHeader);

    if (!accessToken) {
      return jsonError(401, {
        code: "missing_staff_auth_user",
        message: "A verified Supabase Auth user is required to load staff data.",
        retryable: false,
      });
    }

    const authClient = createClient(
      envResult.value.supabaseUrl,
      envResult.value.supabaseAnonKey,
    );

    const authUserResult = await authClient.auth.getUser(accessToken);
    const authUser = authUserResult.data.user;

    if (authUserResult.error || !authUser?.id) {
      return jsonError(401, {
        code: "missing_staff_auth_user",
        message: "A verified Supabase Auth user is required to load staff data.",
        retryable: false,
      });
    }

    const serviceClient = createClient(
      envResult.value.supabaseUrl,
      envResult.value.supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const staffResponse = await serviceClient
      .from("staff_users")
      .select("id,supabase_auth_user_id,email,display_name")
      .eq("supabase_auth_user_id", authUser.id)
      .maybeSingle();

    if (staffResponse.error) {
      return jsonError(500, {
        code: "staff_bootstrap_failed",
        message: "Staff bootstrap failed.",
        retryable: false,
      });
    }

    const staff = staffResponse.data;

    if (!staff?.id) {
      return jsonError(403, {
        code: "staff_not_found",
        message: "No staff user is linked to the Supabase Auth user.",
        retryable: false,
      });
    }

    const sessionsResponse = await serviceClient
      .from("game_sessions")
      .select("id,name,status,created_at,updated_at")
      .eq("owner_staff_user_id", staff.id)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (sessionsResponse.error) {
      return jsonError(500, {
        code: "staff_bootstrap_failed",
        message: "Staff bootstrap failed.",
        retryable: false,
      });
    }

    return jsonResponse<StaffBootstrapBody>(200, {
      ok: true,
      staff: {
        id: staff.id,
        supabaseAuthUserId: staff.supabase_auth_user_id,
        email: staff.email,
        displayName: staff.display_name,
      },
      activeGameSessions: (sessionsResponse.data ?? []).map((session) => ({
        id: session.id,
        name: session.name,
        status: session.status,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
      })),
    });
  } catch {
    return jsonError(500, {
      code: "staff_bootstrap_failed",
      message: "Staff bootstrap failed.",
      retryable: false,
    });
  }
}

async function handleLicensingActivationRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to activate licensing.",
      retryable: false,
    });
  }

  try {
    const envResult = readSupabaseEnv();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const authHeader = request.headers.get("authorization");
    const accessToken = extractBearerToken(authHeader);

    if (!accessToken) {
      return jsonError(401, {
        code: "missing_staff_auth_user",
        message: "A verified Supabase Auth user is required to activate licensing.",
        retryable: false,
      });
    }

    const authClient = createClient(
      envResult.value.supabaseUrl,
      envResult.value.supabaseAnonKey,
    );

    const authUserResult = await authClient.auth.getUser(accessToken);
    const authUser = authUserResult.data.user;

    if (authUserResult.error || !authUser?.id) {
      return jsonError(401, {
        code: "missing_staff_auth_user",
        message: "A verified Supabase Auth user is required to activate licensing.",
        retryable: false,
      });
    }

    const serviceClient = createClient(
      envResult.value.supabaseUrl,
      envResult.value.supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const parsedBody = await readActivationRequestBody(request);
    const normalizedPurchaseCode = normalizePurchaseCode(parsedBody.body.purchaseCode);
    const purchaseCodeHash = await sha256Hex(normalizedPurchaseCode);
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

    const staffResponse = await serviceClient
      .from("staff_users")
      .select("id,supabase_auth_user_id,email,display_name")
      .eq("supabase_auth_user_id", authUser.id)
      .maybeSingle();

    if (staffResponse.error) {
      return jsonError(500, {
        code: "licensing_activation_failed",
        message: "Purchase-code activation failed.",
        retryable: false,
      });
    }

    if (!staffResponse.data?.id) {
      return jsonError(403, {
        code: "staff_not_found",
        message: "No staff user is linked to the Supabase Auth user.",
        retryable: false,
      });
    }

    const activationResponse = await serviceClient.rpc(
      "redeem_purchase_code_for_game",
      {
        p_staff_user_id: staffResponse.data.id,
        p_purchase_code_hash: purchaseCodeHash,
        p_game_name: parsedBody.body.gameName,
        p_game_settings: buildGameSettings(parsedBody.body),
        p_request_metadata: {
          requestId,
          source: "classroom_api_edge_licensing_activation",
          supabaseAuthUserId: authUser.id,
        },
      },
    );

    if (activationResponse.error) {
      const safeError = mapActivationRpcError(activationResponse.error.message);

      return jsonError(safeError.status, {
        code: safeError.code,
        message: safeError.message,
        retryable: safeError.retryable,
      });
    }

    const activationRow = readActivationRpcRow(activationResponse.data);

    if (!activationRow) {
      return jsonError(500, {
        code: "licensing_activation_failed",
        message: "Purchase-code activation failed.",
        retryable: false,
      });
    }

    return jsonResponse<ActivationSuccessBody>(200, {
      ok: true,
      activation: {
        gameSessionId: activationRow.game_session_id,
        entitlementId: activationRow.entitlement_id,
        purchaseCodeId: activationRow.purchase_code_id,
        purchaseCodeStatus: activationRow.purchase_code_status,
        redeemedCount: activationRow.redeemed_count,
        maxRedemptions: activationRow.max_redemptions,
        activatedAt: activationRow.activated_at,
      },
    });
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    return jsonError(500, {
      code: "licensing_activation_failed",
      message: "Purchase-code activation failed.",
      retryable: false,
    });
  }
}





























async function readGameSettingsPatchBody(
  request: Request,
): Promise<GameSettingsPatchBody> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  if (!isRecord(value)) {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  return {
    difficultyPreset: parseOptionalText(value.difficultyPreset),
    attendanceWindow: parseOptionalJsonObject(value.attendanceWindow),
    businessMarketWindow: parseOptionalJsonObject(value.businessMarketWindow),
    stockMarketWindow: parseOptionalJsonObject(value.stockMarketWindow),
    newsSchedule: parseOptionalJsonObject(value.newsSchedule),
  };
}

function buildGameSettingsUpdatePayload(
  body: GameSettingsPatchBody,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (body.difficultyPreset !== undefined && body.difficultyPreset !== null) {
    payload.difficulty_preset = body.difficultyPreset;
  }

  if (body.attendanceWindow !== undefined && body.attendanceWindow !== null) {
    payload.attendance_window = body.attendanceWindow;
  }

  if (
    body.businessMarketWindow !== undefined &&
    body.businessMarketWindow !== null
  ) {
    payload.business_market_window = body.businessMarketWindow;
  }

  if (body.stockMarketWindow !== undefined && body.stockMarketWindow !== null) {
    payload.stock_market_window = body.stockMarketWindow;
  }

  if (body.newsSchedule !== undefined && body.newsSchedule !== null) {
    payload.news_schedule = body.newsSchedule;
  }

  return payload;
}

function readJsonObjectSetting(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

async function readActivationRequestBody(
  request: Request,
): Promise<ParsedRequestBodyResult> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  if (!isRecord(value)) {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  return {
    body: {
      purchaseCode: parseRequiredText(
        value.purchaseCode,
        "purchase_code_required",
        "purchaseCode is required.",
      ),
      gameName: parseRequiredText(
        value.gameName,
        "game_name_required",
        "gameName is required.",
      ),
      difficultyPreset: parseOptionalText(value.difficultyPreset),
      attendanceWindow: parseOptionalJsonObject(value.attendanceWindow),
      businessMarketWindow: parseOptionalJsonObject(value.businessMarketWindow),
      stockMarketWindow: parseOptionalJsonObject(value.stockMarketWindow),
      newsSchedule: parseOptionalJsonObject(value.newsSchedule),
    },
  };
}













function normalizePurchaseCode(value: string): string {
  const normalizedValue = value
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();

  if (!normalizedValue) {
    throw new EdgeActivationError(
      "purchase_code_required",
      "purchaseCode is required.",
      400,
    );
  }

  if (!/^[A-Z0-9-]+$/.test(normalizedValue)) {
    throw new EdgeActivationError(
      "invalid_request_body",
      "purchaseCode may only contain letters, numbers, and hyphens.",
      400,
    );
  }

  return normalizedValue;
}




function buildGameSettings(
  body: ActivationRequestBody,
): Record<string, unknown> {
  return {
    difficultyPreset: body.difficultyPreset ?? "standard",
    attendanceWindow: body.attendanceWindow ?? {},
    businessMarketWindow: body.businessMarketWindow ?? {},
    stockMarketWindow: body.stockMarketWindow ?? {},
    newsSchedule: body.newsSchedule ?? {},
  };
}

function readActivationRpcRow(value: unknown): ActivationRpcRow | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const row = value[0];

  if (!isRecord(row)) {
    return null;
  }

  if (
    typeof row.game_session_id !== "string" ||
    typeof row.entitlement_id !== "string" ||
    typeof row.purchase_code_id !== "string" ||
    typeof row.purchase_code_status !== "string" ||
    typeof row.redeemed_count !== "number" ||
    typeof row.max_redemptions !== "number" ||
    typeof row.activated_at !== "string"
  ) {
    return null;
  }

  return {
    game_session_id: row.game_session_id,
    entitlement_id: row.entitlement_id,
    purchase_code_id: row.purchase_code_id,
    purchase_code_status: row.purchase_code_status,
    redeemed_count: row.redeemed_count,
    max_redemptions: row.max_redemptions,
    activated_at: row.activated_at,
  };
}

function mapActivationRpcError(message: string): {
  readonly code: string;
  readonly message: string;
  readonly status: number;
  readonly retryable: boolean;
} {
  switch (message.trim().toUpperCase()) {
    case "STAFF_USER_REQUIRED":
    case "PURCHASE_CODE_HASH_REQUIRED":
    case "GAME_NAME_REQUIRED":
      return {
        code: "invalid_redemption_input",
        message: "Activation request is missing required information.",
        status: 400,
        retryable: false,
      };

    case "PURCHASE_CODE_NOT_FOUND":
      return {
        code: "purchase_code_not_found",
        message: "Purchase code was not found.",
        status: 404,
        retryable: false,
      };

    case "PURCHASE_CODE_EXHAUSTED":
      return {
        code: "purchase_code_exhausted",
        message: "Purchase code has already been fully redeemed.",
        status: 409,
        retryable: false,
      };

    case "PURCHASE_CODE_EXPIRED":
      return {
        code: "purchase_code_expired",
        message: "Purchase code has expired.",
        status: 410,
        retryable: false,
      };

    case "PURCHASE_CODE_REVOKED":
      return {
        code: "purchase_code_revoked",
        message: "Purchase code has been revoked.",
        status: 403,
        retryable: false,
      };

    case "PURCHASE_CODE_NOT_ACTIVE":
      return {
        code: "purchase_code_not_active",
        message: "Purchase code is not active.",
        status: 409,
        retryable: false,
      };

    case "PURCHASE_CODE_REDEMPTION_CONFLICT":
      return {
        code: "purchase_code_redemption_conflict",
        message: "Purchase code redemption conflicted with another activation attempt.",
        status: 409,
        retryable: true,
      };

    default:
      return {
        code: "licensing_activation_failed",
        message: "Purchase-code activation failed.",
        status: 500,
        retryable: false,
      };
  }
}
