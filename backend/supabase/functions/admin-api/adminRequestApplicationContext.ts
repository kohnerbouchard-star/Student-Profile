import type { RequestApplicationContext } from "../../../src/shared/requestApplicationContext.ts";
import type { AdminPermission } from "./adminPermissions.ts";

interface ReviewedAdminSecurity {
  readonly ok: true;
  readonly assuranceLevel: "aal1" | "aal2";
  readonly permissions: readonly AdminPermission[];
  readonly requiredPermission: AdminPermission;
}

export interface AdminRequestApplicationActor {
  readonly kind: "staff";
  readonly staffUserId: string;
}

export interface AdminRequestApplicationContext
  extends
    RequestApplicationContext<
      AdminRequestApplicationActor,
      "game_admin",
      AdminPermission
    > {
  readonly assuranceLevel: ReviewedAdminSecurity["assuranceLevel"];
  readonly requiredPermission: AdminPermission;
}

export interface CreateAdminRequestApplicationContextInput {
  readonly ownedGame: { readonly id: string };
  readonly staffUserId: string;
  readonly security: ReviewedAdminSecurity;
  readonly requestId: string;
}

/**
 * Projects the internal Admin application context only after the caller has
 * completed authentication, Admin security policy, and owned-game lookup.
 */
export function createAdminRequestApplicationContext(
  input: CreateAdminRequestApplicationContextInput,
): AdminRequestApplicationContext {
  const gameSessionId = requiredText(input.ownedGame.id, "owned game ID");
  const staffUserId = requiredText(input.staffUserId, "Staff user ID");
  const requestId = requiredText(input.requestId, "request ID");
  const permissions = Object.freeze([...input.security.permissions]);

  if (!permissions.includes(input.security.requiredPermission)) {
    throw new Error(
      "Admin request application context requires its reviewed permission.",
    );
  }

  return Object.freeze({
    gameSessionId,
    actor: Object.freeze({
      kind: "staff" as const,
      staffUserId,
    }),
    role: "game_admin" as const,
    permissions,
    requestId,
    assuranceLevel: input.security.assuranceLevel,
    requiredPermission: input.security.requiredPermission,
  });
}

function requiredText(value: string, label: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`Admin request application context requires a ${label}.`);
  }
  return normalized;
}
