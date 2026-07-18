import type {
  PlayerStockWatchlistRoute,
} from "../contracts/playerStockWatchlistContracts.ts";

const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,15}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readPlayerStockWatchlistRoutePath(
  pathname: string,
): PlayerStockWatchlistRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const playersIndex = segments.lastIndexOf("players");

  if (
    playersIndex < 0 ||
    segments[playersIndex + 1] !== "me" ||
    segments[playersIndex + 2] !== "stocks" ||
    segments[playersIndex + 3] !== "watchlist"
  ) {
    return null;
  }

  if (playersIndex + 4 === segments.length) {
    return { kind: "watchlist" };
  }

  const rawAssetId = segments[playersIndex + 4] ?? "";
  const assetId = rawAssetId.trim().toUpperCase();

  if (
    playersIndex + 5 === segments.length &&
    TICKER_PATTERN.test(assetId) &&
    !UUID_PATTERN.test(assetId)
  ) {
    return { kind: "watchlist_asset", assetId };
  }

  return { kind: "malformed" };
}
