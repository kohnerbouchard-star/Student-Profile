import type { PlayerNotificationRoute } from "../contracts/playerNotificationContracts.ts";

export function readPlayerNotificationRoutePath(
  pathname: string,
): PlayerNotificationRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const routeSegments = readRouteSegments(segments);

  if (!routeSegments) return null;

  if (
    routeSegments.length === 3 &&
    routeSegments[0] === "players" &&
    routeSegments[1] === "me" &&
    routeSegments[2] === "notifications"
  ) {
    return { kind: "list" };
  }

  if (
    routeSegments.length === 4 &&
    routeSegments[0] === "players" &&
    routeSegments[1] === "me" &&
    routeSegments[2] === "notifications" &&
    routeSegments[3] === "read"
  ) {
    return { kind: "markRead" };
  }

  if (
    routeSegments.length > 3 &&
    routeSegments[0] === "players" &&
    routeSegments[1] === "me" &&
    routeSegments[2] === "notifications"
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
