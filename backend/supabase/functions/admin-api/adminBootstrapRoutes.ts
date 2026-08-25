import type { AdminPermission } from "./adminPermissions.ts";
import type {
  AdminBootstrapGameRow,
  AdminBootstrapStaffRow,
} from "./adminBootstrapComposition.ts";
import { ensureOwnedGame, gameDto, json, selectGame } from "./common.ts";

interface AdminBootstrapRouteContext {
  readonly user?: {
    readonly id?: string;
    readonly exp?: unknown;
    readonly app_metadata?: Record<string, unknown>;
  };
  readonly staff: AdminBootstrapStaffRow;
  readonly games: readonly AdminBootstrapGameRow[];
  readonly security: {
    readonly assuranceLevel: "aal1" | "aal2";
    readonly permissions: readonly AdminPermission[];
  };
}

export function handleAdminBootstrapGlobalRoute(
  request: Request,
  context: AdminBootstrapRouteContext,
  path: string,
): Response | null {
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
