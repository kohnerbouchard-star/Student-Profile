import type {
  PlayerStockAssetRoute,
} from "../contracts/playerStockAssetListContracts.ts";
import type {
  PlayerStockWatchlistRoute,
} from "../contracts/playerStockWatchlistContracts.ts";
import {
  readPlayerStockWatchlistRoutePath,
} from "./playerStockWatchlistRoutePaths.ts";

const PUBLIC_STOCK_ASSET_ID_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,15}$/;

export type PlayerStockMarketPublicRoute =
  | PlayerStockAssetRoute
  | PlayerStockWatchlistRoute;

export function readPlayerStockMarketPublicRoutePath(
  pathname: string,
): PlayerStockMarketPublicRoute | null {
  const watchlistRoute = readPlayerStockWatchlistRoutePath(pathname);
  if (watchlistRoute) return watchlistRoute;

  const segments = pathname.split("/").filter(Boolean);
  const routeSegments = readExactRouteSegments(segments);

  if (
    !routeSegments ||
    routeSegments[0] !== "players" ||
    routeSegments[1] !== "me" ||
    routeSegments[2] !== "stocks" ||
    routeSegments[3] !== "assets"
  ) {
    return null;
  }

  if (routeSegments.length === 4) {
    return { kind: "assets" };
  }

  if (routeSegments.length !== 5) {
    return { kind: "malformed" };
  }

  const encodedAssetId = routeSegments[4] ?? "";
  let assetId = "";

  try {
    assetId = decodeURIComponent(encodedAssetId).trim().toUpperCase();
  } catch {
    return { kind: "malformed" };
  }

  return PUBLIC_STOCK_ASSET_ID_PATTERN.test(assetId)
    ? { kind: "asset", assetId }
    : { kind: "malformed" };
}

export const readPlayerStockAssetRoutePath =
  readPlayerStockMarketPublicRoutePath;
export const readPlayerStockAssetListRoutePath =
  readPlayerStockMarketPublicRoutePath;

function readExactRouteSegments(
  segments: readonly string[],
): readonly string[] | null {
  if (segments[0] === "players") return segments;

  if (
    segments[0] === "classroom-api" &&
    segments[1] === "players"
  ) {
    return segments.slice(1);
  }

  if (
    segments[0] === "functions" &&
    segments[1] === "v1" &&
    segments[2] === "classroom-api"
  ) {
    return segments.slice(3);
  }

  return null;
}
