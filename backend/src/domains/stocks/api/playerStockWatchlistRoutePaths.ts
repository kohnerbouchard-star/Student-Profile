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
  const routeSegments = readExactRouteSegments(segments);

  if (
    !routeSegments ||
    routeSegments[0] !== "players" ||
    routeSegments[1] !== "me" ||
    routeSegments[2] !== "stocks" ||
    routeSegments[3] !== "watchlist"
  ) {
    return null;
  }

  if (routeSegments.length === 4) {
    return { kind: "watchlist" };
  }

  const rawAssetId = routeSegments[4] ?? "";
  const assetId = rawAssetId.trim().toUpperCase();

  if (
    routeSegments.length === 5 &&
    TICKER_PATTERN.test(assetId) &&
    !UUID_PATTERN.test(assetId)
  ) {
    return { kind: "watchlist_asset", assetId };
  }

  return { kind: "malformed" };
}

function readExactRouteSegments(
  segments: readonly string[],
): readonly string[] | null {
  if (segments[0] === "players") return segments;

  if (
    segments[0] === "functions" &&
    segments[1] === "v1" &&
    segments[2] === "classroom-api"
  ) {
    return segments.slice(3);
  }

  return null;
}
