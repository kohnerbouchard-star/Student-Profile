import {
  PlayerStockAssetDetailError,
  type PlayerStockAssetDetailQuery,
} from "../contracts/playerStockAssetDetailContracts.ts";
import type {
  PlayerStockAssetRoute,
} from "../contracts/playerStockAssetListContracts.ts";

const DEFAULT_HISTORY_LIMIT = 200;
export const MAX_PLAYER_STOCK_ASSET_HISTORY_LIMIT = 500;
const ALLOWED_QUERY_FIELDS = new Set(["historyLimit"]);
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

export function parsePlayerStockAssetDetailRequest(
  request: Request,
  route: PlayerStockAssetRoute,
): PlayerStockAssetDetailQuery {
  if (route.kind !== "asset") {
    throw invalidRequest(
      "Market asset detail paths require exactly one public ticker assetId.",
    );
  }

  const url = new URL(request.url);
  rejectClientGameSelection(url.searchParams, request.headers);
  rejectUnexpectedQuery(url.searchParams);

  return {
    assetId: route.assetId,
    historyLimit: readHistoryLimit(url.searchParams),
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

function readHistoryLimit(searchParams: URLSearchParams): number {
  const values = searchParams.getAll("historyLimit");
  if (values.length > 1) {
    throw invalidRequest("At most one historyLimit is allowed.");
  }
  if (values.length === 0) return DEFAULT_HISTORY_LIMIT;

  const rawValue = values[0]?.trim() ?? "";
  const value = Number(rawValue);
  if (
    !rawValue ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_PLAYER_STOCK_ASSET_HISTORY_LIMIT
  ) {
    throw invalidRequest(
      `historyLimit must be an integer between 1 and ${MAX_PLAYER_STOCK_ASSET_HISTORY_LIMIT}.`,
    );
  }
  return value;
}

function invalidRequest(message: string): PlayerStockAssetDetailError {
  return new PlayerStockAssetDetailError(
    "invalid_player_stock_asset_detail_request",
    message,
    400,
    false,
  );
}
