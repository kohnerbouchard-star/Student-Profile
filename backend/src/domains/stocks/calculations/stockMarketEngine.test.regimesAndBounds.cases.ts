import type { StockMarketChartPoint } from "../contracts/stockMarketEngineContracts.ts";
import { calculateNextStockMarketTick } from "./stockMarketEngine.ts";
import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertNotEquals,
  baseAsset,
  baseInput,
  bullishMacro,
  neutralMacro,
  regime,
  SESSION_ID,
  settings,
  shock,
} from "./stockMarketEngine.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("crisis regimes increase volatility and volume", () => {
  const sideways = calculateNextStockMarketTick(baseInput());
  const crisis = calculateNextStockMarketTick(
    baseInput({ regime: regime({ regime: "crisis" }) }),
  );

  assert(crisis.ticks[0].currentVolatility > sideways.ticks[0].currentVolatility);
  assert(crisis.ticks[0].volume > sideways.ticks[0].volume);
});

Deno.test("recovery regimes support positive drift after crisis conditions", () => {
  const crisis = calculateNextStockMarketTick(
    baseInput({
      assets: [baseAsset({ currentVolatility: 0.08 })],
      regime: regime({ regime: "crisis" }),
    }),
  );
  const recovery = calculateNextStockMarketTick(
    baseInput({
      assets: [baseAsset({ currentVolatility: 0.08 })],
      regime: regime({ regime: "recovery" }),
    }),
  );

  assert(recovery.ticks[0].price > crisis.ticks[0].price);
  assert(recovery.ticks[0].explanation.components.regimeFactorPct > 0);
});

Deno.test("high-beta assets react more strongly to market factors", () => {
  const lowBeta = calculateNextStockMarketTick(
    baseInput({
      macro: bullishMacro(),
      assets: [baseAsset({ beta: 0.5 })],
    }),
  );
  const highBeta = calculateNextStockMarketTick(
    baseInput({
      macro: bullishMacro(),
      assets: [baseAsset({ beta: 2 })],
    }),
  );

  assert(highBeta.ticks[0].changePct > lowBeta.ticks[0].changePct);
});

Deno.test("liquid assets dampen extreme shock movement", () => {
  const lowLiquidity = calculateNextStockMarketTick(
    baseInput({
      assets: [baseAsset({ liquidity: 0 })],
      shocks: [shock({ magnitude: 0.08 })],
    }),
  );
  const highLiquidity = calculateNextStockMarketTick(
    baseInput({
      assets: [baseAsset({ liquidity: 1 })],
      shocks: [shock({ magnitude: 0.08 })],
    }),
  );

  assert(
    Math.abs(lowLiquidity.ticks[0].changePct) >
      Math.abs(highLiquidity.ticks[0].changePct),
  );
});

Deno.test("prices remain positive and configured tick moves remain bounded", () => {
  const result = calculateNextStockMarketTick(
    baseInput({
      settings: settings({ maxTickMovePct: 5 }),
      shocks: [shock({ magnitude: -25 })],
    }),
  );

  assert(result.ticks[0].price > 0);
  assert(Math.abs(result.ticks[0].changePct) <= 5.0001);
});

Deno.test("volatility memory remains elevated after a shock starts fading", () => {
  const shocked = calculateNextStockMarketTick(
    baseInput({
      shocks: [shock({ volatilityImpact: 0.06, magnitude: 0 })],
    }),
  );
  const next = calculateNextStockMarketTick(
    baseInput({
      tickIndex: 2,
      shocks: [],
      assets: [baseAsset({
        currentVolatility: shocked.ticks[0].currentVolatility,
        longRunVolatility: shocked.ticks[0].longRunVolatility,
      })],
    }),
  );

  assert(shocked.ticks[0].currentVolatility > baseAsset().longRunVolatility);
  assert(next.ticks[0].currentVolatility > baseAsset().longRunVolatility);
});

Deno.test("same ticker in different game sessions stays isolated", () => {
  const first = calculateNextStockMarketTick(
    baseInput({
      gameSessionId: "session-one",
      macro: neutralMacro("session-one"),
      assets: [baseAsset({
        gameSessionId: "session-one",
        currentVolatility: 0.07,
      })],
    }),
  );
  const second = calculateNextStockMarketTick(
    baseInput({
      gameSessionId: "session-two",
      macro: neutralMacro("session-two"),
      assets: [baseAsset({
        gameSessionId: "session-two",
        currentVolatility: 0.07,
      })],
    }),
  );

  assertEquals(first.gameSessionId, "session-one");
  assertEquals(second.gameSessionId, "session-two");
  assertNotEquals(first.ticks[0].price, second.ticks[0].price);
});

Deno.test("rows include the fields expected by market and snapshot normalizers", () => {
  const result = calculateNextStockMarketTick(baseInput());
  const row = result.rows[0];

  assertEquals(row.assetType, "Stock");
  assertEquals(row.gameSessionId, SESSION_ID);
  assertEquals(typeof row.ticker, "string");
  assertEquals(typeof row.companyName, "string");
  assertEquals(typeof row.sector, "string");
  assertEquals(typeof row.currentPrice, "number");
  assertEquals(typeof row.changePct, "string");
  assertEquals(typeof row.previousClose, "number");
  assertEquals(typeof row.openPrice, "number");
  assertEquals(typeof row.dayHigh, "number");
  assertEquals(typeof row.dayLow, "number");
  assertEquals(typeof row.volume, "number");
  assertEquals(typeof row.marketCap, "number");
  assertEquals(typeof row.beta, "number");
  assertEquals(row.history[row.history.length - 1].gameSessionId, SESSION_ID);
  assertEquals(row.lastUpdated, "tick-1");
});

Deno.test("explanation finalReturnPct matches the computed price movement", () => {
  const result = calculateNextStockMarketTick(baseInput());
  const tick = result.ticks[0];
  const computed = ((tick.price - tick.previousPrice) / tick.previousPrice) *
    100;

  assertAlmostEquals(
    tick.explanation.components.finalReturnPct,
    computed,
    0.0001,
  );
});

Deno.test("history appends the new point and caps to the newest configured length", () => {
  const history: StockMarketChartPoint[] = [];
  for (let index = 0; index < 35; index += 1) {
    history.push({
      gameSessionId: SESSION_ID,
      tickIndex: index,
      timestamp: `tick-${index}`,
      label: `Tick ${index}`,
      price: 100 + index,
      volume: 1000 + index,
    });
  }
  const result = calculateNextStockMarketTick(
    baseInput({
      tickIndex: 35,
      assets: [baseAsset({ history })],
      settings: settings({ maxHistoryPoints: 30 }),
    }),
  );

  assertEquals(result.rows[0].history.length, 30);
  assertEquals(result.rows[0].history[0].tickIndex, 6);
  assertEquals(result.rows[0].history[29].tickIndex, 35);
});
