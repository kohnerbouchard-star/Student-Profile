import {
  type PlayerInventoryRoute,
  PlayerInventoryReadError,
} from "../contracts/playerInventoryReadContracts.ts";

export interface PlayerInventoryReadRequest {
  readonly kind: "inventory";
}

export function parsePlayerInventoryReadRequest(
  request: Request,
  route: PlayerInventoryRoute,
): PlayerInventoryReadRequest {
  if (route.kind !== "inventory") {
    throw invalidRequest("Player inventory route is malformed.");
  }

  const url = new URL(request.url);
  if ([...url.searchParams.keys()].length > 0) {
    throw invalidRequest("Player inventory does not accept query parameters.");
  }

  return { kind: "inventory" };
}

function invalidRequest(message: string): PlayerInventoryReadError {
  return new PlayerInventoryReadError(
    "invalid_player_inventory_request",
    message,
    400,
    false,
  );
}
