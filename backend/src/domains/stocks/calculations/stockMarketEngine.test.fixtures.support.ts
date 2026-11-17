import type {
  StockMarketAssetInput,
  StockMarketEngineInput,
  StockMarketEngineSettings,
  StockMarketMacroInput,
  StockMarketRegimeInput,
  StockMarketShockInput,
} from "../contracts/stockMarketEngineContracts.ts";
import {
  ECONOVARIA_COUNTRY_EXPOSURE_PROFILES,
  OFFICIAL_ECONOVARIA_COUNTRY_CODES,
  SUPPORTED_STOCK_MARKET_SECTOR_KEYS,
} from "./stockMarketEngine.ts";

export const SESSION_ID = "session-alpha";

export function ref038Inputs(): StockMarketEngineInput[] {
  const sectors = [...new Set([
    ...SUPPORTED_STOCK_MARKET_SECTOR_KEYS,
    ...Object.values(ECONOVARIA_COUNTRY_EXPOSURE_PROFILES).flatMap(p => Object.keys(p.sectorWeights)),
    "UNREGISTERED_SECTOR",
  ])];
  const assets = sectors.map((sector, index) => baseAsset({
    assetId: `ref038-${index}`, ticker: `R${index}`, sector,
    countryCode: OFFICIAL_ECONOVARIA_COUNTRY_CODES[index % 10],
    countryExposure: { northreach: 0.3, solvEnd: 0.7 },
    sectorExposure: { "clean energy": 0.4, "technology": 0.6 },
  }));
  return (["bull", "bear", "crisis", "recovery", "sector_rotation", "sideways"] as const).map((kind, index) =>
    baseInput({ seed: `ref038-fixed-${index}`, tickIndex: index + 7, assets,
      macro: index % 2 ? stressedMacro() : bullishMacro(), regime: regime({ regime: kind }),
      shocks: [shock({ scope: "country", targetKey: "northreach", createdTick: 1, expiresTick: 20 })],
    })
  );
}

export async function ref038Digest(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
}

export function baseInput(
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

export function baseAsset(
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

export function neutralMacro(gameSessionId = SESSION_ID): StockMarketMacroInput {
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

export function bullishMacro(): StockMarketMacroInput {
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

export function stressedMacro(): StockMarketMacroInput {
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

export function settings(
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

export function regime(
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

export function regimeDefaults(regimeKind: StockMarketRegimeInput["regime"]): {
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

export function shock(
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

export function assert(value: boolean, message = "Assertion failed."): asserts value {
  if (!value) {
    throw new Error(message);
  }
}

export function assertEquals<T>(actual: T, expected: T, message?: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message ?? `Expected ${stringify(actual)} to equal ${stringify(expected)}.`);
  }
}

export function assertNotEquals<T>(actual: T, expected: T, message?: string): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    throw new Error(message ?? `Expected ${stringify(actual)} not to equal ${stringify(expected)}.`);
  }
}

export function assertAlmostEquals(
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

export function assertThrows(
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

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function stringify(value: unknown): string {
  return JSON.stringify(value);
}
