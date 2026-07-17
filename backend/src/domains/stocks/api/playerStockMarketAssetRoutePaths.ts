import { isUuid } from "../../../platform/supabase/uuid.ts";

export type PlayerStockMarketAssetRoute =
  | {
    readonly kind: "assets";
  }
  | {
    readonly kind: "asset";
    readonly assetId: string;
  }
  | {
    readonly kind: "malformed";
  };

export function readPlayerStockMarketAssetRoutePath(
  pathname: string,
): PlayerStockMarketAssetRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const playersIndex = segments.lastIndexOf("players");

  if (
    playersIndex < 0 ||
    segments[playersIndex + 1] !== "me" ||
    segments[playersIndex + 2] !== "stocks" ||
    segments[playersIndex + 3] !== "assets"
  ) {
    return null;
  }

  if (playersIndex + 4 === segments.length) {
    return { kind: "assets" };
  }

  const assetId = segments[playersIndex + 4];

  if (
    playersIndex + 5 === segments.length &&
    assetId &&
    isUuid(assetId)
  ) {
    return {
      kind: "asset",
      assetId,
    };
  }

  return { kind: "malformed" };
}
