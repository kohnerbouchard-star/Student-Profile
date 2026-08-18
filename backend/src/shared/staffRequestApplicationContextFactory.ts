import type {
  StaffRequestApplicationContext,
  StaffRequestAssuranceLevel,
} from "./staffRequestApplicationContext.ts";

export type StaffRequestApplicationContextValidationIssue =
  | "owned_game_id"
  | "staff_user_id"
  | "request_id"
  | "staff_role"
  | "assurance_level";

export class StaffRequestApplicationContextValidationError extends Error {
  constructor(
    readonly issue: StaffRequestApplicationContextValidationIssue,
    message: string,
  ) {
    super(message);
    this.name = "StaffRequestApplicationContextValidationError";
  }
}

export interface CreateStaffRequestApplicationContextInput<
  TPermission extends string = string,
> {
  readonly ownedGame: { readonly id: unknown };
  readonly staff: {
    readonly id: string;
    readonly role: "game_admin" | "security_operator";
  };
  readonly assuranceLevel: StaffRequestAssuranceLevel;
  readonly requestId: string;
  readonly permissions?: readonly TPermission[];
}

/**
 * Constructs the canonical Staff request context after the caller has
 * completed Staff authentication, assurance/rate policy, and owned-game
 * resolution. Correlation identity remains separate from mutation identity.
 */
export function createStaffRequestApplicationContext<
  TPermission extends string = string,
>(
  input: CreateStaffRequestApplicationContextInput<TPermission>,
): StaffRequestApplicationContext<TPermission> {
  const gameSessionId = requiredText(
    input.ownedGame.id,
    "owned_game_id",
    "owned game ID",
  );
  const staffUserId = requiredText(
    input.staff.id,
    "staff_user_id",
    "Staff user ID",
  );
  const requestId = requiredText(
    input.requestId,
    "request_id",
    "request ID",
  );

  if (input.staff.role !== "game_admin") {
    throw new StaffRequestApplicationContextValidationError(
      "staff_role",
      "Staff request application context requires a reviewed Game Admin role.",
    );
  }
  if (!new Set(["aal1", "aal2", "unknown"]).has(input.assuranceLevel)) {
    throw new StaffRequestApplicationContextValidationError(
      "assurance_level",
      "Staff request application context requires a reviewed assurance level.",
    );
  }

  const permissions = Object.freeze([...(input.permissions ?? [])]);

  return Object.freeze({
    gameSessionId,
    actor: Object.freeze({
      kind: "staff" as const,
      staffUserId,
    }),
    role: input.staff.role,
    permissions,
    requestId,
    assuranceLevel: input.assuranceLevel,
  });
}

function requiredText(
  value: unknown,
  issue: StaffRequestApplicationContextValidationIssue,
  label: string,
): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw new StaffRequestApplicationContextValidationError(
      issue,
      `Staff request application context requires a ${label}.`,
    );
  }
  return normalized;
}
