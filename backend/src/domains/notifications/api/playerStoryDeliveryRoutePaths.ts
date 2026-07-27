import { readPlayerApiRouteSegments } from "../../players/api/playerApiRouteSegments.ts";
import type { PlayerStoryDeliveryRoute } from "../contracts/playerStoryDeliveryContracts.ts";

const DELIVERY_ID_PATTERN = /^ndl_[0-9a-f]{32}$/;

export function readPlayerStoryDeliveryRoutePath(
  pathname: string,
): PlayerStoryDeliveryRoute | null {
  const routeSegments = readPlayerApiRouteSegments(pathname);
  if (!routeSegments) return null;

  if (
    routeSegments.length === 3 &&
    routeSegments[0] === "players" &&
    routeSegments[1] === "me" &&
    routeSegments[2] === "story-deliveries"
  ) {
    return { kind: "list" };
  }

  if (
    routeSegments.length === 5 &&
    routeSegments[0] === "players" &&
    routeSegments[1] === "me" &&
    routeSegments[2] === "story-deliveries" &&
    routeSegments[4] === "state"
  ) {
    const publicDeliveryId = routeSegments[3]?.toLowerCase() ?? "";
    return DELIVERY_ID_PATTERN.test(publicDeliveryId)
      ? { kind: "state", publicDeliveryId }
      : { kind: "malformed" };
  }

  if (
    routeSegments.length >= 3 &&
    routeSegments[0] === "players" &&
    routeSegments[1] === "me" &&
    routeSegments[2] === "story-deliveries"
  ) {
    return { kind: "malformed" };
  }

  return null;
}
