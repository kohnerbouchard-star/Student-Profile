import {
  PlayerStockAssetListError,
  type PlayerStockAssetListQuery,
  type PlayerStockAssetListRoute,
} from "../contracts/playerStockAssetListContracts.ts";

const DEFAULT_LIMIT = 50;
export const MAX_PLAYER_STOCK_ASSET_LIST_LIMIT = 100;
export const MAX_PLAYER_STOCK_ASSET_LIST_OFFSET = 10_000;
const ALLOWED_QUERY_FIELDS = new Set(["limit", "offset"]);
const GAME_QUERY_FIELDS = [
  "gameSessionId",
  "game_session_id",
  "gameId",
  "game_id",
] as const;
const GAME_HEADERS = [
  "x-econovaria-game-session-id",
  "x-econovaria-game-id",
] as const;

export function parsePlayerStockAssetListRequest(
  request: Request,
  route: PlayerStockAssetListRoute,
): PlayerStockAssetListQuery {
  if (route.kind === "malformed") {
    throw invalidRequest("Market asset list paths do not accept extra segments.");
  }

  const url = new URL(request.url);
  rejectClientGameSelection(url.searchParams, request.headers);
  rejectUnexpectedQuery(url.searchParams);

  return {
    limit: readBoundedInteger(
      url.searchParams,
      "limit",
      DEFAULT_LIMIT,
      1,
      MAX_PLAYER_STOCK_ASSET_LIST_LIMIT,
    ),
    offset: readBoundedInteger(
      url.searchParams,
      "offset",
      0,
      0,
      MAX_PLAYER_STOCK_ASSET_LIST_OFFSET,
    ),
  };
}

function rejectClientGameSelection(
  searchParams: URLSearchParams,
  headers: Headers,
): void {
  if (
    GAME_QUERY_FIELDS.some((field) => searchParams.has(field)) ||
    GAME_HEADERS.some((header) => headers.has(header))
  ) {
    throw invalidRequest(
      "Market reads derive game scope from x-player-session-token.",
    );
  }
}

function rejectUnexpectedQuery(searchParams: URLSearchParams): void {
  let unsupported = "";
  searchParams.forEach((_value, key) => {
    if (!unsupported && !ALLOWED_QUERY_FIELDS.has(key)) unsupported = key;
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

function invalidRequest(message: string): PlayerStockAssetListError {
  return new PlayerStockAssetListError(
    "invalid_player_stock_asset_list_request",
    message,
    400,
    false,
  );
}
