import { readPlayerCraftingRoutePath } from "../../crafting/api/playerCraftingRoutePaths.ts";
import { readPlayerApiRouteSegments } from "../../players/api/playerApiRouteSegments.ts";
import type { PlayerInventoryRoute } from "../contracts/playerInventoryReadContracts.ts";

export function readPlayerInventoryRoutePath(
  pathname: string,
): PlayerInventoryRoute | null {
  const craftingRoute = readPlayerCraftingRoutePath(pathname);
  if (craftingRoute) return { kind: "crafting", route: craftingRoute };

  const routeSegments = readPlayerApiRouteSegments(pathname);

  if (!routeSegments) {
    return null;
  }

  if (
    routeSegments.length === 3 &&
    routeSegments[0] === "players" &&
    routeSegments[1] === "me" &&
    routeSegments[2] === "inventory"
  ) {
    return { kind: "inventory" };
  }

  if (
    routeSegments.length > 3 &&
    routeSegments[0] === "players" &&
    routeSegments[1] === "me" &&
    routeSegments[2] === "inventory"
  ) {
    return { kind: "malformed" };
  }

  return null;
}
