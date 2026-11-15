import {
  calculateNextStockMarketTick,
  getCountryExposureProfile,
  OFFICIAL_ECONOVARIA_COUNTRY_CODES,
  SUPPORTED_STOCK_MARKET_SECTOR_KEYS,
} from "./stockMarketEngine.ts";
import {
  assert,
  assertEquals,
  assertNotEquals,
  assertThrows,
  baseAsset,
  baseInput,
  clone,
  SESSION_ID,
} from "./stockMarketEngine.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("stock market engine is deterministic for identical input", () => {
  const input = baseInput();

  assertEquals(
    calculateNextStockMarketTick(input),
    calculateNextStockMarketTick(clone(input)),
  );
});

Deno.test("stock market engine changes deterministic noise when the seed changes", () => {
  const first = calculateNextStockMarketTick(
    baseInput({ assets: [baseAsset({ currentVolatility: 0.08 })] }),
  );
  const second = calculateNextStockMarketTick(
    baseInput({
      seed: "different-seed",
      assets: [baseAsset({ currentVolatility: 0.08 })],
    }),
  );

  assertNotEquals(
    first.ticks[0].explanation.components.volatilityNoisePct,
    second.ticks[0].explanation.components.volatilityNoisePct,
  );
});

Deno.test("stock market engine recognizes all ten official country exposure profiles", () => {
  const assets = OFFICIAL_ECONOVARIA_COUNTRY_CODES.map((countryCode, index) =>
    baseAsset({
      assetId: `asset-${countryCode.toLowerCase()}`,
      ticker: `T${index}`,
      companyName: `${countryCode} Test Co`,
      countryCode,
      sector: index % 2 === 0 ? "TECHNOLOGY" : "LOGISTICS",
    })
  );
  const result = calculateNextStockMarketTick(baseInput({ assets }));

  assertEquals(result.rows.length, OFFICIAL_ECONOVARIA_COUNTRY_CODES.length);
  assert(result.rows.every((row) => row.gameSessionId === SESSION_ID));
  for (const countryCode of OFFICIAL_ECONOVARIA_COUNTRY_CODES) {
    assert(getCountryExposureProfile(countryCode) !== undefined);
  }
});

Deno.test("stock market engine accepts the required classroom sector categories", () => {
  const assets = SUPPORTED_STOCK_MARKET_SECTOR_KEYS.map((sector, index) =>
    baseAsset({
      assetId: `asset-${sector.toLowerCase()}`,
      ticker: `S${index}`,
      companyName: `${sector} Test Co`,
      sector,
      countryCode: OFFICIAL_ECONOVARIA_COUNTRY_CODES[
        index % OFFICIAL_ECONOVARIA_COUNTRY_CODES.length
      ],
    })
  );
  const result = calculateNextStockMarketTick(baseInput({ assets }));

  assertEquals(result.rows.length, SUPPORTED_STOCK_MARKET_SECTOR_KEYS.length);
  assert(result.rows.every((row) => row.gameSessionId === SESSION_ID));
});

Deno.test("stock market engine rejects invalid prices and missing official country codes", () => {
  assertThrows(
    () =>
      calculateNextStockMarketTick(
        baseInput({ assets: [baseAsset({ currentPrice: 0 })] }),
      ),
    "asset.currentPrice must be greater than 0",
  );
  assertThrows(
    () =>
      calculateNextStockMarketTick(
        baseInput({ assets: [baseAsset({ countryCode: "" })] }),
      ),
    "official Econovaria countries",
  );
});

Deno.test("stock market engine rejects game session mismatches before calculating", () => {
  assertThrows(
    () =>
      calculateNextStockMarketTick(
        baseInput({
          assets: [baseAsset({ gameSessionId: "other-session" })],
        }),
      ),
    "gameSessionId mismatch",
  );
});
