import type {
  FinancialMarketAssetClass,
  FinancialMarketCountryCode,
} from "../contracts/financialMarketContracts.ts";
import {
  addMarketDecimals,
  compareMarketDecimals,
  divideMarketDecimals,
  multiplyMarketDecimals,
  subtractMarketDecimals,
} from "./decimalMath.ts";

export interface PortfolioRiskHolding {
  readonly instrumentPublicId: string;
  readonly issuerPublicId: string;
  readonly countryCode: FinancialMarketCountryCode;
  readonly assetClass: FinancialMarketAssetClass;
  readonly quotationCurrencyCode: string;
  readonly currentValue: string;
  readonly annualizedVolatility: number;
  readonly liquidityScore: number;
}

export interface PortfolioRiskThresholds {
  readonly maximumSinglePositionWeight: number;
  readonly maximumIssuerWeight: number;
  readonly maximumCountryWeight: number;
  readonly maximumAssetClassWeight: number;
  readonly minimumLiquidityScore: number;
}

export interface PortfolioRiskReport {
  readonly totalValue: string;
  readonly positionCount: number;
  readonly topPositionWeight: number;
  readonly issuerHerfindahlIndex: number;
  readonly countryHerfindahlIndex: number;
  readonly assetClassHerfindahlIndex: number;
  readonly weightedVolatilityProxy: number;
  readonly weightedLiquidityScore: number;
  readonly issuerWeights: Readonly<Record<string, number>>;
  readonly countryWeights: Readonly<Record<string, number>>;
  readonly assetClassWeights: Readonly<Record<string, number>>;
  readonly currencyWeights: Readonly<Record<string, number>>;
  readonly warnings: readonly string[];
  readonly deterministic: true;
}

export interface PortfolioStressScenario {
  readonly scenarioPublicId: string;
  readonly assetClassShocks: Partial<Record<FinancialMarketAssetClass, number>>;
  readonly countryShocks: Partial<Record<FinancialMarketCountryCode, number>>;
  readonly issuerDefaultLossRates: Readonly<Record<string, number>>;
  readonly liquidityHaircuts: Partial<Record<FinancialMarketAssetClass, number>>;
}

export interface PortfolioStressResult {
  readonly scenarioPublicId: string;
  readonly startingValue: string;
  readonly stressedValue: string;
  readonly lossAmount: string;
  readonly lossRatio: string;
  readonly positionLosses: Readonly<Record<string, string>>;
  readonly deterministic: true;
}

export function calculatePortfolioRisk(
  holdings: readonly PortfolioRiskHolding[],
  thresholds: PortfolioRiskThresholds,
): PortfolioRiskReport {
  validateThresholds(thresholds);
  const ordered = [...holdings].sort((left, right) =>
    left.instrumentPublicId.localeCompare(right.instrumentPublicId)
  );
  if (ordered.length === 0) throw new Error("portfolio_holdings_required");

  let totalValue = "0";
  const seen = new Set<string>();
  for (const holding of ordered) {
    validateHolding(holding);
    if (seen.has(holding.instrumentPublicId)) {
      throw new Error("duplicate_portfolio_instrument");
    }
    seen.add(holding.instrumentPublicId);
    totalValue = addMarketDecimals(totalValue, holding.currentValue);
  }
  if (compareMarketDecimals(totalValue, "0") <= 0) {
    throw new Error("portfolio_total_value_must_be_positive");
  }

  const issuerWeights: Record<string, number> = {};
  const countryWeights: Record<string, number> = {};
  const assetClassWeights: Record<string, number> = {};
  const currencyWeights: Record<string, number> = {};
  let topPositionWeight = 0;
  let weightedVolatilityProxy = 0;
  let weightedLiquidityScore = 0;

  for (const holding of ordered) {
    const weight = Number(
      divideMarketDecimals(holding.currentValue, totalValue),
    );
    topPositionWeight = Math.max(topPositionWeight, weight);
    issuerWeights[holding.issuerPublicId] =
      (issuerWeights[holding.issuerPublicId] ?? 0) + weight;
    countryWeights[holding.countryCode] =
      (countryWeights[holding.countryCode] ?? 0) + weight;
    assetClassWeights[holding.assetClass] =
      (assetClassWeights[holding.assetClass] ?? 0) + weight;
    currencyWeights[holding.quotationCurrencyCode] =
      (currencyWeights[holding.quotationCurrencyCode] ?? 0) + weight;
    weightedVolatilityProxy += weight * holding.annualizedVolatility;
    weightedLiquidityScore += weight * holding.liquidityScore;
  }

  const warnings: string[] = [];
  if (topPositionWeight > thresholds.maximumSinglePositionWeight) {
    warnings.push("single_position_concentration_exceeded");
  }
  if (maximumWeight(issuerWeights) > thresholds.maximumIssuerWeight) {
    warnings.push("issuer_concentration_exceeded");
  }
  if (maximumWeight(countryWeights) > thresholds.maximumCountryWeight) {
    warnings.push("country_concentration_exceeded");
  }
  if (maximumWeight(assetClassWeights) > thresholds.maximumAssetClassWeight) {
    warnings.push("asset_class_concentration_exceeded");
  }
  if (weightedLiquidityScore < thresholds.minimumLiquidityScore) {
    warnings.push("portfolio_liquidity_below_threshold");
  }

  return {
    totalValue,
    positionCount: ordered.length,
    topPositionWeight: round(topPositionWeight),
    issuerHerfindahlIndex: round(herfindahl(issuerWeights)),
    countryHerfindahlIndex: round(herfindahl(countryWeights)),
    assetClassHerfindahlIndex: round(herfindahl(assetClassWeights)),
    weightedVolatilityProxy: round(weightedVolatilityProxy),
    weightedLiquidityScore: round(weightedLiquidityScore),
    issuerWeights: sortAndRound(issuerWeights),
    countryWeights: sortAndRound(countryWeights),
    assetClassWeights: sortAndRound(assetClassWeights),
    currencyWeights: sortAndRound(currencyWeights),
    warnings: [...new Set(warnings)].sort(),
    deterministic: true,
  };
}

export function stressPortfolio(
  holdings: readonly PortfolioRiskHolding[],
  scenario: PortfolioStressScenario,
): PortfolioStressResult {
  if (!scenario.scenarioPublicId.trim()) {
    throw new Error("scenario_public_id_invalid");
  }
  const ordered = [...holdings].sort((left, right) =>
    left.instrumentPublicId.localeCompare(right.instrumentPublicId)
  );
  if (ordered.length === 0) throw new Error("portfolio_holdings_required");

  let startingValue = "0";
  let stressedValue = "0";
  const positionLosses: Record<string, string> = {};
  for (const holding of ordered) {
    validateHolding(holding);
    const assetShock = validatedShock(
      scenario.assetClassShocks[holding.assetClass] ?? 0,
      "asset_class_shock_invalid",
    );
    const countryShock = validatedShock(
      scenario.countryShocks[holding.countryCode] ?? 0,
      "country_shock_invalid",
    );
    const defaultLoss = validatedUnitInterval(
      scenario.issuerDefaultLossRates[holding.issuerPublicId] ?? 0,
      "issuer_default_loss_invalid",
    );
    const liquidityHaircut = validatedUnitInterval(
      scenario.liquidityHaircuts[holding.assetClass] ?? 0,
      "liquidity_haircut_invalid",
    );

    startingValue = addMarketDecimals(startingValue, holding.currentValue);
    const multiplier = Math.max(
      0,
      (1 + assetShock) * (1 + countryShock) *
        (1 - defaultLoss) * (1 - liquidityHaircut),
    );
    const stressedPositionValue = multiplyMarketDecimals(
      holding.currentValue,
      multiplier,
    );
    const positionLoss = compareMarketDecimals(
        holding.currentValue,
        stressedPositionValue,
      ) >= 0
      ? subtractMarketDecimals(holding.currentValue, stressedPositionValue)
      : "0";
    stressedValue = addMarketDecimals(stressedValue, stressedPositionValue);
    positionLosses[holding.instrumentPublicId] = positionLoss;
  }

  const lossAmount = compareMarketDecimals(startingValue, stressedValue) >= 0
    ? subtractMarketDecimals(startingValue, stressedValue)
    : "0";
  return {
    scenarioPublicId: scenario.scenarioPublicId,
    startingValue,
    stressedValue,
    lossAmount,
    lossRatio: divideMarketDecimals(lossAmount, startingValue),
    positionLosses: Object.fromEntries(
      Object.entries(positionLosses).sort(([left], [right]) =>
        left.localeCompare(right)
      ),
    ),
    deterministic: true,
  };
}

function validateHolding(holding: PortfolioRiskHolding): void {
  for (const value of [holding.instrumentPublicId, holding.issuerPublicId]) {
    if (!value.trim() || value.length > 180) {
      throw new Error("portfolio_identity_invalid");
    }
  }
  if (!/^[A-Z]{3,16}$/.test(holding.quotationCurrencyCode)) {
    throw new Error("portfolio_currency_invalid");
  }
  if (compareMarketDecimals(holding.currentValue, "0") < 0) {
    throw new Error("portfolio_value_negative");
  }
  if (
    !Number.isFinite(holding.annualizedVolatility) ||
    holding.annualizedVolatility < 0 ||
    holding.annualizedVolatility > 5
  ) {
    throw new Error("portfolio_volatility_invalid");
  }
  validatedUnitInterval(holding.liquidityScore, "portfolio_liquidity_invalid");
}

function validateThresholds(thresholds: PortfolioRiskThresholds): void {
  validatedUnitInterval(
    thresholds.maximumSinglePositionWeight,
    "single_position_threshold_invalid",
  );
  validatedUnitInterval(
    thresholds.maximumIssuerWeight,
    "issuer_threshold_invalid",
  );
  validatedUnitInterval(
    thresholds.maximumCountryWeight,
    "country_threshold_invalid",
  );
  validatedUnitInterval(
    thresholds.maximumAssetClassWeight,
    "asset_class_threshold_invalid",
  );
  validatedUnitInterval(
    thresholds.minimumLiquidityScore,
    "liquidity_threshold_invalid",
  );
}

function validatedShock(value: number, errorCode: string): number {
  if (!Number.isFinite(value) || value < -1 || value > 5) {
    throw new Error(errorCode);
  }
  return value;
}

function validatedUnitInterval(value: number, errorCode: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(errorCode);
  }
  return value;
}

function maximumWeight(weights: Readonly<Record<string, number>>): number {
  return Math.max(0, ...Object.values(weights));
}

function herfindahl(weights: Readonly<Record<string, number>>): number {
  return Object.values(weights).reduce(
    (sum, weight) => sum + weight * weight,
    0,
  );
}

function sortAndRound(
  values: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    Object.entries(values)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, round(value)]),
  );
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
