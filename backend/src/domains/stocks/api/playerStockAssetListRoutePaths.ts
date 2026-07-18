import type {
  PlayerStockAssetListRoute,
} from "../contracts/playerStockAssetListContracts.ts";

export function readPlayerStockAssetListRoutePath(
  pathname: string,
): PlayerStockAssetListRoute | null {
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

  return playersIndex + 4 === segments.length
    ? { kind: "assets" }
    : { kind: "malformed" };
}
