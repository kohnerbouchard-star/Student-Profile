import type { PlayerStoryDeliveryRoute } from "../contracts/playerStoryDeliveryContracts.ts";

const DELIVERY_ID_PATTERN = /^ndl_[0-9a-f]{32}$/;

export function readPlayerStoryDeliveryRoutePath(
  pathname: string,
): PlayerStoryDeliveryRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const routeSegments = readRouteSegments(segments);
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

function readRouteSegments(
  segments: readonly string[],
): readonly string[] | null {
  if (segments[0] === "players") return segments;
  const classroomApiIndex = segments.lastIndexOf("classroom-api");
  if (classroomApiIndex < 0) return null;
  return segments.slice(classroomApiIndex + 1);
}
