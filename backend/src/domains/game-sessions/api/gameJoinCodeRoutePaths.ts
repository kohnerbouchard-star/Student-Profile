import { isUuid } from "../../../platform/supabase/uuid.ts";

export interface GameJoinCodeRoute {
  readonly gameSessionId: string;
}

export function readGameJoinCodeRoutePath(pathname: string): GameJoinCodeRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const gamesIndex = segments.lastIndexOf("games");

  if (gamesIndex < 0) {
    return null;
  }

  const gameSessionId = segments[gamesIndex + 1];
  const joinCodeSegment = segments[gamesIndex + 2];
  const resetSegment = segments[gamesIndex + 3];

  if (
    gameSessionId &&
    isUuid(gameSessionId) &&
    joinCodeSegment === "join-code" &&
    resetSegment === "reset" &&
    gamesIndex + 4 === segments.length
  ) {
    return { gameSessionId };
  }

  return null;
}
