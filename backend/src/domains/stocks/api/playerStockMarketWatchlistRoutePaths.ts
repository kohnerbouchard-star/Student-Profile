import { isUuid } from "../../../platform/supabase/uuid.ts";

export type PlayerStockMarketWatchlistRoute =
  | {
    readonly kind: "watchlist";
  }
  | {
    readonly kind: "watchlist_asset";
    readonly assetId: string;
  }
  | {
    readonly kind: "malformed";
  };

export function readPlayerStockMarketWatchlistRoutePath(
  pathname: string,
): PlayerStockMarketWatchlistRoute | null {
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

  const assetId = segments[playersIndex + 4];

  if (
    playersIndex + 5 === segments.length &&
    assetId &&
    isUuid(assetId)
  ) {
    return {
      kind: "watchlist_asset",
      assetId,
    };
  }

  return { kind: "malformed" };
}
