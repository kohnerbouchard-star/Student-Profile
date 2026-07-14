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
    }
  | {
      readonly kind: "identity";
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
  if (!playerId || !isUuid(playerId)) return null;

  const actionSegment = segments[gamesIndex + 4];
  const finalSegment = segments[gamesIndex + 5];

  if (
    actionSegment === "access-code" &&
    finalSegment === "reset" &&
    gamesIndex + 6 === segments.length
  ) {
    return {
      kind: "resetAccessCode",
      gameSessionId,
      playerId,
    };
  }

  if (
    actionSegment === "identity" &&
    gamesIndex + 5 === segments.length
  ) {
    return {
      kind: "identity",
      gameSessionId,
      playerId,
    };
  }

  return null;
}
