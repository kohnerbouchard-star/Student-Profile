import { isUuid } from "../../../platform/supabase/uuid.ts";

export type PlayerRosterRoute =
  | {
      readonly kind: "players";
      readonly gameSessionId: string;
    }
  | {
      readonly kind: "resetAccessCode";
      readonly gameSessionId: string;
      readonly playerId: string;
    };

export function readPlayerRosterRoutePath(
  pathname: string,
): PlayerRosterRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const gamesIndex = segments.lastIndexOf("games");

  if (gamesIndex < 0) {
    return null;
  }

  const gameSessionId = segments[gamesIndex + 1];
  const playersSegment = segments[gamesIndex + 2];

  if (!gameSessionId || playersSegment !== "players") {
    return null;
  }

  if (!isUuid(gameSessionId)) {
    return null;
  }

  if (gamesIndex + 3 === segments.length) {
    return {
      kind: "players",
      gameSessionId,
    };
  }

  const playerId = segments[gamesIndex + 3];
  const accessCodeSegment = segments[gamesIndex + 4];
  const resetSegment = segments[gamesIndex + 5];

  if (
    playerId &&
    isUuid(playerId) &&
    accessCodeSegment === "access-code" &&
    resetSegment === "reset" &&
    gamesIndex + 6 === segments.length
  ) {
    return {
      kind: "resetAccessCode",
      gameSessionId,
      playerId,
    };
  }

  return null;
}
