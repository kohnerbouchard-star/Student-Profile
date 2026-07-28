import type { PlayerSessionLogoutRoute } from "../contracts/playerSessionLogoutContracts.ts";
import { readPlayerApiRouteSegments } from "./playerApiRouteSegments.ts";

export function readPlayerSessionLogoutRoutePath(
  pathname: string,
): PlayerSessionLogoutRoute | null {
  const routeSegments = readPlayerApiRouteSegments(pathname);
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
