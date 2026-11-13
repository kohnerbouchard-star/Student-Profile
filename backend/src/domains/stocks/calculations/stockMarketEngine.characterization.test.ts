import {
  calculateMarketFactor, calculateNextStockMarketTick, resolveStockMarketEngineSettings,
  ECONOVARIA_COUNTRY_EXPOSURE_PROFILES, getCountryExposureProfile,
} from "./stockMarketEngine.ts";
import { characterizationInput, fingerprint, invalidCases, validCases } from "./stockMarketEngine.characterizationFixtures.ts";
import type { StockMarketEngineSettings } from "../contracts/stockMarketEngineContracts.ts";

declare const Deno: { test(name: string, run: () => void): void };

// Captured from unchanged main c59ed0af before the extraction. Full ordered payload,
// including every component, row, history entry, explanation and rounding result.
const GOLDENS: Record<string, { fingerprint: string; prices: number[]; noise: number[] }> = {
  "mixed-inputs": {"fingerprint": "b5a870dbff4edda9", "prices": [35.1], "noise": [0.555834]},
  "bull": {"fingerprint": "9685b18eb2c0fb49", "prices": [35.06], "noise": [0.752011]},
  "bear": {"fingerprint": "57274d0e0b76a7e1", "prices": [35.06], "noise": [0.752011]},
  "crisis": {"fingerprint": "c444e14d3b564cb0", "prices": [34.74], "noise": [0.752011]},
  "recovery": {"fingerprint": "2b72c6f748fa04e1", "prices": [35.06], "noise": [0.752011]},
  "sector_rotation": {"fingerprint": "09353b21f8c781a6", "prices": [35.22], "noise": [0.752011]},
  "sideways": {"fingerprint": "634cab29f2b5b77c", "prices": [35.22], "noise": [0.752011]},
  "shock-time-0": {"fingerprint": "b30f12819090bb07", "prices": [35.17], "noise": [-0.484502]},
  "shock-time-1": {"fingerprint": "d81bd9653309772c", "prices": [34.77], "noise": [-1.920599]},
  "shock-time-2": {"fingerprint": "b8e01fd30c43d18c", "prices": [38.44], "noise": [2.837376]},
  "shock-time-4": {"fingerprint": "f3de89e865f9e96c", "prices": [35.15], "noise": [-0.205928]},
  "shock-time-5": {"fingerprint": "7e0e07a76a7cb95d", "prices": [34.66], "noise": [-2.284552]},
  "seed-a": {"fingerprint": "dd63370868148235", "prices": [35.4], "noise": [1.606649]},
  "seed-b": {"fingerprint": "03aca701d9ee236e", "prices": [34.88], "noise": [-0.231821]},
  "seed-seed\u001fwith-separator": {"fingerprint": "8e2dfaeed2c3a928", "prices": [35.42], "noise": [1.661566]},
  "seed-日本語 seed": {"fingerprint": "f8a713f908aa2b4a", "prices": [34.73], "noise": [-0.750227]},
  "minimal": {"fingerprint": "205d0661c13d9636", "prices": [1.08], "noise": [7.8]},
  "price-floor": {"fingerprint": "fda750dbd1d7be41", "prices": [0.01], "noise": [0.555834]},
  "shares-capitalization": {"fingerprint": "3a2302edf9e97db7", "prices": [35.45], "noise": [0.44742]},
  "no-history-or-fundamentals": {"fingerprint": "0f95e49ef37023d7", "prices": [35.65], "noise": [0.555834]},
  "ordered-assets": {"fingerprint": "c8fccee922128fa2", "prices": [35.1, 35.03, 35.1, 34.79], "noise": [0.555834, -0.359686, 0.555834, -1.202595]},
  "reordered-shocks": {"fingerprint": "9fa774cdfb09da84", "prices": [35.1], "noise": [0.555834]},
};
const ERRORS: Record<string, { name: string; message: string }> = {
  "root-order": {"name": "Error", "message": "gameSessionId must be a non-empty string."},
  "seed-order": {"name": "Error", "message": "seed must be a non-empty string."},
  "tick-order": {"name": "Error", "message": "tickIndex must be an integer greater than or equal to 0."},
  "empty-assets": {"name": "Error", "message": "Stock market engine requires at least one asset."},
  "macro-scope-before-assets": {"name": "Error", "message": "gameSessionId mismatch: macro has other, expected synthetic-engine-session."},
  "macro-finite-before-assets": {"name": "Error", "message": "macro.interestRate must be a finite number."},
  "asset-scope": {"name": "Error", "message": "gameSessionId mismatch: asset has other, expected synthetic-engine-session."},
  "asset-id": {"name": "Error", "message": "asset.assetId must be a non-empty string."},
  "asset-ticker": {"name": "Error", "message": "asset.ticker must be a non-empty string."},
  "asset-name": {"name": "Error", "message": "asset.companyName must be a non-empty string."},
  "asset-sector": {"name": "Error", "message": "asset.sector must be a non-empty string."},
  "asset-country": {"name": "Error", "message": "asset.countryCode must be one of the official Econovaria countries: NORTHREACH, YRETHIA, THALORIS, SOLVEND, ELDORAN, VALERION, LUMENOR, SYNDALIS, XALVORIA, DRAVENLOK."},
  "asset-price": {"name": "Error", "message": "asset.currentPrice must be greater than 0."},
  "asset-previousClose": {"name": "Error", "message": "asset.previousClose must be greater than 0."},
  "asset-beta": {"name": "Error", "message": "asset.beta must be greater than or equal to 0."},
  "asset-liquidity": {"name": "Error", "message": "asset.liquidity must be a finite number."},
  "asset-volatility": {"name": "Error", "message": "asset.currentVolatility must be greater than 0."},
  "asset-longRun": {"name": "Error", "message": "asset.longRunVolatility must be a finite number."},
  "asset-anchor": {"name": "Error", "message": "asset.fairValueAnchor must be greater than 0."},
  "asset-returns": {"name": "Error", "message": "asset.recentReturns[] must be a finite number."},
  "asset-historyScope": {"name": "Error", "message": "gameSessionId mismatch: asset.history[] has other, expected synthetic-engine-session."},
  "asset-historyTick": {"name": "Error", "message": "asset.history[].tickIndex must be an integer greater than or equal to 0."},
  "asset-fundamentals": {"name": "Error", "message": "fundamentals.debtLevel must be a finite number."},
  "asset-exposureKey": {"name": "Error", "message": "asset.countryExposure key must be a non-empty string."},
  "asset-exposureValue": {"name": "Error", "message": "asset.sectorExposure.A must be a finite number."},
  "country-scope": {"name": "Error", "message": "gameSessionId mismatch: country has other, expected synthetic-engine-session."},
  "country-code": {"name": "Error", "message": "country.countryCode must be one of the official Econovaria countries: NORTHREACH, YRETHIA, THALORIS, SOLVEND, ELDORAN, VALERION, LUMENOR, SYNDALIS, XALVORIA, DRAVENLOK."},
  "country-finite": {"name": "Error", "message": "country.inflationRate must be a finite number."},
  "sector-scope": {"name": "Error", "message": "gameSessionId mismatch: sector has other, expected synthetic-engine-session."},
  "sector-positive": {"name": "Error", "message": "sector.newsSensitivity must be greater than 0."},
  "shock-scope": {"name": "Error", "message": "gameSessionId mismatch: shock has other, expected synthetic-engine-session."},
  "shock-expiry": {"name": "Error", "message": "shock.expiresTick must be an integer greater than or equal to 2."},
  "shock-country": {"name": "Error", "message": "shock.targetKey must be one of the official Econovaria countries: NORTHREACH, YRETHIA, THALORIS, SOLVEND, ELDORAN, VALERION, LUMENOR, SYNDALIS, XALVORIA, DRAVENLOK."},
};

for (const [name, input] of validCases()) {
  Deno.test(`engine extraction preserves complete baseline result: ${name}`, () => {
    const before = fingerprint(input);
    deepFreeze(input);
    const result = calculateNextStockMarketTick(input);
    equal({ fingerprint: fingerprint(result), prices: result.ticks.map(tick => tick.price),
      noise: result.explanations.map(explanation => explanation.components.volatilityNoisePct) }, GOLDENS[name]);
    equal(fingerprint(input), before);
    result.ticks.forEach((tick, index) => {
      if (tick.explanation !== result.explanations[index]) throw new Error("Explanation identity changed");
    });
  });
}

for (const [name, input] of invalidCases()) {
  Deno.test(`engine extraction preserves first error: ${name}`, () => {
    equal(thrown(() => calculateNextStockMarketTick(input)), ERRORS[name]);
  });
}

Deno.test("engine extraction preserves settings API merge, validation and isolation", () => {
  const defaults = resolveStockMarketEngineSettings("settings-only");
  equal(defaults, {
    gameSessionId: "settings-only", minPrice: 0.01, maxTickMovePct: 12,
    volatilityMeanReversionRate: 0.18, minVolatility: 0.002, maxVolatility: 0.18,
    defaultLongRunVolatility: 0.025, liquidityDampingStrength: 0.35,
    momentumStrength: 0.18, meanReversionStrength: 0.08, baseVolume: 10000, maxHistoryPoints: 30,
  });
  equal(resolveStockMarketEngineSettings("settings-only", { gameSessionId: "settings-only", minPrice: 0.02 } as StockMarketEngineSettings), { ...defaults, minPrice: 0.02 });
  equal(thrown(() => resolveStockMarketEngineSettings("settings-only", { ...defaults, gameSessionId: "other", minPrice: 0 })), {
    name: "Error", message: "gameSessionId mismatch: settings has other, expected settings-only.",
  });
  for (const [patch, message] of [
    [{ minPrice: 0, maxTickMovePct: 0 }, "settings.minPrice must be greater than 0."],
    [{ minVolatility: 1, maxVolatility: 0.1 }, "settings.minVolatility must be less than or equal to settings.maxVolatility."],
    [{ maxHistoryPoints: 0 }, "settings.maxHistoryPoints must be an integer greater than or equal to 1."],
    [{ baseVolume: NaN }, "settings.baseVolume must be a finite number."],
  ] as const) {
    equal(thrown(() => resolveStockMarketEngineSettings("settings-only", { ...defaults, ...patch })), { name: "Error", message });
  }
  if (resolveStockMarketEngineSettings("settings-only") === defaults) throw new Error("Settings alias changed");
});

Deno.test("engine extraction retains public macro factor and country profile identities", () => {
  equal(calculateMarketFactor({ gameSessionId: "macro-only" }), 0);
  equal(thrown(() => calculateMarketFactor({ gameSessionId: "macro-only", gdpGrowthRate: NaN })), {
    name: "Error", message: "Cannot round a non-finite number.",
  });
  for (const profile of Object.values(ECONOVARIA_COUNTRY_EXPOSURE_PROFILES)) {
    if (getCountryExposureProfile(profile.countryCode) !== profile) throw new Error("Profile identity changed");
  }
});

Deno.test("engine extraction keeps asset-local randomness independent of iteration order", () => {
  const input = validCases().find(([name]) => name === "ordered-assets")![1];
  const original = calculateNextStockMarketTick(input);
  const reverse = calculateNextStockMarketTick({ ...input, assets: [...input.assets].reverse() });
  equal(reverse.ticks, [...original.ticks].reverse());
  equal(reverse.rows, [...original.rows].reverse());
});

Deno.test("engine extraction preserves complete carried-forward 30-tick simulation", () => {
  let input = characterizationInput();
  const results = [];
  for (let tickIndex = 0; tickIndex < 30; tickIndex++) {
    const result = calculateNextStockMarketTick({ ...input, tickIndex });
    results.push(result);
    input = { ...input, assets: input.assets.map((asset, index) => ({ ...asset,
      currentPrice: result.ticks[index].price, currentVolatility: result.ticks[index].currentVolatility,
      history: result.rows[index].history, recentReturns: [...asset.recentReturns!, result.ticks[index].changePct],
    })) };
  }
  equal(fingerprint(results), "dbb54a1c9f23ee2d");
});

function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function thrown(run: () => unknown): { name: string; message: string } {
  try { run(); } catch (error) {
    if (error instanceof Error) return { name: error.name, message: error.message };
    throw error;
  }
  throw new Error("Expected an error");
}
function deepFreeze(value: unknown): void {
  if (value && typeof value === "object") {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
}
