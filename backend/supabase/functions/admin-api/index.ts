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
import { handleAccountOperation } from "./accountOperations.ts";
import { handlePersonalBankingAdminOperation } from "./bankingOperations.ts";
import { handleGameProvisioningOperation } from "./gameProvisioningOperations.ts";
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
  type AdminSecurityGuardResult,
  guardAdminRequest,
} from "./adminSecurityGuard.ts";
import { createAdminRequestApplicationContext } from "./adminRequestApplicationContext.ts";

type AuthorizedAdminContext = Parameters<typeof guardAdminRequest>[1];
type AdminSecurityFailure = Extract<
  AdminSecurityGuardResult,
  { readonly ok: false }
>;

function routePath(url: URL): string {
  const marker = "/admin-api";
  const markerIndex = url.pathname.indexOf(marker);
  return markerIndex >= 0
    ? url.pathname.slice(markerIndex + marker.length) || "/"
    : url.pathname;
}

function adminSecurityFailureResponse(
  request: Request,
  failure: AdminSecurityFailure,
): Response {
  const headers = {
    ...corsHeaders(request),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store, max-age=0",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin, Authorization, X-Econovaria-Device-Id",
  } as Record<string, string>;

  if (failure.retryAfterSeconds) {
    headers["Retry-After"] = String(Math.max(1, failure.retryAfterSeconds));
  }
  if (failure.resetAt) headers["X-RateLimit-Reset"] = failure.resetAt;

  return new Response(
    JSON.stringify({
      code: failure.code,
      message: failure.message,
    }),
    {
      status: failure.status,
      headers,
    },
  );
}

async function handleGlobalRoute(
  request: Request,
  context: any,
  path: string,
): Promise<Response | null> {
  const body = ["GET", "HEAD"].includes(request.method)
    ? {}
    : await request.clone().json().catch(() => ({}));

  const provisioningOperation = await handleGameProvisioningOperation(
    context.service,
    {
      request,
      path,
      staffUserId: context.staff.id,
    },
  );
  if (provisioningOperation.handled) {
    return json(
      request,
      provisioningOperation.status || 500,
      provisioningOperation.body,
    );
  }

  const accountOperation = await handleAccountOperation(context.service, {
    path,
    method: request.method,
    staff: context.staff,
    games: context.games,
    body,
  });
  if (accountOperation.handled) {
    return json(request, accountOperation.status, accountOperation.body);
  }

  if (path === "/session/bootstrap" && request.method === "GET") {
    const selected = selectGame(context, request);
    const claims = context.user || {};
    return json(request, 200, {
      data: {
        admin: {
          id: context.staff.id,
          accountId: context.staff.id,
          displayName: context.staff.display_name,
          email: context.staff.email,
          role: "game_admin",
          roles: ["game_admin"],
        },
        activeGame: selected ? gameDto(selected) : {},
        games: context.games.map(gameDto),
        permissions: context.security.permissions,
        permissionVersion: Number(
          context.user?.app_metadata?.permission_version || 0,
        ),
        securityVersion: Number(
          context.user?.app_metadata?.security_version || 0,
        ),
        roles: ["game_admin"],
        csrfToken: "",
        session: {
          id: claims.id || context.staff.id,
          csrfToken: "",
          assuranceLevel: context.security.assuranceLevel,
          expiresAt: claims.exp
            ? new Date(Number(claims.exp) * 1000).toISOString()
            : null,
        },
        capabilities: {
          notifications: false,
          securityHistory: "current_session_only",
          helpArticles: true,
          auditLogFlags: true,
          auditLogExport: true,
          overallScore: false,
          marketplaceAdminTrading: false,
          progressionReview: true,
          progressionCorrection: true,
          multiFactorAuthentication: context.security.assuranceLevel === "aal2",
        },
      },
    });
  }

  if (path === "/games" && request.method === "GET") {
    return json(request, 200, {
      data: { games: context.games.map(gameDto) },
    });
  }

  if (path === "/account/profile" && request.method === "GET") {
    return json(request, 200, {
      data: {
        profile: {
          id: context.staff.id,
          accountId: context.staff.id,
          displayName: context.staff.display_name,
          name: context.staff.display_name,
          email: context.staff.email,
          role: "game_admin",
        },
      },
    });
  }

  if (path === "/notifications" && request.method === "GET") {
    return json(request, 200, {
      data: {
        notifications: [],
        notificationCount: 0,
        notificationPreferences: {},
        implementationStatus: "not_configured",
      },
    });
  }

  if (
    (path === "/account/security" || path === "/account/sessions") &&
    request.method === "GET"
  ) {
    const claims = context.user || {};
    return json(request, 200, {
      data: {
        security: {
          twoFactorEnabled: context.security.assuranceLevel === "aal2",
          assuranceLevel: context.security.assuranceLevel,
          mfaRequired: true,
          sessions: [{
            id: claims.id || context.staff.id,
            current: true,
            userId: claims.id || null,
            email: context.staff.email,
            expiresAt: claims.exp
              ? new Date(Number(claims.exp) * 1000).toISOString()
              : null,
          }],
          events: [],
          implementationStatus: context.security.assuranceLevel === "aal2"
            ? "aal2_verified"
            : "mfa_enrollment_required",
        },
      },
    });
  }

  if (path === "/auth/sign-out" && request.method === "POST") {
    return json(request, 200, { data: { signedOut: true } });
  }

  const switchMatch = path.match(/^\/games\/([^/]+)\/switch$/);
  if (switchMatch && request.method === "POST") {
    const game = ensureOwnedGame(context, decodeURIComponent(switchMatch[1]));
    return game
      ? json(request, 200, { data: { activeGame: gameDto(game) } })
      : json(request, 404, {
        code: "game_not_found",
        message: "That game is not available to this administrator.",
      });
  }

  return null;
}

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
  const authorizedContext = context as AuthorizedAdminContext;

  const url = new URL(request.url);
  const path = routePath(url);

  try {
    const security = await guardAdminRequest(
      request,
      authorizedContext,
      path,
    );
    if (security.ok === false) {
      return adminSecurityFailureResponse(request, security);
    }
    const securedContext = { ...authorizedContext, security };

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
    const applicationContext = createAdminRequestApplicationContext({
      ownedGame: game,
      staffUserId: securedContext.staff.id,
      security,
      requestId: crypto.randomUUID(),
    });

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
