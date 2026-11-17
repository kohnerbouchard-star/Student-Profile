import type { StockMarketEngineInput, StockMarketRegimeKind } from "../contracts/stockMarketEngineContracts.ts";

export function characterizationInput(): StockMarketEngineInput {
  return {
    gameSessionId: "synthetic-engine-session", seed: "characterization-seed", tickIndex: 3,
    macro: {
      gameSessionId: "synthetic-engine-session", gdpGrowthRate: 0.023, inflationRate: 4.5,
      unemploymentRate: 0.07, interestRate: 1, consumerConfidenceIndex: 0.65,
      businessConfidenceIndex: 71, marketRiskIndex: 0.4, politicalStabilityIndex: 80,
      infrastructureIndex: 0.78, energySecurityIndex: 20, globalDemandIndex: 0.9,
    },
    assets: [{
      gameSessionId: "synthetic-engine-session", assetId: "synthetic-asset", ticker: "SYN",
      companyName: "Synthetic Company", sector: "technology", countryCode: " northreach ",
      currentPrice: 37.035, previousClose: 36.995, openPrice: 37.015,
      dayHigh: 38.005, dayLow: 36.005, marketCap: 987654.321, sharesOutstanding: 1234,
      beta: 1.23456, liquidity: 0.55, currentVolatility: 0.045, longRunVolatility: 0.028,
      fairValueAnchor: 40.005, recentReturns: [0.7, -0.2, 1, -1, 1.01, -1.01],
      countryExposure: { YRETHIA: -0.3, " yrethia ": 0.9 },
      sectorExposure: { " Rare Minerals ": -0.6, RARE_MINERALS: 0.8 },
      fundamentals: {
        revenueGrowth: 0.04, profitMargin: 12, debtLevel: 0.65, cashReserves: 70,
        innovationScore: 0.8, supplyChainRisk: 30, politicalExposure: 0.7, commodityExposure: 45,
      },
      history: [2, 1, 2].map((tickIndex) => ({
        gameSessionId: "synthetic-engine-session", tickIndex, timestamp: `tick-${tickIndex}`,
        label: `old-${tickIndex}`, price: 37 + tickIndex, volume: 100 + tickIndex,
      })),
    }],
    countries: [{ gameSessionId: "synthetic-engine-session", countryCode: "NORTHREACH", gdpGrowthRate: 0.04 },
      { gameSessionId: "synthetic-engine-session", countryCode: " northreach ", gdpGrowthRate: -0.015, supplyConstraintIndex: 0.7 }],
    sectors: [{ gameSessionId: "synthetic-engine-session", sectorKey: "TECHNOLOGY", driftBias: 3 },
      { gameSessionId: "synthetic-engine-session", sectorKey: " technology ", driftBias: -0.05,
        volatilityMultiplier: 1.2, newsSensitivity: 0.8, volumeMultiplier: 1.1, demandIndex: 0.6 }],
    shocks: ["global", "ticker", "country", "sector"].map((scope, i) => ({
      gameSessionId: "synthetic-engine-session", shockId: `shock-${i}`,
      scope: scope as "global" | "ticker" | "country" | "sector",
      targetKey: [undefined, " syn ", " yrethia ", "rare minerals"][i],
      magnitude: [0.01, -1.01, 1, -0.3][i], decay: [0.2, 0, 1, 0.9][i], confidence: 0.8,
      volatilityImpact: i, volumeImpact: i * 2, headline: `Synthetic shock ${i}`,
      explanation: "Synthetic characterization only", createdTick: 2, expiresTick: 4,
    })),
  };
}

export function validCases(): [string, StockMarketEngineInput][] {
  const base = characterizationInput();
  const cases: [string, StockMarketEngineInput][] = [["mixed-inputs", base]];
  const regimes: StockMarketRegimeKind[] = ["bull", "bear", "crisis", "recovery", "sector_rotation", "sideways"];
  for (const regime of regimes) cases.push([regime, { ...base, regime: {
    gameSessionId: base.gameSessionId, regime, driftBias: 0.1234567, volatilityMultiplier: 1.15,
    newsSensitivity: 0.85, volumeMultiplier: 1.25,
    sectorRotation: { " technology ": 0.7, TECHNOLOGY: -0.1 },
  } }]);
  for (const tickIndex of [0, 1, 2, 4, 5]) cases.push([`shock-time-${tickIndex}`, { ...base, tickIndex }]);
  for (const seed of ["a", "b", "seed\u001fwith-separator", "日本語 seed"]) cases.push([`seed-${seed}`, { ...base, seed }]);
  const asset = base.assets[0];
  cases.push(["minimal", { gameSessionId: base.gameSessionId, seed: "minimal", tickIndex: 0,
    macro: { gameSessionId: base.gameSessionId }, assets: [{
      gameSessionId: base.gameSessionId, assetId: "minimal", ticker: "MIN", companyName: "Minimal",
      sector: "unknown", countryCode: "YRETHIA", currentPrice: 1, beta: 0,
      liquidity: -1, currentVolatility: 1, longRunVolatility: 1,
    }] }]);
  cases.push(["price-floor", { ...base, assets: [{ ...asset, currentPrice: 0.001, marketCap: undefined,
    sharesOutstanding: undefined, fairValueAnchor: undefined }] }]);
  cases.push(["shares-capitalization", { ...base, assets: [{ ...asset, marketCap: undefined, liquidity: 2,
    currentVolatility: 4.5, longRunVolatility: 2.8 }] }]);
  cases.push(["no-history-or-fundamentals", { ...base, assets: [{ ...asset, history: undefined,
    recentReturns: undefined, fundamentals: undefined, countryExposure: undefined, sectorExposure: undefined }] }]);
  cases.push(["ordered-assets", { ...base, assets: [asset, { ...asset, assetId: "second", ticker: "SECOND" }, asset, { ...asset, assetId: "third", ticker: "THIRD" }] }]);
  cases.push(["reordered-shocks", { ...base, shocks: [...base.shocks!].reverse() }]);
  return cases;
}

// Full ordered JSON fingerprint. Not used for security, identities, or engine calculations.
export function fingerprint(value: unknown): string {
  let hash = 0xcbf29ce484222325n;
  for (const char of JSON.stringify(value)) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(char.codePointAt(0)!)) * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function invalidCases(): [string, StockMarketEngineInput][] {
  const base = characterizationInput();
  const asset = base.assets[0];
  const cases: [string, StockMarketEngineInput][] = [
    ["root-order", { ...base, gameSessionId: "", seed: "", assets: [] }],
    ["seed-order", { ...base, seed: "", assets: [] }],
    ["tick-order", { ...base, tickIndex: -1, assets: [] }],
    ["empty-assets", { ...base, assets: [] }],
    ["macro-scope-before-assets", { ...base, macro: { gameSessionId: "other" }, assets: [{ ...asset, ticker: "" }] }],
    ["macro-finite-before-assets", { ...base, macro: { ...base.macro, interestRate: NaN }, assets: [{ ...asset, ticker: "" }] }],
  ];
  for (const [label, patch] of Object.entries({
    scope: { gameSessionId: "other" }, id: { assetId: "" }, ticker: { ticker: "" },
    name: { companyName: "" }, sector: { sector: "" }, country: { countryCode: "UNKNOWN" },
    price: { currentPrice: 0 }, previousClose: { previousClose: -1 }, beta: { beta: -1 },
    liquidity: { liquidity: Infinity }, volatility: { currentVolatility: 0 },
    longRun: { longRunVolatility: NaN }, anchor: { fairValueAnchor: -1 },
    returns: { recentReturns: [0.2, NaN, 0.4, 0.1, 0.2, 0.1, 0.1] },
    historyScope: { history: [{ ...asset.history![0], gameSessionId: "other" }] },
    historyTick: { history: [{ ...asset.history![0], tickIndex: 0.1 }] },
    fundamentals: { fundamentals: { ...asset.fundamentals!, debtLevel: NaN } },
    exposureKey: { countryExposure: { " ": 0.1 } }, exposureValue: { sectorExposure: { A: Infinity } },
  })) cases.push([`asset-${label}`, { ...base, assets: [{ ...asset, ...patch }] }]);
  cases.push(["country-scope", { ...base, countries: [{ ...base.countries![0], gameSessionId: "other" }] }]);
  cases.push(["country-code", { ...base, countries: [{ ...base.countries![0], countryCode: "BAD" }] }]);
  cases.push(["country-finite", { ...base, countries: [{ ...base.countries![0], inflationRate: NaN }] }]);
  cases.push(["sector-scope", { ...base, sectors: [{ ...base.sectors![0], gameSessionId: "other" }] }]);
  cases.push(["sector-positive", { ...base, sectors: [{ ...base.sectors![0], newsSensitivity: 0 }] }]);
  cases.push(["shock-scope", { ...base, shocks: [{ ...base.shocks![0], gameSessionId: "other" }] }]);
  cases.push(["shock-expiry", { ...base, shocks: [{ ...base.shocks![0], expiresTick: 1 }] }]);
  cases.push(["shock-country", { ...base, shocks: [{ ...base.shocks![0], scope: "country", targetKey: "BAD" }] }]);
  return cases;
}
