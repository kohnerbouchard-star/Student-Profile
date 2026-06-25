import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  jsonError,
  jsonResponse,
} from "../../../src/platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  resolveStaffSessionForRequest,
  type SupabaseEnv,
} from "../../../src/platform/supabase/edgeStaffSession.ts";
import {
  handleStaffBootstrapRequest,
} from "../../../src/domains/auth/api/staffBootstrapHttpHandler.ts";
import {
  handleStaffSignupRequest,
} from "../../../src/domains/auth/api/staffSignupHttpHandler.ts";
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
import {
  readStaffContractRoutePath,
} from "../../../src/domains/contracts/api/contractRoutePaths.ts";
import {
  handleStaffContractRequest,
} from "../../../src/domains/contracts/api/staffContractHttpHandler.ts";
import {
  handlePlayerStoreCatalogRequest,
} from "../../../src/domains/store/api/playerStoreCatalogHttpHandler.ts";
import {
  handlePlayerStorePurchaseHistoryRequest,
  handlePlayerStorePurchaseRequest,
  handlePlayerStoreQuoteRequest,
} from "../../../src/domains/store/api/playerStorePurchaseHttpHandler.ts";
import {
  handlePlayerStockMarketReadRequest,
} from "../../../src/domains/stocks/api/playerStockMarketReadHttpHandler.ts";
import {
  handlePlayerStockMarketTradingRequest,
} from "../../../src/domains/stocks/api/playerStockMarketTradingHttpHandler.ts";
import {
  handlePlayerGameDashboardRequest,
} from "../../../src/domains/game-dashboard/api/playerGameDashboardHttpHandler.ts";

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

  if (url.pathname.endsWith("/players/me/store/items")) {
    return handlePlayerStoreCatalogRequest(request, {
      createServiceClient,
    });
  }

  if (url.pathname.endsWith("/players/me/store/quote")) {
    return handlePlayerStoreQuoteRequest(request, {
      createServiceClient,
    });
  }

  if (url.pathname.endsWith("/players/me/store/purchases")) {
    if (request.method === "GET") {
      return handlePlayerStorePurchaseHistoryRequest(request, {
        createServiceClient,
      });
    }

    return handlePlayerStorePurchaseRequest(request, {
      createServiceClient,
    });
  }

  if (url.pathname.endsWith("/players/me/game/dashboard")) {
    return handlePlayerGameDashboardRequest(request, {
      createServiceClient,
    });
  }

  if (url.pathname.endsWith("/players/me/stocks/portfolio")) {
    return handlePlayerStockMarketReadRequest(request, "read_portfolio", {
      createServiceClient,
    });
  }

  if (url.pathname.endsWith("/players/me/stocks/holdings")) {
    return handlePlayerStockMarketReadRequest(request, "read_holdings", {
      createServiceClient,
    });
  }

  if (url.pathname.endsWith("/players/me/stocks/orders")) {
    if (request.method === "POST") {
      return handlePlayerStockMarketTradingRequest(request, {
        createServiceClient,
      });
    }

    return handlePlayerStockMarketReadRequest(request, "read_orders", {
      createServiceClient,
    });
  }

  if (url.pathname.endsWith("/players/me/stocks/trades")) {
    return handlePlayerStockMarketReadRequest(request, "read_trades", {
      createServiceClient,
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
    return handleResetGameJoinCodeRequest(
      request,
      gameJoinCodeRoute.gameSessionId,
      {
        resolveStaffForRequest,
      },
    );
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

  const staffContractRoute = readStaffContractRoutePath(url.pathname);

  if (staffContractRoute) {
    return handleStaffContractRequest(request, staffContractRoute, {
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

  const staffAttendanceDailyRoute = readStaffAttendanceDailyRoutePath(
    url.pathname,
  );

  if (staffAttendanceDailyRoute) {
    return handleStaffAttendanceDailyRequest(
      request,
      staffAttendanceDailyRoute.gameSessionId,
      {
        resolveStaffForRequest,
      },
    );
  }

  const staffAttendanceScanRoute = readStaffAttendanceScanRoutePath(
    url.pathname,
  );

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

  const staffPlayerLedgerHistoryRoute = readStaffPlayerLedgerHistoryRoutePath(
    url.pathname,
  );

  if (staffPlayerLedgerHistoryRoute) {
    return handleStaffPlayerLedgerHistoryRequest(
      request,
      staffPlayerLedgerHistoryRoute.gameSessionId,
      staffPlayerLedgerHistoryRoute.playerId,
      { resolveStaffForRequest },
    );
  }

  const staffLedgerAdjustmentRoute = readStaffLedgerAdjustmentRoutePath(
    url.pathname,
  );

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

  if (url.pathname.endsWith("/staff/signup")) {
    return handleStaffSignupRequest(request, {
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

function resolveStaffForRequest(
  request: Request,
  env: SupabaseEnv,
  options: { readonly missingMessage: string },
) {
  return resolveStaffSessionForRequest(
    request,
    env,
    { createAuthClient, createServiceClient },
    options,
  );
}
