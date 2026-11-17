import { calculateNextStockMarketTick } from "./stockMarketEngine.ts";
import {
  assert,
  assertEquals,
  baseAsset,
  baseInput,
  bullishMacro,
  shock,
  stressedMacro,
} from "./stockMarketEngine.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("positive macro signals outperform high-rate risk signals", () => {
  const strong = calculateNextStockMarketTick(
    baseInput({ macro: bullishMacro() }),
  );
  const weak = calculateNextStockMarketTick(
    baseInput({ macro: stressedMacro() }),
  );

  assert(strong.ticks[0].price > weak.ticks[0].price);
  assert(strong.ticks[0].explanation.components.marketFactorPct > 0);
  assert(weak.ticks[0].explanation.components.marketFactorPct < 0);
});

Deno.test("high inflation and interest rates create downward market pressure", () => {
  const neutral = calculateNextStockMarketTick(baseInput());
  const stressed = calculateNextStockMarketTick(
    baseInput({ macro: stressedMacro() }),
  );

  assert(
    stressed.ticks[0].explanation.components.marketFactorPct <
      neutral.ticks[0].explanation.components.marketFactorPct,
  );
  assert(stressed.ticks[0].price < neutral.ticks[0].price);
});

Deno.test("growth, confidence, and stability create upward market pressure", () => {
  const neutral = calculateNextStockMarketTick(baseInput());
  const strong = calculateNextStockMarketTick(
    baseInput({ macro: bullishMacro() }),
  );

  assert(
    strong.ticks[0].explanation.components.marketFactorPct >
      neutral.ticks[0].explanation.components.marketFactorPct,
  );
  assert(strong.ticks[0].price > neutral.ticks[0].price);
});

Deno.test("company fundamentals affect the calculated movement", () => {
  const strong = calculateNextStockMarketTick(
    baseInput({
      assets: [baseAsset({
        fundamentals: {
          revenueGrowth: 0.16,
          profitMargin: 0.18,
          debtLevel: 0.15,
          cashReserves: 0.9,
          innovationScore: 0.9,
          supplyChainRisk: 0.2,
          politicalExposure: 0.2,
          commodityExposure: 0.1,
        },
      })],
    }),
  );
  const weak = calculateNextStockMarketTick(
    baseInput({
      assets: [baseAsset({
        fundamentals: {
          revenueGrowth: -0.08,
          profitMargin: 0.02,
          debtLevel: 0.95,
          cashReserves: 0.1,
          innovationScore: 0.15,
          supplyChainRisk: 0.9,
          politicalExposure: 0.9,
          commodityExposure: 0.9,
        },
      })],
    }),
  );

  assert(
    strong.ticks[0].explanation.components.fundamentalsFactorPct >
      weak.ticks[0].explanation.components.fundamentalsFactorPct,
  );
});

Deno.test("global shocks apply to every asset in the tick", () => {
  const result = calculateNextStockMarketTick(
    baseInput({
      assets: [
        baseAsset({ ticker: "AURA", countryCode: "SOLVEND" }),
        baseAsset({
          assetId: "asset-iron",
          ticker: "IRON",
          countryCode: "DRAVENLOK",
          sector: "STEEL",
        }),
      ],
      shocks: [shock({ scope: "global", shockId: "global-rally" })],
    }),
  );

  assertEquals(result.ticks[0].explanation.appliedShockIds, ["global-rally"]);
  assertEquals(result.ticks[1].explanation.appliedShockIds, ["global-rally"]);
});

Deno.test("country shocks affect direct and exposure-weighted country assets", () => {
  const result = calculateNextStockMarketTick(
    baseInput({
      assets: [
        baseAsset({ ticker: "FROST", countryCode: "NORTHREACH" }),
        baseAsset({
          assetId: "asset-syndalis-link",
          ticker: "LINK",
          countryCode: "SYNDALIS",
          countryExposure: { NORTHREACH: 0.5 },
        }),
        baseAsset({
          assetId: "asset-eldoran-farm",
          ticker: "FARM",
          countryCode: "ELDORAN",
          sector: "AGRICULTURE",
        }),
      ],
      shocks: [
        shock({
          scope: "country",
          targetKey: "NORTHREACH",
          shockId: "northreach-mineral-surge",
        }),
      ],
    }),
  );

  assertEquals(result.ticks[0].explanation.appliedShockIds, [
    "northreach-mineral-surge",
  ]);
  assertEquals(result.ticks[1].explanation.appliedShockIds, [
    "northreach-mineral-surge",
  ]);
  assertEquals(result.ticks[2].explanation.appliedShockIds, []);
});

Deno.test("sector shocks affect direct and exposure-weighted sector assets", () => {
  const result = calculateNextStockMarketTick(
    baseInput({
      assets: [
        baseAsset({ ticker: "GRID", sector: "ENERGY" }),
        baseAsset({
          assetId: "asset-fin-energy",
          ticker: "LEND",
          sector: "FINANCE",
          sectorExposure: { ENERGY: 0.4 },
        }),
        baseAsset({
          assetId: "asset-media",
          ticker: "STAR",
          sector: "MEDIA",
          countryCode: "LUMENOR",
        }),
      ],
      shocks: [
        shock({
          scope: "sector",
          targetKey: "ENERGY",
          shockId: "energy-grid-expansion",
        }),
      ],
    }),
  );

  assertEquals(result.ticks[0].explanation.appliedShockIds, [
    "energy-grid-expansion",
  ]);
  assertEquals(result.ticks[1].explanation.appliedShockIds, [
    "energy-grid-expansion",
  ]);
  assertEquals(result.ticks[2].explanation.appliedShockIds, []);
});

Deno.test("ticker shocks only affect the targeted company", () => {
  const result = calculateNextStockMarketTick(
    baseInput({
      assets: [
        baseAsset({ ticker: "AURA" }),
        baseAsset({ assetId: "asset-other", ticker: "BETA" }),
      ],
      shocks: [
        shock({ scope: "ticker", targetKey: "AURA", shockId: "aura-contract" }),
      ],
    }),
  );

  assertEquals(result.ticks[0].explanation.appliedShockIds, ["aura-contract"]);
  assertEquals(result.ticks[1].explanation.appliedShockIds, []);
});

Deno.test("positive ticker shocks increase price relative to a neutral baseline", () => {
  const neutral = calculateNextStockMarketTick(baseInput());
  const shocked = calculateNextStockMarketTick(
    baseInput({
      shocks: [
        shock({
          scope: "ticker",
          targetKey: "AURA",
          shockId: "aura-positive-contract",
          magnitude: 0.06,
        }),
      ],
    }),
  );

  assert(shocked.ticks[0].price > neutral.ticks[0].price);
  assert(shocked.ticks[0].explanation.components.shockFactorPct > 0);
});

Deno.test("negative ticker shocks decrease price relative to a neutral baseline", () => {
  const neutral = calculateNextStockMarketTick(baseInput());
  const shocked = calculateNextStockMarketTick(
    baseInput({
      shocks: [
        shock({
          scope: "ticker",
          targetKey: "AURA",
          shockId: "aura-negative-recall",
          magnitude: -0.06,
        }),
      ],
    }),
  );

  assert(shocked.ticks[0].price < neutral.ticks[0].price);
  assert(shocked.ticks[0].explanation.components.shockFactorPct < 0);
});

Deno.test("shock decay reduces later tick impact", () => {
  const immediate = calculateNextStockMarketTick(
    baseInput({
      tickIndex: 4,
      shocks: [shock({ createdTick: 4, decay: 0.5, magnitude: 0.08 })],
    }),
  );
  const decayed = calculateNextStockMarketTick(
    baseInput({
      tickIndex: 6,
      shocks: [shock({ createdTick: 4, decay: 0.5, magnitude: 0.08 })],
    }),
  );

  assert(
    Math.abs(immediate.ticks[0].explanation.components.shockFactorPct) >
      Math.abs(decayed.ticks[0].explanation.components.shockFactorPct),
  );
});
