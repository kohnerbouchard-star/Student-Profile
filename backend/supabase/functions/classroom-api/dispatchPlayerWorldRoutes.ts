import {
  handlePlayerBankingFxRequest,
} from "../../../src/domains/banking-fx/api/playerBankingFxHttpHandler.ts";
import {
  playerBankingFxRateLimitKey,
  readPlayerBankingFxRoutePath,
} from "../../../src/domains/banking-fx/api/playerBankingFxRoutePaths.ts";
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
import { handlePlayerProgressionRequest } from "../../../src/domains/progression/api/playerProgressionHttpHandler.ts";
import { readPlayerProgressionRoutePath } from "../../../src/domains/progression/api/playerProgressionRoutePaths.ts";
import { dispatchClassroomMessagingRequest } from "./messagingDispatch.ts";
import {
  createServiceClient,
} from "./classroomClients.ts";


export async function dispatchPlayerWorldRoutes(request: Request, url: URL): Promise<Response | null> {

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

  const playerBankingFxRoute = readPlayerBankingFxRoutePath(url.pathname);

  if (playerBankingFxRoute) {
    return dispatchRateLimitedReviewedPlayerRequest(
      request,
      playerBankingFxRateLimitKey(playerBankingFxRoute, request.method),
      (applicationContext) =>
        handlePlayerBankingFxRequest(
          request,
          playerBankingFxRoute,
          { createServiceClient },
          applicationContext,
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
      () =>
        handlePlayerWorldRuntimeEdgeRequest(request, { createServiceClient }),
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
      (applicationContext) =>
        handlePlayerInventoryRedemptionRequest(
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
      (applicationContext) =>
        handlePlayerInventoryReadRequest(
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
      ? request.method === "GET" ? "marketplace" : "marketplaceListing"
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
      () =>
        handlePlayerProgressionRequest(request, playerProgressionRoute, {
          createServiceClient,
        }),
      { createServiceClient },
    );
  }

  const playerStoryDeliveryRoute = readPlayerStoryDeliveryRoutePath(
    url.pathname,
  );

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
  return null;
}
