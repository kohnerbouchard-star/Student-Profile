import { isUuid } from "../../../platform/supabase/uuid.ts";

export interface StaffDemoStorylineInitializeRoute {
  readonly gameSessionId: string;
}

export function readStaffDemoStorylineInitializeRoutePath(
  pathname: string,
): StaffDemoStorylineInitializeRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const staffIndex = segments.lastIndexOf("staff");

  if (staffIndex < 0) {
    return null;
  }

  const gameSessionsSegment = segments[staffIndex + 1];
  const gameSessionId = segments[staffIndex + 2];
  const storylinesSegment = segments[staffIndex + 3];
  const demoSegment = segments[staffIndex + 4];
  const initializeSegment = segments[staffIndex + 5];

  if (
    gameSessionsSegment !== "game-sessions" ||
    !gameSessionId ||
    !isUuid(gameSessionId) ||
    storylinesSegment !== "storylines" ||
    demoSegment !== "demo" ||
    initializeSegment !== "initialize" ||
    staffIndex + 6 !== segments.length
  ) {
    return null;
  }

  return { gameSessionId };
}
