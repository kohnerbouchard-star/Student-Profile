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
import { handleGameProvisioningOperation } from "./gameProvisioningOperations.ts";
import {
  type AdminSecurityGuardResult,
  guardAdminRequest,
} from "./adminSecurityGuard.ts";


export type AuthorizedAdminContext = Parameters<typeof guardAdminRequest>[1];

export type AdminSecurityFailure = Extract<
  AdminSecurityGuardResult,
  { readonly ok: false }
>;


export function routePath(url: URL): string {
  const marker = "/admin-api";
  const markerIndex = url.pathname.indexOf(marker);
  return markerIndex >= 0
    ? url.pathname.slice(markerIndex + marker.length) || "/"
    : url.pathname;
}


export function adminSecurityFailureResponse(
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


export async function handleGlobalRoute(
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
