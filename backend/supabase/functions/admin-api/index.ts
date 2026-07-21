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
import { handleGameRead, handleGameWrite } from "./gameRoutes.ts";
import { handleRuntimeMutation } from "./runtimeMutations.ts";
import { handleUnsupportedOperation } from "./unsupportedOperations.ts";
import { handleInventoryRedemptionOperation } from "./inventoryRedemptionOperations.ts";
import { handleMarketplaceAdminOperation } from "./marketplaceOperations.ts";
import {
  guardGameScopedMutation,
  handleGameLifecycleOperation,
} from "./gameLifecycleOperations.ts";

function routePath(url: URL): string {
  const marker = "/admin-api";
  const markerIndex = url.pathname.indexOf(marker);
  return markerIndex >= 0
    ? url.pathname.slice(markerIndex + marker.length) || "/"
    : url.pathname;
}

async function handleGlobalRoute(
  request: Request,
  context: any,
  path: string,
): Promise<Response | null> {
  const body = ["GET", "HEAD"].includes(request.method)
    ? {}
    : await request.clone().json().catch(() => ({}));
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
        permissions: ["*"],
        roles: ["game_admin"],
        csrfToken: "",
        session: {
          id: claims.id || context.staff.id,
          csrfToken: "",
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
          marketplaceAdminTrading: true,
        },
      },
    });
  }

  if (path === "/games" && request.method === "GET") {
    return json(request, 200, { data: { games: context.games.map(gameDto) } });
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
          twoFactorEnabled: false,
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
          implementationStatus: "current_session_only",
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
  if (!context.ok) {
    return json(request, context.status, {
      code: "auth_failed",
      message: context.message,
    });
  }

  const url = new URL(request.url);
  const path = routePath(url);

  try {
    const globalResponse = await handleGlobalRoute(request, context, path);
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
    const game = ensureOwnedGame(context, gameId);
    if (!game) {
      return json(request, 404, {
        code: "game_not_found",
        message: "That game is not available to this administrator.",
      });
    }

    const lifecycleOperation = await handleGameLifecycleOperation(
      context.service,
      {
        request,
        gameId,
        staffUserId: context.staff.id,
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

    const marketplaceOperation = await handleMarketplaceAdminOperation(
      context.service,
      {
        request,
        gameId,
        staffUserId: context.staff.id,
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

    const redemptionOperation = await handleInventoryRedemptionOperation(
      context.service,
      {
        request,
        gameId,
        staffUserId: context.staff.id,
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

    const readResponse = await handleGameRead(
      request,
      context,
      url,
      game,
      gameId,
      suffix,
    );
    if (readResponse) return readResponse;

    const runtimeMutationResponse = await handleRuntimeMutation(
      request,
      context,
      gameId,
      suffix,
    );
    if (runtimeMutationResponse) return runtimeMutationResponse;

    const writeResponse = await handleGameWrite(
      request,
      context,
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
