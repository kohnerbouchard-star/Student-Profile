import { readPlayerApiRouteSegments } from "../../players/api/playerApiRouteSegments.ts";
import type { PlayerNotificationRoute } from "../contracts/playerNotificationContracts.ts";

export function readPlayerNotificationRoutePath(
  pathname: string,
): PlayerNotificationRoute | null {
  const routeSegments = readPlayerApiRouteSegments(pathname);

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
