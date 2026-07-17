export type InventoryRedemptionRoute =
  | {
    readonly kind: "player_request";
    readonly inventoryHoldingId: string;
  }
  | {
    readonly kind: "staff_collection";
    readonly gameSessionId: string;
  }
  | {
    readonly kind: "staff_item";
    readonly gameSessionId: string;
    readonly requestId: string;
  };

export function readInventoryRedemptionRoutePath(
  pathname: string,
): InventoryRedemptionRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const normalized = segments[0] === "functions" && segments[1] === "v1"
    ? segments.slice(3)
    : segments[0] === "classroom-api" || segments[0] === "admin-api"
      ? segments.slice(1)
      : segments;

  if (
    normalized.length === 6 &&
    normalized[0] === "players" &&
    normalized[1] === "me" &&
    normalized[2] === "inventory" &&
    normalized[4] === "redemptions"
  ) {
    return {
      kind: "player_request",
      inventoryHoldingId: decodeURIComponent(normalized[3]),
    };
  }

  if (
    normalized.length === 5 &&
    normalized[0] === "staff" &&
    normalized[1] === "game-sessions" &&
    normalized[3] === "inventory" &&
    normalized[4] === "redemptions"
  ) {
    return {
      kind: "staff_collection",
      gameSessionId: decodeURIComponent(normalized[2]),
    };
  }

  if (
    normalized.length === 6 &&
    normalized[0] === "staff" &&
    normalized[1] === "game-sessions" &&
    normalized[3] === "inventory" &&
    normalized[4] === "redemptions"
  ) {
    return {
      kind: "staff_item",
      gameSessionId: decodeURIComponent(normalized[2]),
      requestId: decodeURIComponent(normalized[5]),
    };
  }

  return null;
}
