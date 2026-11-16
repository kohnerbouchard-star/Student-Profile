import {
  corsHeaders,
  ensureOwnedGame,
  gameDto,
  json,
  resolveContext,
  selectGame,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
} from "./common.ts";
import { handlePersonalBankingAdminOperation } from "./bankingOperations.ts";
import { handleGameRead, handleGameWrite } from "./gameRoutes.ts";
import { handleMarketAssetReadOperation } from "./marketAssetOperations.ts";
import { handleLocalAdminGameMutation } from "./localGameMutations.ts";
import { handleUnsupportedOperation } from "./unsupportedOperations.ts";
import { handleProgressionOperation } from "./progressionOperations.ts";
import { handleInventoryRedemptionOperation } from "./inventoryRedemptionOperations.ts";
import { handleMarketplaceAdminOperation } from "./marketplaceOperations.ts";
import { handleMessagingOperation } from "./messagingOperations.ts";
import { guardStaffMessagingRateLimit } from "../../../src/security/staffMessagingRateLimitDispatch.ts";
import { handleBusinessBankingAdminOperation } from "./businessBankingOperations.ts";
import { preDispatchRetiredBusinessSettlement } from "./businessSettlementRetirementDispatch.ts";
import { handleWorldRuntimeAdminOperation } from "./worldRuntimeOperations.ts";
import {
  guardGameScopedMutation,
  handleGameLifecycleOperation,
} from "./gameLifecycleOperations.ts";
import {
  type AdminBootstrapAuthorizedContext,
  AdminBootstrapCompositionError,
  applicationContextForAdminGame,
  authorizeAndHydrateAdminBootstrapContext,
} from "./adminBootstrapComposition.ts";
import {
  adminSecurityFailureResponse,
  handleGlobalRoute,
  routePath,
} from "./adminGlobalRoutes.ts";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(request, 500, {
      code: "missing_runtime_config",
      message: "Admin API runtime configuration is incomplete.",
    });
  }

  const context = await resolveContext(request);
  if (context.ok !== true) {
    return json(request, context.status, {
      code: "auth_failed",
      message: context.message,
    });
  }
  const authorizedContext = context as AdminBootstrapAuthorizedContext;

  const url = new URL(request.url);
  const path = routePath(url);

  try {
    let securedContext;
    try {
      const authorization = await authorizeAndHydrateAdminBootstrapContext(
        request,
        authorizedContext,
        path,
      );
      if (authorization.ok === false) {
        return adminSecurityFailureResponse(request, authorization);
      }
      securedContext = authorization.context;
    } catch (error) {
      if (error instanceof AdminBootstrapCompositionError) {
        return json(request, error.status, {
          code: "auth_failed",
          message: error.responseMessage,
        });
      }
      throw error;
    }

    const retiredBusinessSettlement = preDispatchRetiredBusinessSettlement({
      request,
      path,
      resolveOwnedGame: (gameId) => ensureOwnedGame(securedContext, gameId),
    });
    if (retiredBusinessSettlement.handled) {
      return json(
        request,
        retiredBusinessSettlement.status || 500,
        retiredBusinessSettlement.body,
      );
    }

    const globalResponse = await handleGlobalRoute(
      request,
      securedContext,
      path,
    );
    if (globalResponse) return globalResponse;

    const gameMatch = path.match(/^\/games\/([^/]+)(\/.*)?$/);
    if (!gameMatch) {
      const unsupported = handleUnsupportedOperation({
        path,
        method: request.method,
      });
      return unsupported.handled
        ? json(request, unsupported.status, unsupported.body)
        : json(request, 404, {
          code: "route_not_found",
          message: "Admin API route was not found.",
        });
    }

    const gameId = decodeURIComponent(gameMatch[1]);
    const suffix = gameMatch[2] || "";
    const game = ensureOwnedGame(securedContext, gameId);
    if (!game) {
      return json(request, 404, {
        code: "game_not_found",
        message: "That game is not available to this administrator.",
      });
    }
    const applicationContext = applicationContextForAdminGame(
      securedContext.gameBootstrapEntries,
      game,
    );

    const lifecycleOperation = await handleGameLifecycleOperation(
      securedContext.service,
      {
        request,
        gameId,
        staffUserId: securedContext.staff.id,
        suffix,
      },
    );
    if (lifecycleOperation.handled) {
      return json(
        request,
        lifecycleOperation.status || 500,
        lifecycleOperation.body,
      );
    }

    const mutationGuard = guardGameScopedMutation({
      method: request.method,
      operationalStatus: game.status,
      suffix,
    });
    if (mutationGuard.handled) {
      return json(request, mutationGuard.status || 409, mutationGuard.body);
    }

    const bankingOperation = await handlePersonalBankingAdminOperation(
      securedContext.service,
      {
        request,
        gameId,
        staffUserId: securedContext.staff.id,
        suffix,
      },
    );
    if (bankingOperation.handled) {
      return json(
        request,
        bankingOperation.status || 500,
        bankingOperation.body,
      );
    }

    const worldOperation = await handleWorldRuntimeAdminOperation(
      securedContext.service as unknown as Parameters<
        typeof handleWorldRuntimeAdminOperation
      >[0],
      {
        request,
        gameId,
        staffUserId: securedContext.staff.id,
        suffix,
      },
    );
    if (worldOperation.handled) {
      return json(
        request,
        worldOperation.status || 500,
        worldOperation.body,
      );
    }

    const marketAssetOperation = await handleMarketAssetReadOperation(
      securedContext.service,
      { request, gameId, suffix },
    );
    if (marketAssetOperation.handled) {
      return json(
        request,
        marketAssetOperation.status || 500,
        marketAssetOperation.body,
      );
    }

    const marketplaceOperation = await handleMarketplaceAdminOperation(
      securedContext.service as never,
      {
        request,
        gameId,
        staffUserId: securedContext.staff.id,
        suffix,
      },
    );
    if (marketplaceOperation.handled) {
      return json(
        request,
        marketplaceOperation.status || 500,
        marketplaceOperation.body,
      );
    }

    if (suffix.startsWith("/messages")) {
      const rateLimit = await guardStaffMessagingRateLimit(
        securedContext.service,
        {
          request,
          gameId,
          staffUserId: securedContext.staff.id,
          suffix,
        },
      );
      if (rateLimit) {
        return json(request, rateLimit.status, rateLimit.body);
      }

      const messagingOperation = await handleMessagingOperation(
        securedContext.service,
        {
          request,
          gameId,
          staffUserId: securedContext.staff.id,
          suffix,
        },
      );
      if (messagingOperation.handled) {
        return json(
          request,
          messagingOperation.status || 500,
          messagingOperation.body,
        );
      }
    }

    const progressionOperation = await handleProgressionOperation(
      securedContext.service,
      {
        request,
        gameId,
        staffUserId: securedContext.staff.id,
        suffix,
      },
    );
    if (progressionOperation.handled) {
      return json(
        request,
        progressionOperation.status || 500,
        progressionOperation.body,
      );
    }

    const redemptionOperation = await handleInventoryRedemptionOperation(
      securedContext.service,
      {
        request,
        applicationContext,
        suffix,
      },
    );
    if (redemptionOperation.handled) {
      return json(
        request,
        redemptionOperation.status || 500,
        redemptionOperation.body,
      );
    }

    const businessBankingOperation = await handleBusinessBankingAdminOperation(
      securedContext.service,
      {
        request,
        gameId,
        staffUserId: securedContext.staff.id,
        suffix,
      },
    );
    if (businessBankingOperation.handled) {
      return json(
        request,
        businessBankingOperation.status || 500,
        businessBankingOperation.body,
      );
    }

    const localGameMutation = await handleLocalAdminGameMutation(
      securedContext.service as unknown as Parameters<
        typeof handleLocalAdminGameMutation
      >[0],
      {
        request,
        applicationContext,
        suffix,
        gameSession: {
          id: game.id,
          name: game.name,
          status: game.status,
        },
      },
    );
    if (localGameMutation.handled) {
      return json(
        request,
        localGameMutation.status,
        localGameMutation.body,
      );
    }

    const readResponse = await handleGameRead(
      request,
      securedContext,
      url,
      game,
      gameId,
      suffix,
      applicationContext,
    );
    if (readResponse) return readResponse;

    const writeResponse = await handleGameWrite(
      request,
      securedContext,
      url,
      gameId,
      suffix,
      applicationContext,
    );
    if (writeResponse) return writeResponse;

    const unsupported = handleUnsupportedOperation({
      path,
      method: request.method,
    });
    if (unsupported.handled) {
      return json(request, unsupported.status, unsupported.body);
    }

    return json(request, 501, {
      code: "admin_route_not_implemented",
      message: "This administrator operation is not connected yet.",
      path,
    });
  } catch (error) {
    console.error("admin-api failure", {
      path,
      error: String((error as any)?.message || error),
    });
    return json(request, 500, {
      code: "admin_api_failed",
      message: "Administrator data could not be loaded.",
    });
  }
});
