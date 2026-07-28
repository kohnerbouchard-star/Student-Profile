import type { PlayerInventoryRedemptionRoute } from "../contracts/playerInventoryRedemptionContracts.ts";
import { isUuid } from "../../../platform/supabase/uuid.ts";
import { readPlayerApiRouteSegments } from "../../players/api/playerApiRouteSegments.ts";

const ITEM_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const REQUEST_ID_PATTERN = /^red_[0-9a-f]{32}$/;

export function readPlayerInventoryRedemptionRoutePath(
  pathname: string,
): PlayerInventoryRedemptionRoute | null {
  const routeSegments = readPlayerApiRouteSegments(pathname);
  if (!routeSegments) return null;
  if (
    routeSegments.length < 4 ||
    routeSegments[0] !== "players" ||
    routeSegments[1] !== "me" ||
    routeSegments[2] !== "inventory"
  ) {
    return null;
  }

  const suffix = routeSegments.slice(3);
  if (suffix.length === 1 && suffix[0] === "redemptions") {
    return { kind: "collection" };
  }
  if (suffix.length === 2 && suffix[0] === "redemptions") {
    return REQUEST_ID_PATTERN.test(suffix[1] ?? "")
      ? { kind: "item", requestId: suffix[1]! }
      : { kind: "malformed" };
  }
  if (suffix.length === 2 && suffix[1] === "redemptions") {
    return ITEM_ID_PATTERN.test(suffix[0] ?? "") && !isUuid(suffix[0] ?? "")
      ? { kind: "request", itemId: suffix[0]! }
      : { kind: "malformed" };
  }

  return suffix.includes("redemptions") ? { kind: "malformed" } : null;
}
