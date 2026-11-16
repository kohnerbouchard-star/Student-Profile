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
import { dispatchPlayerBusinessRequest } from "../_shared/playerBusinessDispatch.ts";
import {
  handlePlayerAttendanceClockInRequest,
} from "../../../src/domains/attendance/api/playerAttendanceClockInHttpHandler.ts";
import {
  handlePlayerSessionBootstrapRequest,
} from "../../../src/domains/players/api/playerSessionBootstrapHttpHandler.ts";
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
  handlePlayerStorePublicRequest,
} from "../../../src/domains/store/api/playerStorePublicHttpHandler.ts";
import {
  playerStoreRouteRateLimitKey,
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
  dispatchRateLimitedPlayerLoginRequest,
  dispatchRateLimitedReviewedPlayerRequest,
} from "../../../src/security/playerRateLimitDispatch.ts";
import {
  createServiceClient,
} from "./classroomClients.ts";


export async function dispatchPlayerEconomyRoutes(request: Request, url: URL): Promise<Response | null> {

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
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      playerStoreRouteRateLimitKey(playerStoreRoute),
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

  const playerContractAcceptanceRoute = readPlayerContractAcceptanceRoutePath(
    url.pathname,
  );

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

  const playerContractPublicListRoute = readPlayerContractPublicListRoutePath(
    url.pathname,
  );

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

  const playerBusinessResponse = await dispatchPlayerBusinessRequest(
    request,
    { createServiceClient },
  );
  if (playerBusinessResponse) return playerBusinessResponse;

  const playerBusinessBankingRoute = readPlayerBusinessBankingRoutePath(
    url.pathname,
  );

  if (playerBusinessBankingRoute) {
    const endpointKey = playerBusinessBankingRoute.kind === "businessRead" &&
        playerBusinessBankingRoute.resource === "workforceCandidates"
      ? "businessWorkforce"
      : ({
        businessRead: "business",
        businessCreate: "businessCreate",
        businessProductCreate: "businessProductCreate",
        businessInputPurchase: "businessInputPurchase",
        businessStoreQuote: "storeQuote",
        businessStorePurchase: "storePurchase",
        businessProduction: "businessProduction",
        businessPrice: "businessPrice",
        businessCandidateHire: "businessCandidateHire",
        businessHire: "businessRetiredHire",
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
  return null;
}
