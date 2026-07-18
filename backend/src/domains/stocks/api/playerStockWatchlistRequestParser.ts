import {
  PlayerStockWatchlistError,
  type PlayerStockWatchlistListQuery,
  type PlayerStockWatchlistRoute,
} from "../contracts/playerStockWatchlistContracts.ts";

const DEFAULT_LIMIT = 50;
export const MAX_PLAYER_STOCK_WATCHLIST_LIMIT = 100;
export const MAX_PLAYER_STOCK_WATCHLIST_OFFSET = 10_000;
const LIST_QUERY_FIELDS = new Set(["limit", "offset"]);
const FORBIDDEN_QUERY_FIELDS = [
  "gameSessionId",
  "game_session_id",
  "gameId",
  "game_id",
  "playerId",
  "player_id",
  "playerUuid",
  "player_uuid",
  "playerSessionId",
  "player_session_id",
] as const;
const FORBIDDEN_HEADERS = [
  "x-econovaria-game-session-id",
  "x-econovaria-game-id",
  "x-player-id",
  "x-player-uuid",
  "x-player-session-id",
] as const;

export function parsePlayerStockWatchlistListRequest(
  request: Request,
  route: PlayerStockWatchlistRoute,
): PlayerStockWatchlistListQuery {
  if (route.kind !== "watchlist") {
    throw invalidRequest("The watchlist collection path is required.");
  }

  const url = new URL(request.url);
  rejectClientScopeSelection(url.searchParams, request.headers);
  rejectUnexpectedQuery(url.searchParams, LIST_QUERY_FIELDS);

  return {
    limit: readBoundedInteger(
      url.searchParams,
      "limit",
      DEFAULT_LIMIT,
      1,
      MAX_PLAYER_STOCK_WATCHLIST_LIMIT,
    ),
    offset: readBoundedInteger(
      url.searchParams,
      "offset",
      0,
      0,
      MAX_PLAYER_STOCK_WATCHLIST_OFFSET,
    ),
  };
}

export function parsePlayerStockWatchlistMutationRequest(
  request: Request,
  route: PlayerStockWatchlistRoute,
): void {
  if (route.kind !== "watchlist_asset") {
    throw invalidRequest("A public ticker assetId is required.");
  }

  const url = new URL(request.url);
  rejectClientScopeSelection(url.searchParams, request.headers);
  rejectUnexpectedQuery(url.searchParams, new Set());
}

export async function rejectPlayerStockWatchlistMutationBody(
  request: Request,
): Promise<void> {
  const body = await request.text();
  if (body.trim()) {
    throw invalidRequest("Watchlist mutations do not accept a request body.");
  }
}

function rejectClientScopeSelection(
  searchParams: URLSearchParams,
  headers: Headers,
): void {
  if (
    FORBIDDEN_QUERY_FIELDS.some((field) => searchParams.has(field)) ||
    FORBIDDEN_HEADERS.some((header) => headers.has(header))
  ) {
    throw invalidRequest(
      "Watchlist scope is derived from x-player-session-token.",
    );
  }
}

function rejectUnexpectedQuery(
  searchParams: URLSearchParams,
  allowed: ReadonlySet<string>,
): void {
  let unsupported = "";
  searchParams.forEach((_value, key) => {
    if (!unsupported && !allowed.has(key)) unsupported = key;
  });
  if (unsupported) {
    throw invalidRequest(`Unsupported query parameter: ${unsupported}.`);
  }
}

function readBoundedInteger(
  searchParams: URLSearchParams,
  fieldName: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  const values = searchParams.getAll(fieldName);
  if (values.length > 1) {
    throw invalidRequest(`At most one ${fieldName} is allowed.`);
  }
  if (values.length === 0) return defaultValue;

  const rawValue = values[0]?.trim() ?? "";
  const value = Number(rawValue);
  if (
    !rawValue ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw invalidRequest(
      `${fieldName} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}

function invalidRequest(message: string): PlayerStockWatchlistError {
  return new PlayerStockWatchlistError(
    "invalid_player_stock_watchlist_request",
    message,
    400,
    false,
  );
}
