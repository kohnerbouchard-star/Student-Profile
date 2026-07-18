import type {
  PlayerStockAssetDto,
  PlayerStockAssetRecord,
} from "../contracts/playerStockAssetListContracts.ts";

export function toPlayerStockAssetDto(
  asset: PlayerStockAssetRecord,
  volume: number,
): PlayerStockAssetDto {
  const changePct = asset.previousClose > 0
    ? ((asset.currentPrice - asset.previousClose) / asset.previousClose) * 100
    : 0;

  return {
    assetId: asset.ticker,
    ticker: asset.ticker,
    companyName: asset.companyName,
    sector: asset.sector,
    countryCode: asset.countryCode,
    currentPrice: asset.currentPrice,
    previousClose: asset.previousClose,
    changePct: round(changePct),
    openPrice: asset.openPrice,
    dayHigh: asset.dayHigh,
    dayLow: asset.dayLow,
    volume,
    marketCap: asset.marketCap,
    currentVolatility: asset.currentVolatility,
    longRunVolatility: asset.longRunVolatility,
    description: asset.description,
  };
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
