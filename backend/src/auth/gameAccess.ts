import {
  requireStaffGameAccess,
  type StaffAccessRepository,
} from "./staffAccess";
import {
  allowAccess,
  denyAccess,
  type AccessResult,
  type PlayerIdentity,
  type StaffIdentity,
  type UUID,
} from "./types";

export interface GameAccessContext {
  readonly actorKind: "staff" | "player";
  readonly gameSessionId: UUID;
  readonly staffUserId?: UUID;
  readonly playerId?: UUID;
}

export async function validateStaffAccessToGameSession(
  identity: StaffIdentity,
  gameSessionId: UUID,
  repository: Pick<StaffAccessRepository, "findGameSessionById">,
): Promise<AccessResult<GameAccessContext>> {
  const access = await requireStaffGameAccess(identity, gameSessionId, repository);

  if (!access.ok) {
    return access;
  }

  return allowAccess({
    actorKind: "staff",
    gameSessionId: access.value.gameSessionId,
    staffUserId: identity.staffUserId,
  });
}

export function validatePlayerAccessToGameSession(
  identity: PlayerIdentity,
  gameSessionId: UUID,
): AccessResult<GameAccessContext> {
  const sameGame = rejectCrossGameAccess(identity.gameSessionId, gameSessionId);

  if (!sameGame.ok) {
    return sameGame;
  }

  return allowAccess({
    actorKind: "player",
    gameSessionId: identity.gameSessionId,
    playerId: identity.playerId,
  });
}

export function validatePlayerAccessToOwnPlayer(
  identity: PlayerIdentity,
  playerId: UUID,
): AccessResult<GameAccessContext> {
  if (identity.playerId !== playerId) {
    return denyAccess(
      "player_access_denied",
      "Player identity cannot access another player.",
      403,
      { authorizedPlayerId: identity.playerId, requestedPlayerId: playerId },
    );
  }

  return allowAccess({
    actorKind: "player",
    gameSessionId: identity.gameSessionId,
    playerId: identity.playerId,
  });
}

export function validatePlayerAccessToOwnGameAndPlayer(
  identity: PlayerIdentity,
  gameSessionId: UUID,
  playerId: UUID,
): AccessResult<GameAccessContext> {
  const gameAccess = validatePlayerAccessToGameSession(identity, gameSessionId);

  if (!gameAccess.ok) {
    return gameAccess;
  }

  return validatePlayerAccessToOwnPlayer(identity, playerId);
}

export function rejectCrossGameAccess(
  authorizedGameSessionId: UUID,
  requestedGameSessionId: UUID,
): AccessResult<UUID> {
  if (authorizedGameSessionId !== requestedGameSessionId) {
    return denyAccess(
      "cross_game_access_denied",
      "Request is not allowed to cross game-session boundaries.",
      403,
      { authorizedGameSessionId, requestedGameSessionId },
    );
  }

  return allowAccess(authorizedGameSessionId);
}
