import {
  addMarketDecimals,
  compareMarketDecimals,
  divideMarketDecimals,
  marketDecimalToNumber,
  multiplyMarketDecimals,
  subtractMarketDecimals,
} from "./decimalMath.ts";

export interface PortfolioPerformanceHolding {
  readonly instrumentPublicId: string;
  readonly issuerPublicId: string;
  readonly countryCode: string;
  readonly assetClass: string;
  readonly currentValue: string;
  readonly openCostBasis: string;
  readonly realizedProceeds: string;
  readonly realizedCost: string;
  readonly durationYears: number;
  readonly convexity: number;
  readonly liquidityScore: number;
}

export interface PortfolioValueObservation {
  readonly observedAt: string;
  readonly portfolioValue: string;
}

export interface PortfolioScenarioDefinition {
  readonly scenarioPublicId: string;
  readonly instrumentShocks: Readonly<Record<string, number>>;
  readonly issuerShocks: Readonly<Record<string, number>>;
  readonly countryShocks: Readonly<Record<string, number>>;
  readonly assetClassShocks: Readonly<Record<string, number>>;
}

export interface PortfolioPerformanceReport {
  readonly currentValue: string;
  readonly openCostBasis: string;
  readonly investedCapital: string;
  readonly realizedProfitLoss: string;
  readonly unrealizedProfitLoss: string;
  readonly totalProfitLoss: string;
  readonly totalReturnRatio: string;
  readonly issuerExposure: Readonly<Record<string, string>>;
  readonly countryExposure: Readonly<Record<string, string>>;
  readonly assetClassExposure: Readonly<Record<string, string>>;
  readonly weightedDurationYears: number;
  readonly weightedConvexity: number;
  readonly weightedLiquidityScore: number;
  readonly maximumDrawdownRatio: number;
  readonly historicalValueAtRisk95Ratio: number;
  readonly scenarioPublicId: string;
  readonly scenarioValue: string;
  readonly scenarioLoss: string;
  readonly scenarioLossRatio: string;
  readonly positionScenarioLosses: Readonly<Record<string, string>>;
  readonly deterministic: true;
}

export function calculatePortfolioPerformance(
  holdings: readonly PortfolioPerformanceHolding[],
  observations: readonly PortfolioValueObservation[],
  scenario: PortfolioScenarioDefinition,
): PortfolioPerformanceReport {
  if (holdings.length === 0) {
    throw new Error("portfolio_performance_holdings_required");
  }
  validateScenario(scenario);
  const ordered = [...holdings].sort((left, right) =>
    left.instrumentPublicId.localeCompare(right.instrumentPublicId)
  );
  const seen = new Set<string>();
  let currentValue = "0";
  let openCostBasis = "0";
  let realizedProceeds = "0";
  let realizedCost = "0";
  const issuerExposure: Record<string, string> = {};
  const countryExposure: Record<string, string> = {};
  const assetClassExposure: Record<string, string> = {};
  for (const holding of ordered) {
    validateHolding(holding);
    if (seen.has(holding.instrumentPublicId)) {
      throw new Error("duplicate_portfolio_performance_instrument");
    }
    seen.add(holding.instrumentPublicId);
    currentValue = addMarketDecimals(currentValue, holding.currentValue);
    openCostBasis = addMarketDecimals(openCostBasis, holding.openCostBasis);
    realizedProceeds = addMarketDecimals(
      realizedProceeds,
      holding.realizedProceeds,
    );
    realizedCost = addMarketDecimals(realizedCost, holding.realizedCost);
    accumulate(issuerExposure, holding.issuerPublicId, holding.currentValue);
    accumulate(countryExposure, holding.countryCode, holding.currentValue);
    accumulate(assetClassExposure, holding.assetClass, holding.currentValue);
  }
  if (compareMarketDecimals(currentValue, "0") <= 0) {
    throw new Error("portfolio_performance_current_value_must_be_positive");
  }
  const realizedProfitLoss = subtractMarketDecimals(
    realizedProceeds,
    realizedCost,
  );
  const unrealizedProfitLoss = subtractMarketDecimals(
    currentValue,
    openCostBasis,
  );
  const totalProfitLoss = addMarketDecimals(
    realizedProfitLoss,
    unrealizedProfitLoss,
  );
  const investedCapital = addMarketDecimals(openCostBasis, realizedCost);
  if (compareMarketDecimals(investedCapital, "0") <= 0) {
    throw new Error("portfolio_performance_invested_capital_must_be_positive");
  }

  let weightedDurationYears = 0;
  let weightedConvexity = 0;
  let weightedLiquidityScore = 0;
  for (const holding of ordered) {
    const weight = marketDecimalToNumber(divideMarketDecimals(
      holding.currentValue,
      currentValue,
    ));
    weightedDurationYears += weight * holding.durationYears;
    weightedConvexity += weight * holding.convexity;
    weightedLiquidityScore += weight * holding.liquidityScore;
  }

  const history = analyzeHistory(observations);
  const positionScenarioLosses: Record<string, string> = {};
  let scenarioValue = "0";
  for (const holding of ordered) {
    const shock = validatedShock(
      (scenario.instrumentShocks[holding.instrumentPublicId] ?? 0) +
        (scenario.issuerShocks[holding.issuerPublicId] ?? 0) +
        (scenario.countryShocks[holding.countryCode] ?? 0) +
        (scenario.assetClassShocks[holding.assetClass] ?? 0),
    );
    const stressed = multiplyMarketDecimals(
      holding.currentValue,
      Math.max(0, 1 + shock),
    );
    const loss = compareMarketDecimals(holding.currentValue, stressed) >= 0
      ? subtractMarketDecimals(holding.currentValue, stressed)
      : "0";
    scenarioValue = addMarketDecimals(scenarioValue, stressed);
    positionScenarioLosses[holding.instrumentPublicId] = loss;
  }
  const scenarioLoss = compareMarketDecimals(currentValue, scenarioValue) >= 0
    ? subtractMarketDecimals(currentValue, scenarioValue)
    : "0";

  return {
    currentValue,
    openCostBasis,
    investedCapital,
    realizedProfitLoss,
    unrealizedProfitLoss,
    totalProfitLoss,
    totalReturnRatio: divideMarketDecimals(totalProfitLoss, investedCapital),
    issuerExposure: sortRecord(issuerExposure),
    countryExposure: sortRecord(countryExposure),
    assetClassExposure: sortRecord(assetClassExposure),
    weightedDurationYears: round(weightedDurationYears),
    weightedConvexity: round(weightedConvexity),
    weightedLiquidityScore: round(weightedLiquidityScore),
    maximumDrawdownRatio: history.maximumDrawdownRatio,
    historicalValueAtRisk95Ratio: history.historicalValueAtRisk95Ratio,
    scenarioPublicId: scenario.scenarioPublicId,
    scenarioValue,
    scenarioLoss,
    scenarioLossRatio: divideMarketDecimals(scenarioLoss, currentValue),
    positionScenarioLosses: sortRecord(positionScenarioLosses),
    deterministic: true,
  };
}

function analyzeHistory(
  observations: readonly PortfolioValueObservation[],
): {
  readonly maximumDrawdownRatio: number;
  readonly historicalValueAtRisk95Ratio: number;
} {
  if (observations.length < 2) {
    throw new Error("portfolio_performance_history_requires_two_points");
  }
  const ordered = [...observations].sort((left, right) =>
    Date.parse(left.observedAt) - Date.parse(right.observedAt) ||
    left.observedAt.localeCompare(right.observedAt)
  );
  const timestamps = new Set<string>();
  let peak = 0;
  let maximumDrawdownRatio = 0;
  const losses: number[] = [];
  let previous = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const observation = ordered[index];
    assertIsoTime(observation.observedAt);
    if (timestamps.has(observation.observedAt)) {
      throw new Error("duplicate_portfolio_observation_time");
    }
    timestamps.add(observation.observedAt);
    const value = marketDecimalToNumber(observation.portfolioValue);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error("portfolio_observation_value_invalid");
    }
    peak = Math.max(peak, value);
    maximumDrawdownRatio = Math.max(
      maximumDrawdownRatio,
      peak === 0 ? 0 : (peak - value) / peak,
    );
    if (index > 0) {
      const periodicReturn = value / previous - 1;
      losses.push(Math.max(0, -periodicReturn));
    }
    previous = value;
  }
  const orderedLosses = losses.sort((left, right) => left - right);
  const index95 = Math.min(
    orderedLosses.length - 1,
    Math.ceil(0.95 * orderedLosses.length) - 1,
  );
  return {
    maximumDrawdownRatio: round(maximumDrawdownRatio),
    historicalValueAtRisk95Ratio: round(orderedLosses[index95] ?? 0),
  };
}

function validateHolding(holding: PortfolioPerformanceHolding): void {
  for (const value of [
    holding.instrumentPublicId,
    holding.issuerPublicId,
    holding.countryCode,
    holding.assetClass,
  ]) {
    if (!value.trim() || value.length > 180) {
      throw new Error("portfolio_performance_identity_invalid");
    }
  }
  for (const [field, value] of [
    ["current_value", holding.currentValue],
    ["open_cost_basis", holding.openCostBasis],
    ["realized_proceeds", holding.realizedProceeds],
    ["realized_cost", holding.realizedCost],
  ] as const) {
    if (compareMarketDecimals(value, "0") < 0) {
      throw new Error(`portfolio_performance_${field}_negative`);
    }
  }
  if (
    !Number.isFinite(holding.durationYears) ||
    holding.durationYears < 0 ||
    holding.durationYears > 100
  ) {
    throw new Error("portfolio_duration_invalid");
  }
  if (
    !Number.isFinite(holding.convexity) ||
    holding.convexity < 0 ||
    holding.convexity > 100_000
  ) {
    throw new Error("portfolio_convexity_invalid");
  }
  if (
    !Number.isFinite(holding.liquidityScore) ||
    holding.liquidityScore < 0 ||
    holding.liquidityScore > 1
  ) {
    throw new Error("portfolio_liquidity_invalid");
  }
}

function validateScenario(scenario: PortfolioScenarioDefinition): void {
  if (
    !scenario.scenarioPublicId.trim() ||
    scenario.scenarioPublicId.length > 180
  ) {
    throw new Error("portfolio_scenario_id_invalid");
  }
  for (const values of [
    scenario.instrumentShocks,
    scenario.issuerShocks,
    scenario.countryShocks,
    scenario.assetClassShocks,
  ]) {
    for (const [key, shock] of Object.entries(values)) {
      if (!key.trim() || key.length > 180) {
        throw new Error("portfolio_scenario_key_invalid");
      }
      validatedShock(shock);
    }
  }
}

function validatedShock(value: number): number {
  if (!Number.isFinite(value) || value < -1 || value > 5) {
    throw new Error("portfolio_scenario_shock_invalid");
  }
  return value;
}

function accumulate(
  target: Record<string, string>,
  key: string,
  value: string,
): void {
  target[key] = addMarketDecimals(target[key] ?? "0", value);
}

function sortRecord(
  values: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(values).sort(([left], [right]) =>
      left.localeCompare(right)
    ),
  );
}

function assertIsoTime(value: string): void {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new Error("portfolio_observation_time_invalid");
  }
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
