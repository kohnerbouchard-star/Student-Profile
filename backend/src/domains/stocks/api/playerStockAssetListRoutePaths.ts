import type {
  PlayerStockAssetRoute,
} from "../contracts/playerStockAssetListContracts.ts";

const PUBLIC_STOCK_ASSET_ID_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,15}$/;

export function readPlayerStockAssetRoutePath(
  pathname: string,
): PlayerStockAssetRoute | null {
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

  if (playersIndex + 5 !== segments.length) {
    return { kind: "malformed" };
  }

  const encodedAssetId = segments[playersIndex + 4] ?? "";
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

export const readPlayerStockAssetListRoutePath = readPlayerStockAssetRoutePath;
