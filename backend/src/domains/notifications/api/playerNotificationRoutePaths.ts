import type { PlayerMessageThreadLifecycleRoute } from "../../messaging/api/playerMessageThreadLifecycleRoutePaths.ts";
import { readPlayerMessageThreadLifecycleRoutePath } from "../../messaging/api/playerMessageThreadLifecycleRoutePaths.ts";
import type { PlayerMessagingRoute } from "../../messaging/api/playerMessagingRoutePaths.ts";
import { readPlayerMessagingRoutePath } from "../../messaging/api/playerMessagingRoutePaths.ts";
import type { PlayerNotificationRoute } from "../contracts/playerNotificationContracts.ts";

export type PlayerCommunicationDeliveryRoute =
  | PlayerNotificationRoute
  | { readonly kind: "messaging"; readonly route: PlayerMessagingRoute }
  | {
    readonly kind: "messagingLifecycle";
    readonly route: PlayerMessageThreadLifecycleRoute;
  };

export function readPlayerNotificationRoutePath(
  pathname: string,
): PlayerCommunicationDeliveryRoute | null {
  const lifecycleRoute = readPlayerMessageThreadLifecycleRoutePath(pathname);
  if (lifecycleRoute) return { kind: "messagingLifecycle", route: lifecycleRoute };

  const messagingRoute = readPlayerMessagingRoutePath(pathname);
  if (messagingRoute) return { kind: "messaging", route: messagingRoute };

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
