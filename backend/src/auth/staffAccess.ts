import {
  allowAccess,
  denyAccess,
  type AccessResult,
  type GameSessionRecord,
  type StaffIdentity,
  type StaffUserRecord,
  type SupabaseAuthUser,
  type UUID,
} from "./types";

export interface StaffAccessRepository {
  findStaffUserBySupabaseAuthUserId(
    supabaseAuthUserId: UUID,
  ): Promise<StaffUserRecord | null>;

  findGameSessionById(gameSessionId: UUID): Promise<GameSessionRecord | null>;
}

export interface StaffGameAccess {
  readonly identity: StaffIdentity;
  readonly gameSessionId: UUID;
  readonly ownerStaffUserId: UUID;
}

export async function resolveStaffIdentity(
  authUser: SupabaseAuthUser,
  repository: Pick<StaffAccessRepository, "findStaffUserBySupabaseAuthUserId">,
): Promise<AccessResult<StaffIdentity>> {
  if (!authUser.id) {
    return denyAccess(
      "invalid_auth_user",
      "Supabase Auth user id is required for staff access.",
      401,
    );
  }

  const staffUser = await repository.findStaffUserBySupabaseAuthUserId(authUser.id);

  if (!staffUser) {
    return denyAccess(
      "staff_not_found",
      "No staff user is linked to the Supabase Auth user.",
      403,
    );
  }

  if (staffUser.supabase_auth_user_id !== authUser.id) {
    return denyAccess(
      "invalid_auth_user",
      "Resolved staff user does not match the Supabase Auth user.",
      403,
    );
  }

  return allowAccess({
    kind: "staff",
    actorType: "staff_user",
    staffUserId: staffUser.id,
    supabaseAuthUserId: staffUser.supabase_auth_user_id,
    email: staffUser.email,
    displayName: staffUser.display_name,
  });
}

export async function requireStaffGameAccess(
  identity: StaffIdentity,
  gameSessionId: UUID,
  repository: Pick<StaffAccessRepository, "findGameSessionById">,
): Promise<AccessResult<StaffGameAccess>> {
  const gameSession = await repository.findGameSessionById(gameSessionId);

  if (!gameSession) {
    return denyAccess(
      "staff_game_not_found",
      "Game session was not found.",
      404,
      { gameSessionId },
    );
  }

  if (!isStaffGameOwner(identity, gameSession)) {
    return denyAccess(
      "staff_game_access_denied",
      "Staff user does not own this game session.",
      403,
      { gameSessionId },
    );
  }

  return allowAccess({
    identity,
    gameSessionId: gameSession.id,
    ownerStaffUserId: gameSession.owner_staff_user_id,
  });
}

export function isStaffGameOwner(
  identity: StaffIdentity,
  gameSession: Pick<GameSessionRecord, "owner_staff_user_id">,
): boolean {
  return gameSession.owner_staff_user_id === identity.staffUserId;
}
