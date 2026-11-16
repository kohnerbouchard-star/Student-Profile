import type {
  StaffRequestApplicationActor,
  StaffRequestApplicationContext,
} from "../../../src/shared/staffRequestApplicationContext.ts";
import { createStaffRequestApplicationContext } from "../../../src/shared/staffRequestApplicationContextFactory.ts";
import type { AdminPermission } from "./adminPermissions.ts";

interface ReviewedAdminSecurity {
  readonly ok: true;
  readonly assuranceLevel: "aal1" | "aal2";
  readonly permissions: readonly AdminPermission[];
  readonly requiredPermission: AdminPermission;
}

export type AdminRequestApplicationActor = StaffRequestApplicationActor;

export interface AdminRequestApplicationContext
  extends StaffRequestApplicationContext<AdminPermission> {
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
  const permissions = Object.freeze([...input.security.permissions]);

  if (!permissions.includes(input.security.requiredPermission)) {
    throw new Error(
      "Admin request application context requires its reviewed permission.",
    );
  }

  const staffContext = createStaffRequestApplicationContext<AdminPermission>({
    ownedGame: { id: gameSessionId },
    staff: {
      id: input.staffUserId,
      role: "game_admin",
    },
    assuranceLevel: input.security.assuranceLevel,
    requestId: input.requestId,
    permissions,
  });

  return Object.freeze({
    ...staffContext,
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
