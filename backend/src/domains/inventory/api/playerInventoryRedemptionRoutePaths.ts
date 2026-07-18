import type { PlayerInventoryRedemptionRoute } from "../contracts/playerInventoryRedemptionContracts.ts";
import { isUuid } from "../../../platform/supabase/uuid.ts";

const DIRECT_PREFIX = "/players/me/inventory";
const EDGE_PREFIX = "/functions/v1/classroom-api/players/me/inventory";
const ITEM_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const REQUEST_ID_PATTERN = /^red_[0-9a-f]{32}$/;

export function readPlayerInventoryRedemptionRoutePath(
  pathname: string,
): PlayerInventoryRedemptionRoute | null {
  const prefix =
    pathname === DIRECT_PREFIX || pathname.startsWith(`${DIRECT_PREFIX}/`)
      ? DIRECT_PREFIX
      : pathname === EDGE_PREFIX || pathname.startsWith(`${EDGE_PREFIX}/`)
      ? EDGE_PREFIX
      : null;
  if (!prefix) return null;

  const suffix = pathname.slice(prefix.length);
  if (suffix === "/redemptions") return { kind: "collection" };

  const segments = suffix.split("/").filter(Boolean);
  if (segments.length === 2 && segments[0] === "redemptions") {
    return REQUEST_ID_PATTERN.test(segments[1] ?? "")
      ? { kind: "item", requestId: segments[1]! }
      : { kind: "malformed" };
  }
  if (segments.length === 2 && segments[1] === "redemptions") {
    return ITEM_ID_PATTERN.test(segments[0] ?? "") && !isUuid(segments[0] ?? "")
      ? { kind: "request", itemId: segments[0]! }
      : { kind: "malformed" };
  }

  return suffix.includes("redemptions") ? { kind: "malformed" } : null;
}
