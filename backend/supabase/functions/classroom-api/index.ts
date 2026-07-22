import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
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
  handlePlayerBankingPublicRequest,
} from "../../../src/domains/economy/api/playerBankingPublicHttpHandler.ts";
import {
  readPlayerBankingPublicRoutePath,
} from "../../../src/domains/economy/api/playerBankingPublicRoutePaths.ts";
import {
  handlePlayerBusinessBankingRequest,
} from "../../../src/domains/business-banking/api/playerBusinessBankingHttpHandler.ts";
import {
  readPlayerBusinessBankingRoutePath,
} from "../../../src/domains/business-banking/api/playerBusinessBankingRoutePaths.ts";
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
  handlePlayerSessionLogoutRequest,
} from "../../../src/domains/players/api/playerSessionLogoutHttpHandler.ts";
import {
  readPlayerSessionLogoutRoutePath,
} from "../../../src/domains/players/api/playerSessionLogoutRoutePaths.ts";
import {
  handlePlayerCapabilityManifestRequest,
} from "../../../src/domains/players/api/playerCapabilityManifestHttpHandler.ts";
import {
  readPlayerCapabilityManifestRoutePath,
} from "../../../src/domains/players/api/playerCapabilityManifestRoutePaths.ts";
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
  handlePlayerContractAcceptanceRequest,
} from "../../../src/domains/contracts/api/playerContractAcceptanceHttpHandler.ts";
import {
  readPlayerContractAcceptanceRoutePath,
} from "../../../src/domains/contracts/api/playerContractAcceptanceRoutePaths.ts";
import {
  handlePlayerContractPublicListRequest,
} from "../../../src/domains/contracts/api/playerContractPublicListHttpHandler.ts";
import {
  readPlayerContractPublicListRoutePath,
} from "../../../src/domains/contracts/api/playerContractPublicListRoutePaths.ts";
import {
  handlePlayerContractPublicSubmitRequest,
} from "../../../src/domains/contracts/api/playerContractPublicSubmitHttpHandler.ts";
import {
  readPlayerContractPublicSubmitRoutePath,
} from "../../../src/domains/contracts/api/playerContractPublicSubmitRoutePaths.ts";
import {
  readPlayerContractRoutePath,
} from "../../../src/domains/contracts/api/playerContractRoutePaths.ts";
import {
  handlePlayerContractRequest,
} from "../../../src/domains/contracts/api/playerContractHttpHandler.ts";
import {
  handlePlayerStorePublicRequest,
} from "../../../src/domains/store/api/playerStorePublicHttpHandler.ts";
import {
  readPlayerStorePublicRoutePath,
} from "../../../src/domains/store/api/playerStorePublicRoutePaths.ts";
import {
  handlePlayerStockMarketReadRequest,
} from "../../../src/domains/stocks/api/playerStockMarketReadHttpHandler.ts";
import {
  handlePlayerStockMarketTradingRequest,
} from "../../../src/domains/stocks/api/playerStockMarketTradingHttpHandler.ts";
import {
  handlePlayerStockAssetListRequest,
} from "../../../src/domains/stocks/api/playerStockAssetListHttpHandler.ts";
import {
  readPlayerStockAssetListRoutePath,
} from "../../../src/domains/stocks/api/playerStockAssetListRoutePaths.ts";
import {
  handlePlayerGameDashboardRequest,
} from "../../../src/domains/game-dashboard/api/playerGameDashboardHttpHandler.ts";
import {
  handlePlayerWorldReadRequest,
} from "../../../src/domains/countries/api/playerWorldReadHttpHandler.ts";
import {
  readPlayerWorldRoutePath,
} from "../../../src/domains/countries/api/playerWorldRoutePaths.ts";
import {
  handlePlayerWorldRuntimeEdgeRequest,
} from "../../../src/domains/world/api/playerWorldRuntimeEdgeAdapter.ts";
import {
  parsePlayerWorldRuntimeRoute,
} from "../../../src/domains/world/api/playerWorldRuntimeRoutePaths.ts";
import {
  handlePlayerInventoryReadRequest,
} from "../../../src/domains/inventory/api/playerInventoryReadHttpHandler.ts";
import {
  readPlayerInventoryRoutePath,
} from "../../../src/domains/inventory/api/playerInventoryRoutePaths.ts";
import {
  handlePlayerInventoryRedemptionRequest,
} from "../../../src/domains/inventory/api/playerInventoryRedemptionHttpHandler.ts";
import {
  readPlayerInventoryRedemptionRoutePath,
} from "../../../src/domains/inventory/api/playerInventoryRedemptionRoutePaths.ts";
import {
  handlePlayerNotificationRequest,
} from "../../../src/domains/notifications/api/playerNotificationHttpHandler.ts";
import {
  readPlayerNotificationRoutePath,
} from "../../../src/domains/notifications/api/playerNotificationRoutePaths.ts";
import {
  handlePlayerStoryDeliveryRequest,
} from "../../../src/domains/notifications/api/playerStoryDeliveryHttpHandler.ts";
import {
  readPlayerStoryDeliveryRoutePath,
} from "../../../src/domains/notifications/api/playerStoryDeliveryRoutePaths.ts";
import {
  handlePlayerMarketplaceRequest,
} from "../../../src/domains/marketplace/api/playerMarketplaceHttpHandler.ts";
import {
  readPlayerMarketplaceRoutePath,
} from "../../../src/domains/marketplace/api/playerMarketplaceRoutePaths.ts";
import {
  readStaffDemoStorylineInitializeRoutePath,
} from "../../../src/domains/storylines/api/demoStorylineRoutePaths.ts";
import {
  handleStaffDemoStorylineInitializationRequest,
} from "../../../src/domains/storylines/api/staffDemoStorylineInitializationHttpHandler.ts";
import {
  dispatchRateLimitedPlayerLoginRequest,
  dispatchRateLimitedReviewedPlayerRequest,
} from "../../../src/security/playerRateLimitDispatch.ts";

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

  const playerCapabilityManifestRoute = readPlayerCapabilityManifestRoutePath(
    url.pathname,
  );

  if (playerCapabilityManifestRoute) {
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      "capabilities",
      () =>
        handlePlayerCapabilityManifestRequest(
          request,
          playerCapabilityManifestRoute,
          { createServiceClient },
        ),
      { createServiceClient },
    );
  }

  const playerWorldRuntimeRoute = parsePlayerWorldRuntimeRoute(url.pathname);

  if (playerWorldRuntimeRoute) {
    const endpointKey = ({
      context: "worldRuntime",
      arrivalClass: "arrivalClass",
      travelQuote: "travelQuote",
      travelExecute: "travelExecute",
      travelComplete: "travelComplete",
      residencyRequest: "residencyRequest",
    } as const)[playerWorldRuntimeRoute.operation];
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      endpointKey,
      () => handlePlayerWorldRuntimeEdgeRequest(request, { createServiceClient }),
      { createServiceClient },
    );
  }

  const playerWorldRoute = readPlayerWorldRoutePath(url.pathname);

  if (playerWorldRoute) {
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      playerWorldRoute.kind,
      () =>
        handlePlayerWorldReadRequest(request, playerWorldRoute, {
          createServiceClient,
        }),
      { createServiceClient },
    );
  }

  const playerInventoryRedemptionRoute = readPlayerInventoryRedemptionRoutePath(
    url.pathname,
  );

  if (playerInventoryRedemptionRoute) {
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      "inventoryRedemption",
      () =>
        handlePlayerInventoryRedemptionRequest(
          request,
          playerInventoryRedemptionRoute,
          { createServiceClient },
        ),
      { createServiceClient },
    );
  }

  const playerInventoryRoute = readPlayerInventoryRoutePath(url.pathname);

  if (playerInventoryRoute) {
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      "inventory",
      () =>
        handlePlayerInventoryReadRequest(request, playerInventoryRoute, {
          createServiceClient,
        }),
      { createServiceClient },
    );
  }

  const playerMarketplaceRoute = readPlayerMarketplaceRoutePath(url.pathname);

  if (playerMarketplaceRoute) {
    const endpointKey = playerMarketplaceRoute.kind === "collection"
      ? request.method === "GET"
        ? "marketplace"
        : "marketplaceListing"
      : playerMarketplaceRoute.kind === "activate"
      ? "marketplaceActivate"
      : playerMarketplaceRoute.kind === "purchase"
      ? "marketplacePurchase"
      : playerMarketplaceRoute.kind === "cancel"
      ? "marketplaceCancel"
      : "marketplaceDispute";
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      endpointKey,
      () =>
        handlePlayerMarketplaceRequest(request, playerMarketplaceRoute, {
          createServiceClient,
        }),
      { createServiceClient },
    );
  }

  const playerStoryDeliveryRoute = readPlayerStoryDeliveryRoutePath(url.pathname);

  if (playerStoryDeliveryRoute) {
    const endpointKey = playerStoryDeliveryRoute.kind === "state"
      ? "storyDeliveryState"
      : "storyDeliveries";
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      endpointKey,
      () =>
        handlePlayerStoryDeliveryRequest(
          request,
          playerStoryDeliveryRoute,
          { createServiceClient },
        ),
      { createServiceClient },
    );
  }

  const playerNotificationRoute = readPlayerNotificationRoutePath(url.pathname);

  if (playerNotificationRoute) {
    const endpointKey = playerNotificationRoute.kind === "markRead"
      ? "notificationsRead"
      : "notifications";
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      endpointKey,
      () =>
        handlePlayerNotificationRequest(
          request,
          playerNotificationRoute,
          { createServiceClient },
        ),
      { createServiceClient },
    );
  }

  const playerLogoutRoute = readPlayerSessionLogoutRoutePath(url.pathname);

  if (playerLogoutRoute) {
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      "logout",
      () =>
        handlePlayerSessionLogoutRequest(request, playerLogoutRoute, {
          createServiceClient,
        }),
      { createServiceClient },
    );
  }

  const playerStockAssetListRoute = readPlayerStockAssetListRoutePath(
    url.pathname,
  );

  if (playerStockAssetListRoute) {
    const endpointKey = playerStockAssetListRoute.kind === "assets"
      ? "market"
      : playerStockAssetListRoute.kind === "asset"
      ? "marketAsset"
      : "marketWatchlist";
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      endpointKey,
      () =>
        handlePlayerStockAssetListRequest(
          request,
          playerStockAssetListRoute,
          { createServiceClient },
        ),
      { createServiceClient },
    );
  }

  const playerStoreRoute = readPlayerStorePublicRoutePath(url.pathname);

  if (playerStoreRoute) {
    const endpointKey = playerStoreRoute.kind === "items"
      ? "store"
      : playerStoreRoute.kind === "quotes"
      ? "storeQuote"
      : "storePurchase";
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      endpointKey,
      () =>
        handlePlayerStorePublicRequest(request, playerStoreRoute, {
          createServiceClient,
        }),
      { createServiceClient },
    );
  }

  if (url.pathname.endsWith("/players/me/game/dashboard")) {
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      "dashboard",
      () =>
        handlePlayerGameDashboardRequest(request, {
          createServiceClient,
        }),
      { createServiceClient },
    );
  }

  const playerContractAcceptanceRoute =
    readPlayerContractAcceptanceRoutePath(url.pathname);

  if (playerContractAcceptanceRoute) {
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      "contractAccept",
      () =>
        handlePlayerContractAcceptanceRequest(
          request,
          playerContractAcceptanceRoute,
          { createServiceClient },
        ),
      { createServiceClient },
    );
  }

  const playerContractPublicSubmitRoute =
    readPlayerContractPublicSubmitRoutePath(url.pathname);

  if (playerContractPublicSubmitRoute) {
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      "contractSubmit",
      () =>
        handlePlayerContractPublicSubmitRequest(
          request,
          playerContractPublicSubmitRoute,
          { createServiceClient },
        ),
      { createServiceClient },
    );
  }

  const playerContractPublicListRoute =
    readPlayerContractPublicListRoutePath(url.pathname);

  if (playerContractPublicListRoute) {
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      "contracts",
      () =>
        handlePlayerContractPublicListRequest(request, {
          createServiceClient,
        }),
      { createServiceClient },
    );
  }

  const playerContractRoute = readPlayerContractRoutePath(url.pathname);

  if (playerContractRoute) {
    return handlePlayerContractRequest(request, playerContractRoute, {
      createServiceClient,
    });
  }

  if (url.pathname.endsWith("/players/me/stocks/portfolio")) {
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      "portfolio",
      () =>
        handlePlayerStockMarketReadRequest(request, "read_portfolio", {
          createServiceClient,
        }),
      { createServiceClient },
    );
  }

  if (url.pathname.endsWith("/players/me/stocks/holdings")) {
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      "portfolio",
      () =>
        handlePlayerStockMarketReadRequest(request, "read_holdings", {
          createServiceClient,
        }),
      { createServiceClient },
    );
  }

  if (url.pathname.endsWith("/players/me/stocks/orders")) {
    if (request.method === "POST") {
      return dispatchRateLimitedReviewedPlayerRequest(
        request,
        "marketOrder",
        () =>
          handlePlayerStockMarketTradingRequest(request, {
            createServiceClient,
          }),
        { createServiceClient },
      );
    }

    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      "portfolio",
      () =>
        handlePlayerStockMarketReadRequest(request, "read_orders", {
          createServiceClient,
        }),
      { createServiceClient },
    );
  }

  if (url.pathname.endsWith("/players/me/stocks/trades")) {
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      "portfolio",
      () =>
        handlePlayerStockMarketReadRequest(request, "read_trades", {
          createServiceClient,
        }),
      { createServiceClient },
    );
  }

  const playerBusinessBankingRoute = readPlayerBusinessBankingRoutePath(
    url.pathname,
  );

  if (playerBusinessBankingRoute) {
    const endpointKey = ({
      businessRead: "business",
      businessCreate: "businessCreate",
      businessProductCreate: "businessProductCreate",
      businessInputPurchase: "businessInputPurchase",
      businessProduction: "businessProduction",
      businessPrice: "businessPrice",
      businessHire: "businessHire",
      businessTerminate: "businessTerminate",
      businessStatus: "businessStatus",
      playerTransfer: "bankTransfer",
      savingsTransfer: "savingsTransfer",
      loansRead: "loans",
      loanApply: "loanApply",
      loanRepay: "loanRepay",
    } as const)[playerBusinessBankingRoute.kind];
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      endpointKey,
      () =>
        handlePlayerBusinessBankingRequest(
          request,
          playerBusinessBankingRoute,
          { createServiceClient },
        ),
      { createServiceClient },
    );
  }

  const playerBankingRoute = readPlayerBankingPublicRoutePath(url.pathname);

  if (playerBankingRoute) {
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      "banking",
      () =>
        handlePlayerBankingPublicRequest(request, {
          createServiceClient,
        }),
      { createServiceClient },
    );
  }

  if (url.pathname.endsWith("/players/me")) {
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      "bootstrap",
      () =>
        handlePlayerSessionBootstrapRequest(request, {
          createServiceClient,
        }),
      { createServiceClient },
    );
  }

  if (url.pathname.endsWith("/players/login")) {
    return dispatchRateLimitedPlayerLoginRequest(
      request,
      () => handlePlayerLoginRequest(request, { createServiceClient }),
      { createServiceClient },
    );
  }

  if (url.pathname.endsWith("/players/attendance/clock-in")) {
    return handlePlayerAttendanceClockInRequest(request, {
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

  const staffDemoStorylineInitializeRoute =
    readStaffDemoStorylineInitializeRoutePath(url.pathname);

  if (staffDemoStorylineInitializeRoute) {
    return handleStaffDemoStorylineInitializationRequest(
      request,
      staffDemoStorylineInitializeRoute,
      {
        resolveStaffForRequest,
      },
    );
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
