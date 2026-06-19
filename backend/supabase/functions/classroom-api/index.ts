import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type EdgeErrorBody,
  jsonError,
  jsonResponse,
} from "../../../src/platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  type SupabaseEnv,
  readSupabaseEnv,
} from "../../../src/platform/supabase/edgeStaffSession.ts";
import { extractBearerToken } from "../../../src/platform/supabase/edgeAuth.ts";
import {
  handleStaffBootstrapRequest,
} from "../../../src/domains/auth/api/staffBootstrapHttpHandler.ts";
import {
  handleLicensingActivationRequest,
} from "../../../src/domains/licensing/api/licensingActivationHttpHandler.ts";
import {
  readGameJoinCodeRoutePath,
} from "../../../src/domains/game-sessions/api/gameJoinCodeRoutePaths.ts";
import {
  handleResetGameJoinCodeRequest,
} from "../../../src/domains/game-sessions/api/gameJoinCodeResetHttpHandler.ts";
import {
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
  readStaffAttendanceDailyRoutePath,
  readStaffAttendanceScanRoutePath,
} from "../../../src/domains/attendance/api/attendanceRoutePaths.ts";
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
import { readGameSettingsRoutePath } from "../../../src/domains/game-sessions/api/gameSettingsRoutePaths.ts";
import {
  handleGameSettingsRequest,
} from "../../../src/domains/game-sessions/api/gameSettingsHttpHandler.ts";
import {
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
    return handleGameSettingsRequest(request, gameSettingsRoute.gameSessionId, {
      resolveStaffForRequest,
    });
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
    return handleStaffBootstrapRequest(request, {
      createAuthClient,
      createServiceClient,
    });
  }

  if (url.pathname.endsWith("/licensing/activate")) {
    return handleLicensingActivationRequest(request, {
      createAuthClient,
      createServiceClient,
    });
  }

  return jsonError(404, {
    code: "route_not_found",
    message: "Classroom API route was not found.",
    retryable: false,
  });
});


function createAuthClient(env: SupabaseEnv): EdgeSupabaseClient {
  return createClient(
    env.supabaseUrl,
    env.supabaseAnonKey,
  ) as unknown as EdgeSupabaseClient;
}

function createServiceClient(env: SupabaseEnv): EdgeSupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }) as unknown as EdgeSupabaseClient;
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

  const authClient = createAuthClient(env);
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

  const serviceClient = createServiceClient(env);

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

  const staff = staffResponse.data as StaffRequestResolution["staff"] | null;

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
