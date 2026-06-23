import type {
  StockMarketAssetInput,
  StockMarketChartPoint,
  StockMarketEngineInput,
  StockMarketEngineSettings,
  StockMarketMacroInput,
  StockMarketRegimeInput,
  StockMarketShockInput,
} from "../contracts/stockMarketEngineContracts.ts";
import {
  calculateNextStockMarketTick,
  getCountryExposureProfile,
  OFFICIAL_ECONOVARIA_COUNTRY_CODES,
  SUPPORTED_STOCK_MARKET_SECTOR_KEYS,
} from "./stockMarketEngine.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const SESSION_ID = "session-alpha";

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

function baseInput(
  overrides: Partial<StockMarketEngineInput> = {},
): StockMarketEngineInput {
  const gameSessionId = overrides.gameSessionId ?? SESSION_ID;
  return {
    gameSessionId,
    seed: "stock-engine-seed",
    tickIndex: 1,
    assets: [baseAsset({ gameSessionId })],
    macro: neutralMacro(gameSessionId),
    countries: [],
    sectors: [
      {
        gameSessionId,
        sectorKey: "TECHNOLOGY",
        driftBias: 0,
        volatilityMultiplier: 1,
        volumeMultiplier: 1,
        newsSensitivity: 1,
        demandIndex: 50,
        supplyConstraintIndex: 50,
      },
      {
        gameSessionId,
        sectorKey: "ENERGY",
        driftBias: 0,
        volatilityMultiplier: 1,
        volumeMultiplier: 1,
        newsSensitivity: 1,
        demandIndex: 50,
        supplyConstraintIndex: 50,
      },
    ],
    shocks: [],
    regime: regime({ gameSessionId }),
    ...overrides,
  };
}

function baseAsset(
  overrides: Partial<StockMarketAssetInput> = {},
): StockMarketAssetInput {
  return {
    gameSessionId: SESSION_ID,
    assetId: "asset-aurora-logic",
    ticker: "AURA",
    companyName: "Aurora Logic",
    sector: "TECHNOLOGY",
    countryCode: "SOLVEND",
    currentPrice: 100,
    previousClose: 100,
    openPrice: 100,
    dayHigh: 101,
    dayLow: 99,
    sharesOutstanding: 1_000_000,
    beta: 1,
    liquidity: 0.5,
    currentVolatility: 0.02,
    longRunVolatility: 0.025,
    fairValueAnchor: 100,
    recentReturns: [0.001, -0.002, 0.0015],
    ...overrides,
  };
}

function neutralMacro(gameSessionId = SESSION_ID): StockMarketMacroInput {
  return {
    gameSessionId,
    gdpGrowthRate: 0.02,
    inflationRate: 0.02,
    unemploymentRate: 0.05,
    interestRate: 0.03,
    consumerConfidenceIndex: 50,
    businessConfidenceIndex: 50,
    marketRiskIndex: 50,
    politicalStabilityIndex: 50,
    infrastructureIndex: 50,
    energySecurityIndex: 50,
    globalDemandIndex: 50,
  };
}

function bullishMacro(): StockMarketMacroInput {
  return {
    ...neutralMacro(),
    gdpGrowthRate: 0.05,
    inflationRate: 0.015,
    unemploymentRate: 0.035,
    interestRate: 0.015,
    consumerConfidenceIndex: 72,
    businessConfidenceIndex: 76,
    marketRiskIndex: 28,
    politicalStabilityIndex: 72,
    infrastructureIndex: 70,
    energySecurityIndex: 68,
    globalDemandIndex: 78,
  };
}

function stressedMacro(): StockMarketMacroInput {
  return {
    ...neutralMacro(),
    gdpGrowthRate: -0.03,
    inflationRate: 0.12,
    unemploymentRate: 0.14,
    interestRate: 0.15,
    consumerConfidenceIndex: 28,
    businessConfidenceIndex: 26,
    marketRiskIndex: 88,
    politicalStabilityIndex: 28,
    infrastructureIndex: 32,
    energySecurityIndex: 30,
    globalDemandIndex: 24,
  };
}

function settings(
  overrides: Partial<StockMarketEngineSettings> = {},
): StockMarketEngineSettings {
  return {
    gameSessionId: SESSION_ID,
    minPrice: 0.01,
    maxTickMovePct: 12,
    volatilityMeanReversionRate: 0.18,
    minVolatility: 0.002,
    maxVolatility: 0.18,
    defaultLongRunVolatility: 0.025,
    liquidityDampingStrength: 0.35,
    momentumStrength: 0.18,
    meanReversionStrength: 0.08,
    baseVolume: 10000,
    maxHistoryPoints: 30,
    ...overrides,
  };
}

function regime(
  overrides: Partial<StockMarketRegimeInput> = {},
): StockMarketRegimeInput {
  const regimeKind = overrides.regime ?? "sideways";
  const defaults = regimeDefaults(regimeKind);
  return {
    gameSessionId: SESSION_ID,
    regime: regimeKind,
    driftBias: defaults.driftBias,
    volatilityMultiplier: defaults.volatilityMultiplier,
    newsSensitivity: defaults.newsSensitivity,
    volumeMultiplier: defaults.volumeMultiplier,
    betaMultiplier: defaults.betaMultiplier,
    sectorRotation: {},
    studentLabel: `${regimeKind} test market`,
    ...overrides,
  };
}

function regimeDefaults(regimeKind: StockMarketRegimeInput["regime"]): {
  readonly driftBias: number;
  readonly volatilityMultiplier: number;
  readonly newsSensitivity: number;
  readonly volumeMultiplier: number;
  readonly betaMultiplier: number;
} {
  switch (regimeKind) {
    case "bull":
      return {
        driftBias: 0.4,
        volatilityMultiplier: 0.95,
        newsSensitivity: 1.05,
        volumeMultiplier: 1.1,
        betaMultiplier: 1.1,
      };
    case "bear":
      return {
        driftBias: -0.5,
        volatilityMultiplier: 1.25,
        newsSensitivity: 1.25,
        volumeMultiplier: 1.2,
        betaMultiplier: 1.1,
      };
    case "crisis":
      return {
        driftBias: -1.2,
        volatilityMultiplier: 2,
        newsSensitivity: 1.6,
        volumeMultiplier: 2,
        betaMultiplier: 1.3,
      };
    case "recovery":
      return {
        driftBias: 0.7,
        volatilityMultiplier: 1.2,
        newsSensitivity: 1.2,
        volumeMultiplier: 1.3,
        betaMultiplier: 1.1,
      };
    case "sector_rotation":
      return {
        driftBias: 0.1,
        volatilityMultiplier: 1.1,
        newsSensitivity: 1.25,
        volumeMultiplier: 1.2,
        betaMultiplier: 1,
      };
    case "sideways":
      return {
        driftBias: 0,
        volatilityMultiplier: 0.85,
        newsSensitivity: 1,
        volumeMultiplier: 0.9,
        betaMultiplier: 1,
      };
  }
}

function shock(
  overrides: Partial<StockMarketShockInput> = {},
): StockMarketShockInput {
  return {
    gameSessionId: SESSION_ID,
    shockId: "positive-shock",
    scope: "global",
    targetKey: undefined,
    magnitude: 0.06,
    decay: 0.2,
    confidence: 1,
    volatilityImpact: 0.02,
    volumeImpact: 0.5,
    headline: "Positive market shock",
    explanation: "A deterministic test shock moves the market.",
    createdTick: 1,
    expiresTick: 10,
    ...overrides,
  };
}

function assert(value: boolean, message = "Assertion failed."): asserts value {
  if (!value) {
    throw new Error(message);
  }
}

function assertEquals<T>(actual: T, expected: T, message?: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message ?? `Expected ${stringify(actual)} to equal ${stringify(expected)}.`);
  }
}

function assertNotEquals<T>(actual: T, expected: T, message?: string): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    throw new Error(message ?? `Expected ${stringify(actual)} not to equal ${stringify(expected)}.`);
  }
}

function assertAlmostEquals(
  actual: number,
  expected: number,
  tolerance: number,
): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(
      `Expected ${actual} to be within ${tolerance} of ${expected}.`,
    );
  }
}

function assertThrows(
  run: () => unknown,
  expectedMessagePart: string,
): void {
  try {
    run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(
      message.includes(expectedMessagePart),
      `Expected error message to include ${expectedMessagePart}, received ${message}.`,
    );
    return;
  }

  throw new Error("Expected function to throw.");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stringify(value: unknown): string {
  return JSON.stringify(value);
}
