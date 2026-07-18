import type { PlayerSessionLogoutRoute } from "../contracts/playerSessionLogoutContracts.ts";

export function readPlayerSessionLogoutRoutePath(
  pathname: string,
): PlayerSessionLogoutRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const routeSegments = readRouteSegments(segments);
  if (!routeSegments) return null;

  if (
    routeSegments.length === 4 &&
    routeSegments[0] === "players" &&
    routeSegments[1] === "me" &&
    routeSegments[2] === "session" &&
    routeSegments[3] === "logout"
  ) {
    return { kind: "logout" };
  }

  if (
    routeSegments.length >= 3 &&
    routeSegments[0] === "players" &&
    routeSegments[1] === "me" &&
    routeSegments[2] === "session"
  ) {
    return { kind: "malformed" };
  }

  return null;
}

function readRouteSegments(
  segments: readonly string[],
): readonly string[] | null {
  if (segments[0] === "players") return segments;
  const classroomApiIndex = segments.lastIndexOf("classroom-api");
  if (classroomApiIndex < 0) return null;
  return segments.slice(classroomApiIndex + 1);
}
