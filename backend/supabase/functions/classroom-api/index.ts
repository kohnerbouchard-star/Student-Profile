import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { jsonError, jsonResponse } from "../../../src/platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  resolveStaffSessionForRequest,
  type SupabaseEnv,
} from "../../../src/platform/supabase/edgeStaffSession.ts";
import { handleStaffBootstrapRequest } from "../../../src/domains/auth/api/staffBootstrapHttpHandler.ts";
import { handleStaffSignupRequest } from "../../../src/domains/auth/api/staffSignupHttpHandler.ts";
import { handleLicensingActivationRequest } from "../../../src/domains/licensing/api/licensingActivationHttpHandler.ts";
import { readGameJoinCodeRoutePath } from "../../../src/domains/game-sessions/api/gameJoinCodeRoutePaths.ts";
import { handleResetGameJoinCodeRequest } from "../../../src/domains/game-sessions/api/gameJoinCodeResetHttpHandler.ts";
import {
  readInitialBalanceSeedRoutePath,
  readStaffLedgerAdjustmentRoutePath,
  readStaffPlayerLedgerHistoryRoutePath,
} from "../../../src/domains/economy/api/economyRoutePaths.ts";
import { handlePlayerBankingPublicRequest } from "../../../src/domains/economy/api/playerBankingPublicHttpHandler.ts";
import { readPlayerBankingPublicRoutePath } from "../../../src/domains/economy/api/playerBankingPublicRoutePaths.ts";
import { handleStaffPlayerLedgerHistoryRequest } from "../../../src/domains/economy/api/staffPlayerLedgerHistoryHttpHandler.ts";
import { handleStaffLedgerAdjustmentRequest } from "../../../src/domains/economy/api/staffLedgerAdjustmentHttpHandler.ts";
import { handleInitialBalanceSeedRequest } from "../../../src/domains/economy/api/initialBalanceSeedHttpHandler.ts";
import {
  readStaffAttendanceDailyRoutePath,
  readStaffAttendanceScanRoutePath,
} from "../../../src/domains/attendance/api/attendanceRoutePaths.ts";
import { handleStaffAttendanceDailyRequest } from "../../../src/domains/attendance/api/staffAttendanceDailyHttpHandler.ts";
import { handleStaffAttendanceScanRequest } from "../../../src/domains/attendance/api/staffAttendanceScanHttpHandler.ts";
import { handlePlayerAttendanceClockInRequest } from "../../../src/domains/attendance/api/playerAttendanceClockInHttpHandler.ts";
import { readPlayerRosterRoutePath } from "../../../src/domains/players/api/playerRosterRoutePaths.ts";
import { handlePlayerSessionBootstrapRequest } from "../../../src/domains/players/api/playerSessionBootstrapHttpHandler.ts";
import { handlePlayerSessionLogoutRequest } from "../../../src/domains/players/api/playerSessionLogoutHttpHandler.ts";
import { readPlayerSessionLogoutRoutePath } from "../../../src/domains/players/api/playerSessionLogoutRoutePaths.ts";
import { handlePlayerCapabilityManifestRequest } from "../../../src/domains/players/api/playerCapabilityManifestHttpHandler.ts";
import { readPlayerCapabilityManifestRoutePath } from "../../../src/domains/players/api/playerCapabilityManifestRoutePaths.ts";
import { handlePlayerLoginRequest } from "../../../src/domains/players/api/playerLoginHttpHandler.ts";
import { handlePlayerRosterRequest } from "../../../src/domains/players/api/playerRosterHttpHandler.ts";
import { handleResetPlayerAccessCodeRequest } from "../../../src/domains/players/api/playerAccessCodeResetHttpHandler.ts";
import { readGameSettingsRoutePath } from "../../../src/domains/game-sessions/api/gameSettingsRoutePaths.ts";
import { handleGameSettingsRequest } from "../../../src/domains/game-sessions/api/gameSettingsHttpHandler.ts";
import { readStaffStoreCatalogRoutePath } from "../../../src/domains/store/api/storeCatalogRoutePaths.ts";
import { handleStaffStoreCatalogRequest } from "../../../src/domains/store/api/storeCatalogHttpHandler.ts";
import { readStaffContractRoutePath } from "../../../src/domains/contracts/api/contractRoutePaths.ts";
import { handleStaffContractRequest } from "../../../src/domains/contracts/api/staffContractHttpHandler.ts";
import { handlePlayerContractAcceptanceRequest } from "../../../src/domains/contracts/api/playerContractAcceptanceHttpHandler.ts";
import { readPlayerContractAcceptanceRoutePath } from "../../../src/domains/contracts/api/playerContractAcceptanceRoutePaths.ts";
import { handlePlayerContractPublicListRequest } from "../../../src/domains/contracts/api/playerContractPublicListHttpHandler.ts";
import { readPlayerContractPublicListRoutePath } from "../../../src/domains/contracts/api/playerContractPublicListRoutePaths.ts";
import { handlePlayerContractPublicSubmitRequest } from "../../../src/domains/contracts/api/playerContractPublicSubmitHttpHandler.ts";
import { readPlayerContractPublicSubmitRoutePath } from "../../../src/domains/contracts/api/playerContractPublicSubmitRoutePaths.ts";
import { readPlayerContractRoutePath } from "../../../src/domains/contracts/api/playerContractRoutePaths.ts";
import { handlePlayerContractRequest } from "../../../src/domains/contracts/api/playerContractHttpHandler.ts";
import { handlePlayerStorePublicRequest } from "../../../src/domains/store/api/playerStorePublicHttpHandler.ts";
import { readPlayerStorePublicRoutePath } from "../../../src/domains/store/api/playerStorePublicRoutePaths.ts";
import { handlePlayerStockMarketReadRequest } from "../../../src/domains/stocks/api/playerStockMarketReadHttpHandler.ts";
import { handlePlayerStockMarketTradingRequest } from "../../../src/domains/stocks/api/playerStockMarketTradingHttpHandler.ts";
import { handlePlayerStockAssetListRequest } from "../../../src/domains/stocks/api/playerStockAssetListHttpHandler.ts";
import { readPlayerStockAssetListRoutePath } from "../../../src/domains/stocks/api/playerStockAssetListRoutePaths.ts";
import { handlePlayerGameDashboardRequest } from "../../../src/domains/game-dashboard/api/playerGameDashboardHttpHandler.ts";
import { handlePlayerWorldReadRequest } from "../../../src/domains/countries/api/playerWorldReadHttpHandler.ts";
import { readPlayerWorldRoutePath } from "../../../src/domains/countries/api/playerWorldRoutePaths.ts";
import { handlePlayerInventoryReadRequest } from "../../../src/domains/inventory/api/playerInventoryReadHttpHandler.ts";
import { readPlayerInventoryRoutePath } from "../../../src/domains/inventory/api/playerInventoryRoutePaths.ts";
import { handlePlayerInventoryRedemptionRequest } from "../../../src/domains/inventory/api/playerInventoryRedemptionHttpHandler.ts";
import { readPlayerInventoryRedemptionRoutePath } from "../../../src/domains/inventory/api/playerInventoryRedemptionRoutePaths.ts";
import { handlePlayerNotificationRequest } from "../../../src/domains/notifications/api/playerNotificationHttpHandler.ts";
import { readPlayerNotificationRoutePath } from "../../../src/domains/notifications/api/playerNotificationRoutePaths.ts";
import { handlePlayerStoryDeliveryRequest } from "../../../src/domains/notifications/api/playerStoryDeliveryHttpHandler.ts";
import { readPlayerStoryDeliveryRoutePath } from "../../../src/domains/notifications/api/playerStoryDeliveryRoutePaths.ts";
import { handlePlayerMarketplaceRequest } from "../../../src/domains/marketplace/api/playerMarketplaceHttpHandler.ts";
import { readPlayerMarketplaceRoutePath } from "../../../src/domains/marketplace/api/playerMarketplaceRoutePaths.ts";
import { readStaffDemoStorylineInitializeRoutePath } from "../../../src/domains/storylines/api/demoStorylineRoutePaths.ts";
import { handleStaffDemoStorylineInitializationRequest } from "../../../src/domains/storylines/api/staffDemoStorylineInitializationHttpHandler.ts";
import {
  dispatchRateLimitedPlayerLoginRequest,
  dispatchRateLimitedReviewedPlayerRequest,
} from "../../../src/security/playerRateLimitDispatch.ts";

interface EdgeHealthBody { readonly ok: true; readonly service: "classroom-api"; readonly status: "ready" }

Deno.serve(async (request) => {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return jsonResponse(204, null);
  if (url.pathname.endsWith("/health")) {
    return jsonResponse<EdgeHealthBody>(200, { ok: true, service: "classroom-api", status: "ready" });
  }

  const capabilityRoute = readPlayerCapabilityManifestRoutePath(url.pathname);
  if (capabilityRoute) return reviewed(request, "capabilities", () => handlePlayerCapabilityManifestRequest(request, capabilityRoute, { createServiceClient }));

  const worldRoute = readPlayerWorldRoutePath(url.pathname);
  if (worldRoute) return reviewed(request, worldRoute.kind, () => handlePlayerWorldReadRequest(request, worldRoute, { createServiceClient }));

  const redemptionRoute = readPlayerInventoryRedemptionRoutePath(url.pathname);
  if (redemptionRoute) return reviewed(request, "inventoryRedemption", () => handlePlayerInventoryRedemptionRequest(request, redemptionRoute, { createServiceClient }));

  const inventoryRoute = readPlayerInventoryRoutePath(url.pathname);
  if (inventoryRoute) return reviewed(request, "inventory", () => handlePlayerInventoryReadRequest(request, inventoryRoute, { createServiceClient }));

  const marketplaceRoute = readPlayerMarketplaceRoutePath(url.pathname);
  if (marketplaceRoute) {
    const endpointKey = marketplaceRoute.kind === "collection"
      ? request.method === "GET" ? "marketplace" : "marketplaceListing"
      : marketplaceRoute.kind === "activate" ? "marketplaceActivate"
      : marketplaceRoute.kind === "purchase" ? "marketplacePurchase"
      : marketplaceRoute.kind === "cancel" ? "marketplaceCancel"
      : "marketplaceDispute";
    return reviewed(request, endpointKey, () => handlePlayerMarketplaceRequest(request, marketplaceRoute, { createServiceClient }));
  }

  const storyRoute = readPlayerStoryDeliveryRoutePath(url.pathname);
  if (storyRoute) return reviewed(request, storyRoute.kind === "state" ? "storyDeliveryState" : "storyDeliveries", () => handlePlayerStoryDeliveryRequest(request, storyRoute, { createServiceClient }));

  const notificationRoute = readPlayerNotificationRoutePath(url.pathname);
  if (notificationRoute) return reviewed(request, notificationRoute.kind === "markRead" ? "notificationsRead" : "notifications", () => handlePlayerNotificationRequest(request, notificationRoute, { createServiceClient }));

  const logoutRoute = readPlayerSessionLogoutRoutePath(url.pathname);
  if (logoutRoute) return reviewed(request, "logout", () => handlePlayerSessionLogoutRequest(request, logoutRoute, { createServiceClient }));

  const assetRoute = readPlayerStockAssetListRoutePath(url.pathname);
  if (assetRoute) {
    const endpointKey = assetRoute.kind === "assets" ? "market" : assetRoute.kind === "asset" ? "marketAsset" : "marketWatchlist";
    return reviewed(request, endpointKey, () => handlePlayerStockAssetListRequest(request, assetRoute, { createServiceClient }));
  }

  const storeRoute = readPlayerStorePublicRoutePath(url.pathname);
  if (storeRoute) {
    const endpointKey = storeRoute.kind === "items" ? "store" : storeRoute.kind === "quotes" ? "storeQuote" : "storePurchase";
    return reviewed(request, endpointKey, () => handlePlayerStorePublicRequest(request, storeRoute, { createServiceClient }));
  }

  if (url.pathname.endsWith("/players/me/game/dashboard")) return reviewed(request, "dashboard", () => handlePlayerGameDashboardRequest(request, { createServiceClient }));

  const acceptanceRoute = readPlayerContractAcceptanceRoutePath(url.pathname);
  if (acceptanceRoute) return reviewed(request, "contractAccept", () => handlePlayerContractAcceptanceRequest(request, acceptanceRoute, { createServiceClient }));

  const submitRoute = readPlayerContractPublicSubmitRoutePath(url.pathname);
  if (submitRoute) return reviewed(request, "contractSubmit", () => handlePlayerContractPublicSubmitRequest(request, submitRoute, { createServiceClient }));

  const publicContractRoute = readPlayerContractPublicListRoutePath(url.pathname);
  if (publicContractRoute) return reviewed(request, "contracts", () => handlePlayerContractPublicListRequest(request, { createServiceClient }));

  const contractRoute = readPlayerContractRoutePath(url.pathname);
  if (contractRoute) return handlePlayerContractRequest(request, contractRoute, { createServiceClient });

  if (url.pathname.endsWith("/players/me/stocks/portfolio")) return reviewed(request, "portfolio", () => handlePlayerStockMarketReadRequest(request, "read_portfolio", { createServiceClient }));
  if (url.pathname.endsWith("/players/me/stocks/holdings")) return reviewed(request, "portfolio", () => handlePlayerStockMarketReadRequest(request, "read_holdings", { createServiceClient }));
  if (url.pathname.endsWith("/players/me/stocks/orders")) {
    return request.method === "POST"
      ? reviewed(request, "marketOrder", () => handlePlayerStockMarketTradingRequest(request, { createServiceClient }))
      : reviewed(request, "portfolio", () => handlePlayerStockMarketReadRequest(request, "read_orders", { createServiceClient }));
  }
  if (url.pathname.endsWith("/players/me/stocks/trades")) return reviewed(request, "portfolio", () => handlePlayerStockMarketReadRequest(request, "read_trades", { createServiceClient }));

  const bankingRoute = readPlayerBankingPublicRoutePath(url.pathname);
  if (bankingRoute) return reviewed(request, "banking", () => handlePlayerBankingPublicRequest(request, { createServiceClient }));

  if (url.pathname.endsWith("/players/me")) return reviewed(request, "bootstrap", () => handlePlayerSessionBootstrapRequest(request, { createServiceClient }));
  if (url.pathname.endsWith("/players/login")) return dispatchRateLimitedPlayerLoginRequest(request, () => handlePlayerLoginRequest(request, { createServiceClient }), { createServiceClient });
  if (url.pathname.endsWith("/players/attendance/clock-in")) return handlePlayerAttendanceClockInRequest(request, { createServiceClient });

  const joinCodeRoute = readGameJoinCodeRoutePath(url.pathname);
  if (joinCodeRoute) return handleResetGameJoinCodeRequest(request, joinCodeRoute.gameSessionId, { resolveStaffForRequest });
  const gameSettingsRoute = readGameSettingsRoutePath(url.pathname);
  if (gameSettingsRoute) return handleGameSettingsRequest(request, gameSettingsRoute.gameSessionId, { resolveStaffForRequest });
  const storeCatalogRoute = readStaffStoreCatalogRoutePath(url.pathname);
  if (storeCatalogRoute) return handleStaffStoreCatalogRequest(request, storeCatalogRoute, { resolveStaffForRequest });
  const staffContractRoute = readStaffContractRoutePath(url.pathname);
  if (staffContractRoute) return handleStaffContractRequest(request, staffContractRoute, { resolveStaffForRequest });
  const storylineRoute = readStaffDemoStorylineInitializeRoutePath(url.pathname);
  if (storylineRoute) return handleStaffDemoStorylineInitializationRequest(request, storylineRoute, { resolveStaffForRequest });

  const rosterRoute = readPlayerRosterRoutePath(url.pathname);
  if (rosterRoute?.kind === "players") return handlePlayerRosterRequest(request, rosterRoute.gameSessionId, { resolveStaffForRequest });
  if (rosterRoute?.kind === "resetAccessCode") return handleResetPlayerAccessCodeRequest(request, rosterRoute.gameSessionId, rosterRoute.playerId, { resolveStaffForRequest });

  const dailyRoute = readStaffAttendanceDailyRoutePath(url.pathname);
  if (dailyRoute) return handleStaffAttendanceDailyRequest(request, dailyRoute.gameSessionId, { resolveStaffForRequest });
  const scanRoute = readStaffAttendanceScanRoutePath(url.pathname);
  if (scanRoute) return handleStaffAttendanceScanRequest(request, scanRoute.gameSessionId, { resolveStaffForRequest });
  const initialBalanceRoute = readInitialBalanceSeedRoutePath(url.pathname);
  if (initialBalanceRoute) return handleInitialBalanceSeedRequest(request, initialBalanceRoute.gameSessionId, { resolveStaffForRequest });
  const ledgerHistoryRoute = readStaffPlayerLedgerHistoryRoutePath(url.pathname);
  if (ledgerHistoryRoute) return handleStaffPlayerLedgerHistoryRequest(request, ledgerHistoryRoute.gameSessionId, ledgerHistoryRoute.playerId, { resolveStaffForRequest });
  const ledgerAdjustmentRoute = readStaffLedgerAdjustmentRoutePath(url.pathname);
  if (ledgerAdjustmentRoute) return handleStaffLedgerAdjustmentRequest(request, ledgerAdjustmentRoute.gameSessionId, ledgerAdjustmentRoute.playerId, { resolveStaffForRequest });

  if (url.pathname.endsWith("/staff/bootstrap")) return handleStaffBootstrapRequest(request, { createAuthClient, createServiceClient });
  if (url.pathname.endsWith("/staff/signup")) return handleStaffSignupRequest(request, { createServiceClient });
  if (url.pathname.endsWith("/licensing/activate")) return handleLicensingActivationRequest(request, { createAuthClient, createServiceClient });
  return jsonError(404, { code: "route_not_found", message: "Classroom API route was not found.", retryable: false });
});

function reviewed(
  request: Request,
  endpointKey: Parameters<typeof dispatchRateLimitedReviewedPlayerRequest>[1],
  next: () => Promise<Response> | Response,
) {
  return dispatchRateLimitedReviewedPlayerRequest(request, endpointKey, next, { createServiceClient });
}
function createAuthClient(env: SupabaseEnv): EdgeSupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseAnonKey) as unknown as EdgeSupabaseClient;
}
function createServiceClient(env: SupabaseEnv): EdgeSupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as EdgeSupabaseClient;
}
function resolveStaffForRequest(
  request: Request,
  env: SupabaseEnv,
  options: { readonly missingMessage: string },
) {
  return resolveStaffSessionForRequest(request, env, { createAuthClient, createServiceClient }, options);
}
