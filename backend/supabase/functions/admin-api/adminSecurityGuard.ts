import { consumeAdminProgressionRateLimit } from "./progressionRateLimit.ts";

export const ADMIN_PERMISSIONS = Object.freeze([
  "account.read",
  "audit.read",
  "attendance.manage",
  "business.manage",
  "contracts.manage",
  "economy.adjust",
  "game.create",
  "game.read",
  "game.switch",
  "game.update",
  "inventory.redeem",
  "market.manage",
  "marketplace.moderate",
  "messaging.moderate",
  "players.manage",
  "progression.review",
  "settings.manage",
  "store.manage",
  "world.manage",
]);

interface AdminSecurityContext {
  readonly token: string;
  readonly user: {
    readonly id?: string;
    readonly app_metadata?: Record<string, unknown>;
  };
  readonly staff: { readonly id: string };
  readonly games: readonly { readonly id: string }[];
  readonly service: {
    from(table: string): any;
    rpc<T>(name: string, args: unknown): PromiseLike<{
      readonly data: T | null;
      readonly error: { readonly message: string } | null;
    }>;
  };
}

interface StaffSecurityRow {
  readonly status: string;
  readonly role: string;
  readonly permission_version: number | string;
  readonly security_version: number | string;
  readonly mfa_required: boolean;
}

export type AdminSecurityGuardResult =
  | {
    readonly ok: true;
    readonly assuranceLevel: "aal1" | "aal2";
    readonly permissions: readonly string[];
  }
  | {
    readonly ok: false;
    readonly status: number;
    readonly code: string;
    readonly message: string;
    readonly retryAfterSeconds?: number;
    readonly resetAt?: string;
  };

interface AdminSecurityGuardDependencies {
  readonly consumeRateLimit?: typeof consumeAdminProgressionRateLimit;
}

export async function guardAdminRequest(
  request: Request,
  context: AdminSecurityContext,
  path: string,
  dependencies: AdminSecurityGuardDependencies = {},
): Promise<AdminSecurityGuardResult> {
  const staffResponse = await context.service
    .from("staff_users")
    .select("status,role,permission_version,security_version,mfa_required")
    .eq("id", context.staff.id)
    .maybeSingle();
  const staff = staffResponse.data as StaffSecurityRow | null;

  if (staffResponse.error) {
    return failure(
      503,
      "staff_security_state_unavailable",
      "Staff security state is unavailable.",
    );
  }
  if (!staff || staff.status !== "active" || staff.role !== "game_admin") {
    return failure(
      403,
      "staff_account_inactive",
      "This staff account is not authorized.",
    );
  }

  const permissionVersion = Number(staff.permission_version);
  const securityVersion = Number(staff.security_version);
  const metadata = context.user?.app_metadata ?? {};
  if (
    !Number.isSafeInteger(permissionVersion) ||
    permissionVersion < 1 ||
    !Number.isSafeInteger(securityVersion) ||
    securityVersion < 1 ||
    metadata.econovaria_role !== "game_admin" ||
    Number(metadata.permission_version) !== permissionVersion ||
    Number(metadata.security_version) !== securityVersion
  ) {
    return failure(
      403,
      "staff_claims_outdated",
      "Staff authorization claims are stale or incomplete.",
    );
  }

  const assuranceLevel = readJwtAssuranceLevel(context.token);
  const isMutation = !["GET", "HEAD"].includes(request.method.toUpperCase());
  if (
    isMutation &&
    staff.mfa_required !== false &&
    assuranceLevel !== "aal2"
  ) {
    return failure(
      403,
      "staff_mfa_required",
      "Multi-factor authentication is required for administrator changes.",
    );
  }

  const selectedGameId = readOwnedGameScope(path, context.games) ||
    context.games[0]?.id || context.staff.id;
  try {
    const consumeRateLimit = dependencies.consumeRateLimit ??
      consumeAdminProgressionRateLimit;
    const decision = await consumeRateLimit(context.service, {
      request,
      gameId: selectedGameId,
      staffUserId: context.staff.id,
      action: normalizedAdminAction(request.method, path),
      profile: isMutation ? "sensitive" : "read",
    });
    if (!decision.allowed) {
      return {
        ok: false,
        status: 429,
        code: "admin_rate_limit_exceeded",
        message: "Too many administrator requests. Try again later.",
        retryAfterSeconds: Math.max(1, decision.retryAfterSeconds),
        resetAt: decision.resetAt,
      };
    }
  } catch {
    return failure(
      503,
      "admin_rate_limit_unavailable",
      "Administrator request protection is unavailable.",
    );
  }

  return {
    ok: true,
    assuranceLevel,
    permissions: ADMIN_PERMISSIONS,
  };
}

export function normalizedAdminAction(method: string, path: string): string {
  const normalizedPath = String(path || "/")
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/giu, ":uuid")
    .replace(/\/[0-9]+(?=\/|$)/gu, "/:id")
    .replace(/\/{2,}/gu, "/")
    .slice(0, 240);
  return `admin.${method.toUpperCase()}.${normalizedPath}`;
}

function readOwnedGameScope(
  path: string,
  games: readonly { readonly id: string }[],
): string {
  const match = String(path).match(/^\/games\/([^/]+)/u);
  if (!match) return "";
  let candidate = "";
  try {
    candidate = decodeURIComponent(match[1]);
  } catch {
    return "";
  }
  return games.some((game) => String(game.id) === candidate) ? candidate : "";
}

function readJwtAssuranceLevel(token: string): "aal1" | "aal2" {
  try {
    const payload = token.split(".")[1];
    if (!payload) return "aal1";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const claims = JSON.parse(atob(padded));
    return claims?.aal === "aal2" ? "aal2" : "aal1";
  } catch {
    return "aal1";
  }
}

function failure(
  status: number,
  code: string,
  message: string,
): AdminSecurityGuardResult {
  return { ok: false, status, code, message };
}
