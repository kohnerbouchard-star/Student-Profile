import {
  buildGamePublicRealtimeEnvelope,
  type GamePublicRealtimeEnvelope,
} from "./gamePublicRealtimePublisher.ts";

export interface GamePublicRealtimeStockTickSourceAsset {
  readonly assetId: string;
  readonly ticker: string;
  readonly countryCode: string;
}

export interface GamePublicRealtimeStockTickSourceRow {
  readonly ticker: string;
  readonly companyName: string;
  readonly sector: string;
  readonly currentPrice: number;
  readonly previousClose: number;
}

export interface GamePublicRealtimeStockTickSourceTick {
  readonly assetId: string;
  readonly ticker: string;
  readonly changePct: number;
  readonly volume: number;
}

export interface BuildGamePublicRealtimeStockTickEnvelopeInput {
  readonly gameSessionId: string;
  readonly tickIndex: number;
  readonly generatedAt: string;
  readonly assets: readonly GamePublicRealtimeStockTickSourceAsset[];
  readonly rows: readonly GamePublicRealtimeStockTickSourceRow[];
  readonly ticks: readonly GamePublicRealtimeStockTickSourceTick[];
}

export function buildGamePublicRealtimeStockTickEnvelope(
  input: BuildGamePublicRealtimeStockTickEnvelopeInput,
): GamePublicRealtimeEnvelope<"stock_tick"> {
  const assetById = new Map(
    input.assets.map((asset) => [asset.assetId, asset]),
  );
  const rowByTicker = new Map(
    input.rows.map((row) => [row.ticker, row]),
  );

  return buildGamePublicRealtimeEnvelope({
    gameSessionId: input.gameSessionId,
    sequence: input.tickIndex,
    eventType: "stock_tick",
    occurredAt: input.generatedAt,
    payload: {
      tick: input.tickIndex,
      stocks: input.ticks.map((tick) => {
        const asset = assetById.get(tick.assetId);
        const row = rowByTicker.get(tick.ticker);

        if (!asset || !row) {
          throw new Error(
            "Stock tick public realtime source did not match the calculated tick.",
          );
        }

        return {
          stockAssetId: tick.assetId,
          ticker: tick.ticker,
          companyName: row.companyName,
          sector: row.sector,
          countryCode: asset.countryCode,
          currentPrice: row.currentPrice,
          previousClose: row.previousClose,
          changePct: tick.changePct,
          volume: tick.volume,
        };
      }),
    },
  });
}
