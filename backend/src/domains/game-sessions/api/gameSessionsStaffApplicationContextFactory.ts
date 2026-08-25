import type { GameSessionsStaffApplicationContext } from "../contracts/gameSessionsStaffApplicationContext.ts";
import {
  createStaffRequestApplicationContext,
  StaffRequestApplicationContextValidationError,
} from "../../../shared/staffRequestApplicationContextFactory.ts";

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
  try {
    return createStaffRequestApplicationContext({
      ...input,
      permissions: [],
    });
  } catch (error) {
    if (error instanceof StaffRequestApplicationContextValidationError) {
      throw gameSessionsValidationError(error);
    }
    throw error;
  }
}

function gameSessionsValidationError(
  error: StaffRequestApplicationContextValidationError,
): Error {
  const message = (() => {
    switch (error.issue) {
      case "owned_game_id":
        return "Game Sessions Staff application context requires a owned game ID.";
      case "staff_user_id":
        return "Game Sessions Staff application context requires a Staff user ID.";
      case "request_id":
        return "Game Sessions Staff application context requires a request ID.";
      case "staff_role":
        return "Game Sessions Staff application context requires a reviewed Game Admin role.";
      case "assurance_level":
        return "Game Sessions Staff application context requires a reviewed assurance level.";
    }
  })();
  return new Error(message);
}
