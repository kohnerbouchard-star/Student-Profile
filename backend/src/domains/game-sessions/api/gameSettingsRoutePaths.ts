import { isUuid } from "../../../platform/supabase/uuid.ts";

export interface GameSettingsRoute {
  readonly gameSessionId: string;
}

export function readGameSettingsRoutePath(pathname: string): GameSettingsRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const gamesIndex = segments.lastIndexOf("games");

  if (gamesIndex < 0) {
    return null;
  }

  const gameSessionId = segments[gamesIndex + 1];
  const settingsSegment = segments[gamesIndex + 2];

  if (!gameSessionId || settingsSegment !== "settings") {
    return null;
  }

  if (gamesIndex + 3 !== segments.length) {
    return null;
  }

  if (!isUuid(gameSessionId)) {
    return null;
  }

  return { gameSessionId };
}
