import type { GameSessionsStaffApplicationContext } from "../contracts/gameSessionsStaffApplicationContext.ts";

export interface CreateGameSessionsStaffApplicationContextInput {
  readonly ownedGame: { readonly id: unknown };
  readonly staff: {
    readonly id: string;
    readonly role: "game_admin" | "security_operator";
  };
  readonly assuranceLevel: "aal1" | "aal2" | "unknown";
  readonly requestId: string;
}

/**
 * Projects the shared Staff application context only after the caller has
 * completed Staff authentication, assurance/rate policy, and owned-game lookup.
 * The Staff/Classroom resolver has no reviewed granular grant list, so this
 * context truthfully carries an empty permission set.
 */
export function createGameSessionsStaffApplicationContext(
  input: CreateGameSessionsStaffApplicationContextInput,
): GameSessionsStaffApplicationContext {
  const gameSessionId = requiredText(input.ownedGame.id, "owned game ID");
  const staffUserId = requiredText(input.staff.id, "Staff user ID");
  const requestId = requiredText(input.requestId, "request ID");

  if (input.staff.role !== "game_admin") {
    throw new Error(
      "Game Sessions Staff application context requires a reviewed Game Admin role.",
    );
  }
  if (!new Set(["aal1", "aal2", "unknown"]).has(input.assuranceLevel)) {
    throw new Error(
      "Game Sessions Staff application context requires a reviewed assurance level.",
    );
  }

  return Object.freeze({
    gameSessionId,
    actor: Object.freeze({
      kind: "staff" as const,
      staffUserId,
    }),
    role: input.staff.role,
    permissions: Object.freeze([] as string[]),
    requestId,
    assuranceLevel: input.assuranceLevel,
  });
}

function requiredText(value: unknown, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw new Error(
      `Game Sessions Staff application context requires a ${label}.`,
    );
  }
  return normalized;
}
