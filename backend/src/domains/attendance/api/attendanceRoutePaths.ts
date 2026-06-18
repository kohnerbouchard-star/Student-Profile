import { isUuid } from "../../../platform/supabase/uuid.ts";

export interface StaffAttendanceDailyRoute {
  readonly gameSessionId: string;
}

export interface StaffAttendanceScanRoute {
  readonly gameSessionId: string;
}

export function readStaffAttendanceDailyRoutePath(
  pathname: string,
): StaffAttendanceDailyRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const gamesIndex = segments.lastIndexOf("games");

  if (gamesIndex < 0) {
    return null;
  }

  const gameSessionId = segments[gamesIndex + 1];
  const attendanceSegment = segments[gamesIndex + 2];

  if (
    gameSessionId &&
    isUuid(gameSessionId) &&
    attendanceSegment === "attendance" &&
    gamesIndex + 3 === segments.length
  ) {
    return { gameSessionId };
  }

  return null;
}

export function readStaffAttendanceScanRoutePath(
  pathname: string,
): StaffAttendanceScanRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const gamesIndex = segments.lastIndexOf("games");

  if (gamesIndex < 0) {
    return null;
  }

  const gameSessionId = segments[gamesIndex + 1];
  const attendanceSegment = segments[gamesIndex + 2];
  const scanSegment = segments[gamesIndex + 3];

  if (
    gameSessionId &&
    isUuid(gameSessionId) &&
    attendanceSegment === "attendance" &&
    scanSegment === "scan" &&
    gamesIndex + 4 === segments.length
  ) {
    return { gameSessionId };
  }

  return null;
}
