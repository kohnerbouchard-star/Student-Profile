// Engine input interpretation and validation. Preserve validation order and messages.
import type {
  StockMarketAssetInput, StockMarketCompanyFundamentalsInput, StockMarketCountryInput,
  StockMarketEngineInput, StockMarketEngineSettings, StockMarketMacroInput,
  StockMarketRegimeInput, StockMarketShockInput,
} from "../contracts/stockMarketEngineContracts.ts";
import { OFFICIAL_ECONOVARIA_COUNTRY_CODES, normalizeCountryCode } from "./countryExposureProfiles.ts";
import { clampNumber } from "./seededRandom.ts";

const OFFICIAL_COUNTRY_CODE_SET = new Set<string>(
  OFFICIAL_ECONOVARIA_COUNTRY_CODES,
);

const DEFAULT_STOCK_MARKET_ENGINE_SETTINGS_WITHOUT_SESSION: Omit<
  StockMarketEngineSettings,
  "gameSessionId"
> = {
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
};

export function resolveStockMarketEngineSettings(
  gameSessionId: string,
  settings?: StockMarketEngineSettings,
): StockMarketEngineSettings {
  if (settings) {
    assertGameSessionId(
      "settings",
      settings.gameSessionId,
      gameSessionId,
    );
  }

  const merged = {
    gameSessionId,
    ...DEFAULT_STOCK_MARKET_ENGINE_SETTINGS_WITHOUT_SESSION,
    ...(settings ?? {}),
  };

  validateSettings(merged);

  return {
    ...merged,
    gameSessionId,
  };
}

export function validateEngineInput(input: StockMarketEngineInput): void {
  assertNonEmptyString("gameSessionId", input.gameSessionId);
  assertNonEmptyString("seed", input.seed);
  assertIntegerAtLeast("tickIndex", input.tickIndex, 0);

  if (!Array.isArray(input.assets) || input.assets.length === 0) {
    throw new Error("Stock market engine requires at least one asset.");
  }

  assertGameSessionId("macro", input.macro.gameSessionId, input.gameSessionId);
  validateMacroInput(input.macro);

  for (const asset of input.assets) {
    validateAssetInput(asset, input.gameSessionId);
  }

  for (const country of input.countries ?? []) {
    assertGameSessionId("country", country.gameSessionId, input.gameSessionId);
    validateOfficialCountryCode(country.countryCode, "country.countryCode");
    validateCountryInput(country);
  }

  for (const sector of input.sectors ?? []) {
    assertGameSessionId("sector", sector.gameSessionId, input.gameSessionId);
    assertNonEmptyString("sector.sectorKey", sector.sectorKey);
    validateOptionalFinite("sector.driftBias", sector.driftBias);
    validateOptionalPositive("sector.volatilityMultiplier", sector.volatilityMultiplier);
    validateOptionalPositive("sector.volumeMultiplier", sector.volumeMultiplier);
    validateOptionalPositive("sector.newsSensitivity", sector.newsSensitivity);
    validateOptionalFinite("sector.demandIndex", sector.demandIndex);
    validateOptionalFinite("sector.supplyConstraintIndex", sector.supplyConstraintIndex);
  }

  for (const shock of input.shocks ?? []) {
    validateShockInput(shock, input.gameSessionId);
  }

  if (input.regime) {
    validateRegimeInput(input.regime, input.gameSessionId);
  }

  if (input.settings) {
    assertGameSessionId(
      "settings",
      input.settings.gameSessionId,
      input.gameSessionId,
    );
    validateSettings(input.settings);
  }
}

function validateAssetInput(
  asset: StockMarketAssetInput,
  expectedGameSessionId: string,
): void {
  assertGameSessionId("asset", asset.gameSessionId, expectedGameSessionId);
  assertNonEmptyString("asset.assetId", asset.assetId);
  assertNonEmptyString("asset.ticker", asset.ticker);
  assertNonEmptyString("asset.companyName", asset.companyName);
  assertNonEmptyString("asset.sector", asset.sector);
  validateOfficialCountryCode(asset.countryCode, "asset.countryCode");
  assertPositiveFiniteNumber("asset.currentPrice", asset.currentPrice);
  validateOptionalPositive("asset.previousClose", asset.previousClose);
  validateOptionalPositive("asset.openPrice", asset.openPrice);
  validateOptionalPositive("asset.dayHigh", asset.dayHigh);
  validateOptionalPositive("asset.dayLow", asset.dayLow);
  validateOptionalPositive("asset.sharesOutstanding", asset.sharesOutstanding);
  validateOptionalPositive("asset.marketCap", asset.marketCap);
  assertFiniteNumber("asset.beta", asset.beta);
  if (asset.beta < 0) {
    throw new Error("asset.beta must be greater than or equal to 0.");
  }
  assertFiniteNumber("asset.liquidity", asset.liquidity);
  assertPositiveFiniteNumber("asset.currentVolatility", asset.currentVolatility);
  assertPositiveFiniteNumber("asset.longRunVolatility", asset.longRunVolatility);
  validateOptionalPositive("asset.fairValueAnchor", asset.fairValueAnchor);

  for (const value of asset.recentReturns ?? []) {
    assertFiniteNumber("asset.recentReturns[]", value);
  }

  for (const point of asset.history ?? []) {
    assertIntegerAtLeast("asset.history[].tickIndex", point.tickIndex, 0);
    assertNonEmptyString("asset.history[].timestamp", point.timestamp);
    assertNonEmptyString("asset.history[].label", point.label);
    assertPositiveFiniteNumber("asset.history[].price", point.price);
    validateOptionalPositive("asset.history[].volume", point.volume);
    if (point.gameSessionId) {
      assertGameSessionId(
        "asset.history[]",
        point.gameSessionId,
        expectedGameSessionId,
      );
    }
  }

  validateFundamentals(asset.fundamentals);
  validateExposureRecord(asset.countryExposure, "asset.countryExposure");
  validateExposureRecord(asset.sectorExposure, "asset.sectorExposure");
  validateExposureRecord(asset.commodityExposure, "asset.commodityExposure");
}

function validateFundamentals(
  fundamentals: StockMarketCompanyFundamentalsInput | undefined,
): void {
  if (!fundamentals) {
    return;
  }

  assertFiniteNumber("fundamentals.revenueGrowth", fundamentals.revenueGrowth);
  assertFiniteNumber("fundamentals.profitMargin", fundamentals.profitMargin);
  assertFiniteNumber("fundamentals.debtLevel", fundamentals.debtLevel);
  assertFiniteNumber("fundamentals.cashReserves", fundamentals.cashReserves);
  assertFiniteNumber("fundamentals.innovationScore", fundamentals.innovationScore);
  assertFiniteNumber("fundamentals.supplyChainRisk", fundamentals.supplyChainRisk);
  assertFiniteNumber("fundamentals.politicalExposure", fundamentals.politicalExposure);
  assertFiniteNumber("fundamentals.commodityExposure", fundamentals.commodityExposure);
}

function validateMacroInput(macro: StockMarketMacroInput): void {
  validateOptionalFinite("macro.gdpGrowthRate", macro.gdpGrowthRate);
  validateOptionalFinite("macro.inflationRate", macro.inflationRate);
  validateOptionalFinite("macro.unemploymentRate", macro.unemploymentRate);
  validateOptionalFinite("macro.interestRate", macro.interestRate);
  validateOptionalFinite("macro.consumerConfidenceIndex", macro.consumerConfidenceIndex);
  validateOptionalFinite("macro.businessConfidenceIndex", macro.businessConfidenceIndex);
  validateOptionalFinite("macro.marketRiskIndex", macro.marketRiskIndex);
  validateOptionalFinite("macro.politicalStabilityIndex", macro.politicalStabilityIndex);
  validateOptionalFinite("macro.infrastructureIndex", macro.infrastructureIndex);
  validateOptionalFinite("macro.energySecurityIndex", macro.energySecurityIndex);
  validateOptionalFinite("macro.globalDemandIndex", macro.globalDemandIndex);
}

function validateCountryInput(country: StockMarketCountryInput): void {
  validateOptionalFinite("country.gdpGrowthRate", country.gdpGrowthRate);
  validateOptionalFinite("country.inflationRate", country.inflationRate);
  validateOptionalFinite("country.unemploymentRate", country.unemploymentRate);
  validateOptionalFinite("country.interestRate", country.interestRate);
  validateOptionalFinite("country.consumerConfidenceIndex", country.consumerConfidenceIndex);
  validateOptionalFinite("country.businessConfidenceIndex", country.businessConfidenceIndex);
  validateOptionalFinite("country.tradeBalanceIndex", country.tradeBalanceIndex);
  validateOptionalFinite("country.exportStrengthIndex", country.exportStrengthIndex);
  validateOptionalFinite("country.marketRiskIndex", country.marketRiskIndex);
  validateOptionalFinite("country.politicalStabilityIndex", country.politicalStabilityIndex);
  validateOptionalFinite("country.infrastructureIndex", country.infrastructureIndex);
  validateOptionalFinite("country.energySecurityIndex", country.energySecurityIndex);
  validateOptionalFinite("country.supplyConstraintIndex", country.supplyConstraintIndex);
  validateOptionalFinite("country.importDependencyIndex", country.importDependencyIndex);
}

function validateShockInput(
  shock: StockMarketShockInput,
  expectedGameSessionId: string,
): void {
  assertGameSessionId("shock", shock.gameSessionId, expectedGameSessionId);
  assertNonEmptyString("shock.shockId", shock.shockId);
  assertNonEmptyString("shock.headline", shock.headline);
  assertNonEmptyString("shock.explanation", shock.explanation);
  assertFiniteNumber("shock.magnitude", shock.magnitude);
  assertFiniteNumber("shock.decay", shock.decay);
  assertFiniteNumber("shock.confidence", shock.confidence);
  validateOptionalFinite("shock.volatilityImpact", shock.volatilityImpact);
  validateOptionalFinite("shock.volumeImpact", shock.volumeImpact);
  assertIntegerAtLeast("shock.createdTick", shock.createdTick, 0);
  validateOptionalIntegerAtLeast("shock.expiresTick", shock.expiresTick, shock.createdTick);

  if (
    shock.scope === "country" &&
    shock.targetKey !== undefined &&
    shock.targetKey.trim() !== ""
  ) {
    validateOfficialCountryCode(shock.targetKey, "shock.targetKey");
  }
}

function validateRegimeInput(
  regime: StockMarketRegimeInput,
  expectedGameSessionId: string,
): void {
  assertGameSessionId("regime", regime.gameSessionId, expectedGameSessionId);
  assertFiniteNumber("regime.driftBias", regime.driftBias);
  assertPositiveFiniteNumber("regime.volatilityMultiplier", regime.volatilityMultiplier);
  assertPositiveFiniteNumber("regime.newsSensitivity", regime.newsSensitivity);
  assertPositiveFiniteNumber("regime.volumeMultiplier", regime.volumeMultiplier);
  validateOptionalPositive("regime.betaMultiplier", regime.betaMultiplier);
  validateExposureRecord(regime.sectorRotation, "regime.sectorRotation");
}

function validateSettings(settings: StockMarketEngineSettings): void {
  assertPositiveFiniteNumber("settings.minPrice", settings.minPrice);
  assertPositiveFiniteNumber("settings.maxTickMovePct", settings.maxTickMovePct);
  assertPositiveFiniteNumber(
    "settings.volatilityMeanReversionRate",
    settings.volatilityMeanReversionRate,
  );
  assertPositiveFiniteNumber("settings.minVolatility", settings.minVolatility);
  assertPositiveFiniteNumber("settings.maxVolatility", settings.maxVolatility);
  assertPositiveFiniteNumber(
    "settings.defaultLongRunVolatility",
    settings.defaultLongRunVolatility,
  );
  assertFiniteNumber(
    "settings.liquidityDampingStrength",
    settings.liquidityDampingStrength,
  );
  assertFiniteNumber("settings.momentumStrength", settings.momentumStrength);
  assertFiniteNumber(
    "settings.meanReversionStrength",
    settings.meanReversionStrength,
  );
  assertPositiveFiniteNumber("settings.baseVolume", settings.baseVolume);
  assertIntegerAtLeast("settings.maxHistoryPoints", settings.maxHistoryPoints, 1);

  if (settings.minVolatility > settings.maxVolatility) {
    throw new Error("settings.minVolatility must be less than or equal to settings.maxVolatility.");
  }
}

function validateExposureRecord(
  record: Readonly<Record<string, number>> | undefined,
  label: string,
): void {
  if (!record) {
    return;
  }

  for (const [key, value] of Object.entries(record)) {
    assertNonEmptyString(`${label} key`, key);
    assertFiniteNumber(`${label}.${key}`, value);
  }
}

export function normalizeSectorKey(value: string): string {
  return value.trim().toUpperCase().replaceAll(/[^A-Z0-9]+/g, "_").replaceAll(
    /^_+|_+$/g,
    "",
  );
}

function validateOfficialCountryCode(value: string, label: string): void {
  const countryCode = normalizeCountryCode(value);
  if (!OFFICIAL_COUNTRY_CODE_SET.has(countryCode)) {
    throw new Error(
      `${label} must be one of the official Econovaria countries: ${
        OFFICIAL_ECONOVARIA_COUNTRY_CODES.join(", ")
      }.`,
    );
  }
}

function assertGameSessionId(
  label: string,
  actual: string,
  expected: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `gameSessionId mismatch: ${label} has ${actual}, expected ${expected}.`,
    );
  }
}

function assertNonEmptyString(label: string, value: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

export function assertFiniteNumber(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
}

function assertPositiveFiniteNumber(label: string, value: number): void {
  assertFiniteNumber(label, value);
  if (value <= 0) {
    throw new Error(`${label} must be greater than 0.`);
  }
}

function assertIntegerAtLeast(
  label: string,
  value: number,
  min: number,
): void {
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${label} must be an integer greater than or equal to ${min}.`);
  }
}

function validateOptionalFinite(label: string, value: number | undefined): void {
  if (value !== undefined) {
    assertFiniteNumber(label, value);
  }
}

function validateOptionalPositive(label: string, value: number | undefined): void {
  if (value !== undefined) {
    assertPositiveFiniteNumber(label, value);
  }
}

function validateOptionalIntegerAtLeast(
  label: string,
  value: number | undefined,
  min: number,
): void {
  if (value !== undefined) {
    assertIntegerAtLeast(label, value, min);
  }
}

export function percentRateToPct(value: number | undefined): number {
  if (value === undefined) {
    return 0;
  }

  return Math.abs(value) <= 1 ? value * 100 : value;
}

export function percentMagnitudeToPct(value: number): number {
  return Math.abs(value) <= 1 ? value * 100 : value;
}

export function indexDeviation(value: number | undefined): number {
  if (value === undefined) {
    return 0;
  }

  if (Math.abs(value) <= 1) {
    return clampNumber(value - 0.5, -1, 1);
  }

  return clampNumber((value - 50) / 50, -1, 1);
}

export function toUnitScale(value: number): number {
  return Math.abs(value) <= 1 ? value : value / 100;
}

export function normalizeVolatility(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return value > 1 ? value / 100 : value;
}

export function normalizeVolatilityImpact(value: number | undefined): number {
  if (value === undefined) {
    return 0;
  }

  return Math.abs(value) > 1 ? value / 100 : value;
}

export function normalizeVolumeImpact(value: number | undefined): number {
  if (value === undefined) {
    return 0;
  }

  return Math.abs(value) > 3 ? value / 100 : value;
}
