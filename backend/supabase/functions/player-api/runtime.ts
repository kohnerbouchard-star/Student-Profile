import {
  jsonError,
  jsonResponse,
} from "../../../src/platform/supabase/edgeResponse.ts";
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
  handlePlayerAttendanceClockInRequest,
} from "../../../src/domains/attendance/api/playerAttendanceClockInHttpHandler.ts";
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
  dispatchRateLimitedPlayerLoginRequest,
  dispatchRateLimitedReviewedPlayerRequest,
} from "../../../src/security/playerRateLimitDispatch.ts";
import {
  handlePlayerProgressionRequest,
} from "../../../src/domains/progression/api/playerProgressionHttpHandler.ts";
import {
  readPlayerProgressionRoutePath,
} from "../../../src/domains/progression/api/playerProgressionRoutePaths.ts";
import { dispatchClassroomMessagingRequest } from "../classroom-api/messagingDispatch.ts";
import { dispatchPlayerBusinessRequest } from "../_shared/playerBusinessDispatch.ts";
import {
  createServiceClient,
  readEdgeSupabaseEnv,
  requirePublishableRequest,
} from "../_shared/econovariaAuth.ts";

interface EdgeHealthBody {
  readonly ok: true;
  readonly service: "player-api";
  readonly status: "ready";
}

Deno.serve(async (request: Request) => {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") return jsonResponse(204, null);

  if (url.pathname.endsWith("/health")) {
    return jsonResponse<EdgeHealthBody>(200, {
      ok: true,
      service: "player-api",
      status: "ready",
    });
  }

  const publishableFailure = await requirePublishableRequest(request);
  if (publishableFailure) return publishableFailure;

  const env = readEdgeSupabaseEnv();
  if (!env.ok) {
    return jsonError(500, {
      code: "player_runtime_not_configured",
      message: "The Player API runtime is not configured.",
      retryable: false,
    });
  }

  const playerCapabilityManifestRoute = readPlayerCapabilityManifestRoutePath(
    url.pathname,
  );
  if (playerCapabilityManifestRoute) {
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      "capabilities",
      () => handlePlayerCapabilityManifestRequest(
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
      () => handlePlayerWorldReadRequest(request, playerWorldRoute, {
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
      (applicationContext) => handlePlayerInventoryRedemptionRequest(
        request,
        playerInventoryRedemptionRoute,
        { createServiceClient },
        applicationContext,
      ),
      { createServiceClient },
    );
  }

  const playerInventoryRoute = readPlayerInventoryRoutePath(url.pathname);
  if (playerInventoryRoute) {
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      "inventory",
      (applicationContext) => handlePlayerInventoryReadRequest(
        request,
        playerInventoryRoute,
        { createServiceClient },
        applicationContext,
      ),
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
      () => handlePlayerMarketplaceRequest(request, playerMarketplaceRoute, {
        createServiceClient,
      }),
      { createServiceClient },
    );
  }

  const playerMessagingResponse = await dispatchClassroomMessagingRequest(
    request,
    { createServiceClient },
  );
  if (playerMessagingResponse) return playerMessagingResponse;

  const playerProgressionRoute = readPlayerProgressionRoutePath(url.pathname);
  if (playerProgressionRoute) {
    const endpointKey = playerProgressionRoute.kind === "unlock"
      ? "progressionUnlock"
      : playerProgressionRoute.kind === "claim"
      ? "progressionClaim"
      : "progression";
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      endpointKey,
      () => handlePlayerProgressionRequest(request, playerProgressionRoute, {
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
      () => handlePlayerStoryDeliveryRequest(
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
      () => handlePlayerNotificationRequest(
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
      () => handlePlayerSessionLogoutRequest(request, playerLogoutRoute, {
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
      () => handlePlayerStockAssetListRequest(
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
      () => handlePlayerStorePublicRequest(request, playerStoreRoute, {
        createServiceClient,
      }),
      { createServiceClient },
    );
  }

  if (url.pathname.endsWith("/players/me/game/dashboard")) {
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      "dashboard",
      () => handlePlayerGameDashboardRequest(request, { createServiceClient }),
      { createServiceClient },
    );
  }

  const playerContractAcceptanceRoute = readPlayerContractAcceptanceRoutePath(
    url.pathname,
  );
  if (playerContractAcceptanceRoute) {
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      "contractAccept",
      () => handlePlayerContractAcceptanceRequest(
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
      () => handlePlayerContractPublicSubmitRequest(
        request,
        playerContractPublicSubmitRoute,
        { createServiceClient },
      ),
      { createServiceClient },
    );
  }

  const playerContractPublicListRoute = readPlayerContractPublicListRoutePath(
    url.pathname,
  );
  if (playerContractPublicListRoute) {
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      "contracts",
      () => handlePlayerContractPublicListRequest(request, {
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
      () => handlePlayerStockMarketReadRequest(request, "read_portfolio", {
        createServiceClient,
      }),
      { createServiceClient },
    );
  }

  if (url.pathname.endsWith("/players/me/stocks/holdings")) {
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      "portfolio",
      () => handlePlayerStockMarketReadRequest(request, "read_holdings", {
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
        () => handlePlayerStockMarketTradingRequest(request, {
          createServiceClient,
        }),
        { createServiceClient },
      );
    }
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      "portfolio",
      () => handlePlayerStockMarketReadRequest(request, "read_orders", {
        createServiceClient,
      }),
      { createServiceClient },
    );
  }

  if (url.pathname.endsWith("/players/me/stocks/trades")) {
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      "portfolio",
      () => handlePlayerStockMarketReadRequest(request, "read_trades", {
        createServiceClient,
      }),
      { createServiceClient },
    );
  }

  const playerBusinessResponse = await dispatchPlayerBusinessRequest(
    request,
    { createServiceClient },
  );
  if (playerBusinessResponse) return playerBusinessResponse;

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
      () => handlePlayerBusinessBankingRequest(
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
      () => handlePlayerBankingPublicRequest(request, { createServiceClient }),
      { createServiceClient },
    );
  }

  if (url.pathname.endsWith("/players/me")) {
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      "bootstrap",
      () => handlePlayerSessionBootstrapRequest(request, { createServiceClient }),
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

  return jsonError(404, {
    code: "route_not_found",
    message: "Player API route was not found.",
    retryable: false,
  });
});
