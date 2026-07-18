import {
  type PlayerInventoryRoute,
  PlayerInventoryReadError,
} from "../contracts/playerInventoryReadContracts.ts";

const GAME_SCOPE_HEADERS = [
  "x-econovaria-game-session-id",
  "x-econovaria-game-id",
] as const;

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
  let unexpectedQuery: string | null = null;
  url.searchParams.forEach((_value, key) => {
    unexpectedQuery ??= key;
  });

  if (unexpectedQuery) {
    throw invalidRequest(
      `Player inventory does not accept query parameter: ${unexpectedQuery}.`,
    );
  }

  if (GAME_SCOPE_HEADERS.some((header) => request.headers.has(header))) {
    throw invalidRequest(
      "Player inventory derives game scope from x-player-session-token.",
    );
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
