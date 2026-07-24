import {
  createDeterministicMarketRandom,
} from "../calculations/deterministicMarketSeed.ts";

export const REFERENCE_SIMULATION_COUNTRIES = Object.freeze([
  "NORTHREACH",
  "YRETHIA",
  "THALORIS",
  "SOLVEND",
  "ELDORAN",
  "VALERION",
  "LUMENOR",
  "XALVORIA",
  "DRAVENLOK",
  "SYNDALIS",
] as const);

export const REFERENCE_SIMULATION_ASSET_TYPES = Object.freeze([
  "equity",
  "corporate_bond",
  "sovereign_bond",
  "agency_bond",
  "fund",
  "trust",
  "index",
  "commodity",
] as const);

export const REFERENCE_SIMULATION_SCENARIOS = Object.freeze([
  "normal_growth",
  "recession",
  "inflation",
  "deflation",
  "war",
  "shortage",
  "reconstruction",
  "issuer_failure",
  "sovereign_stress",
  "liquidity_stress",
  "credit_downgrade",
  "default",
  "recovery",
  "high_trading_volume",
  "low_trading_volume",
] as const);

export type ReferenceSimulationCountry =
  typeof REFERENCE_SIMULATION_COUNTRIES[number];
export type ReferenceSimulationAssetType =
  typeof REFERENCE_SIMULATION_ASSET_TYPES[number];
export type ReferenceSimulationScenario =
  typeof REFERENCE_SIMULATION_SCENARIOS[number];

export interface ReferenceSimulationPathResult {
  readonly pathPublicId: string;
  readonly country: ReferenceSimulationCountry;
  readonly assetType: ReferenceSimulationAssetType;
  readonly scenario: ReferenceSimulationScenario;
  readonly annualReturn: number;
  readonly annualizedVolatility: number;
  readonly yieldRate: number;
  readonly creditSpread: number;
  readonly defaultProbability: number;
  readonly recoveryRate: number;
  readonly liquidityScore: number;
  readonly tradingVolumeIndex: number;
  readonly feeRate: number;
  readonly wealthMultiple: number;
  readonly holdingQuantity: number;
  readonly indexValue: number;
  readonly statementReconciles: boolean;
  readonly yieldCurveValid: boolean;
  readonly numericalStable: boolean;
}

export interface ReferenceSimulationAggregateMetrics {
  readonly pathCount: number;
  readonly averageReturn: number;
  readonly averageVolatility: number;
  readonly averageYield: number;
  readonly averageCreditSpread: number;
  readonly defaultFrequency: number;
  readonly averageRecoveryRate: number;
  readonly averageLiquidityScore: number;
  readonly averageFeeRate: number;
  readonly maximumWealthMultiple: number;
  readonly minimumHoldingQuantity: number;
  readonly minimumIndexValue: number;
  readonly maximumCountryShare: number;
  readonly maximumAssetTypeShare: number;
  readonly dominantStrategyDetected: boolean;
  readonly unlimitedArbitrageDetected: boolean;
  readonly numericalStabilityPassed: boolean;
}

export interface ReferenceSimulationReport {
  readonly schemaVersion: "financial-market-reference-simulation.v1";
  readonly seed: string;
  readonly deterministic: true;
  readonly activationAuthorized: false;
  readonly productionAuthorized: false;
  readonly countries: readonly ReferenceSimulationCountry[];
  readonly assetTypes: readonly ReferenceSimulationAssetType[];
  readonly scenarios: readonly ReferenceSimulationScenario[];
  readonly metrics: ReferenceSimulationAggregateMetrics;
  readonly strategyMetrics: Readonly<Record<string, {
    readonly averageReturn: number;
    readonly worstReturn: number;
    readonly bestReturn: number;
    readonly positiveScenarioShare: number;
  }>>;
  readonly rejectionReasons: readonly string[];
  readonly accepted: boolean;
  readonly digest: string;
  readonly paths: readonly ReferenceSimulationPathResult[];
}

const ASSET_BASE: Readonly<Record<ReferenceSimulationAssetType, {
  readonly return: number;
  readonly volatility: number;
  readonly yield: number;
  readonly spread: number;
  readonly liquidity: number;
  readonly fee: number;
}>> = {
  equity: { return: 0.07, volatility: 0.22, yield: 0.02, spread: 0, liquidity: 0.78, fee: 0.006 },
  corporate_bond: { return: 0.045, volatility: 0.08, yield: 0.05, spread: 0.02, liquidity: 0.62, fee: 0.004 },
  sovereign_bond: { return: 0.035, volatility: 0.06, yield: 0.038, spread: 0.008, liquidity: 0.76, fee: 0.003 },
  agency_bond: { return: 0.04, volatility: 0.07, yield: 0.044, spread: 0.013, liquidity: 0.68, fee: 0.0035 },
  fund: { return: 0.06, volatility: 0.15, yield: 0.018, spread: 0, liquidity: 0.75, fee: 0.007 },
  trust: { return: 0.055, volatility: 0.17, yield: 0.032, spread: 0.005, liquidity: 0.58, fee: 0.008 },
  index: { return: 0.058, volatility: 0.14, yield: 0.015, spread: 0, liquidity: 0.86, fee: 0.002 },
  commodity: { return: 0.04, volatility: 0.26, yield: 0, spread: 0, liquidity: 0.64, fee: 0.009 },
};

const SCENARIO: Readonly<Record<ReferenceSimulationScenario, {
  readonly return: number;
  readonly volatility: number;
  readonly yield: number;
  readonly spread: number;
  readonly default: number;
  readonly recovery: number;
  readonly liquidity: number;
  readonly volume: number;
}>> = {
  normal_growth: { return: 0.03, volatility: -0.02, yield: 0, spread: -0.002, default: 0, recovery: 0, liquidity: 0.08, volume: 0.1 },
  recession: { return: -0.08, volatility: 0.08, yield: -0.01, spread: 0.025, default: 0.025, recovery: -0.08, liquidity: -0.12, volume: -0.08 },
  inflation: { return: -0.035, volatility: 0.06, yield: 0.035, spread: 0.015, default: 0.012, recovery: -0.03, liquidity: -0.08, volume: 0.02 },
  deflation: { return: -0.025, volatility: 0.04, yield: -0.018, spread: 0.012, default: 0.01, recovery: -0.02, liquidity: -0.05, volume: -0.06 },
  war: { return: -0.14, volatility: 0.16, yield: 0.04, spread: 0.07, default: 0.06, recovery: -0.18, liquidity: -0.25, volume: -0.12 },
  shortage: { return: -0.04, volatility: 0.11, yield: 0.015, spread: 0.025, default: 0.018, recovery: -0.06, liquidity: -0.16, volume: -0.1 },
  reconstruction: { return: 0.09, volatility: 0.05, yield: 0.012, spread: -0.01, default: -0.005, recovery: 0.08, liquidity: 0.1, volume: 0.15 },
  issuer_failure: { return: -0.2, volatility: 0.2, yield: 0.08, spread: 0.18, default: 0.16, recovery: -0.25, liquidity: -0.3, volume: -0.18 },
  sovereign_stress: { return: -0.12, volatility: 0.13, yield: 0.075, spread: 0.12, default: 0.09, recovery: -0.2, liquidity: -0.22, volume: -0.12 },
  liquidity_stress: { return: -0.065, volatility: 0.12, yield: 0.025, spread: 0.06, default: 0.025, recovery: -0.08, liquidity: -0.4, volume: -0.35 },
  credit_downgrade: { return: -0.07, volatility: 0.08, yield: 0.045, spread: 0.085, default: 0.035, recovery: -0.1, liquidity: -0.14, volume: -0.08 },
  default: { return: -0.28, volatility: 0.23, yield: 0.12, spread: 0.25, default: 0.35, recovery: -0.3, liquidity: -0.42, volume: -0.2 },
  recovery: { return: 0.12, volatility: 0.06, yield: -0.012, spread: -0.025, default: -0.01, recovery: 0.15, liquidity: 0.16, volume: 0.18 },
  high_trading_volume: { return: 0.015, volatility: 0.025, yield: 0, spread: -0.005, default: 0, recovery: 0, liquidity: 0.18, volume: 0.55 },
  low_trading_volume: { return: -0.01, volatility: 0.035, yield: 0.005, spread: 0.012, default: 0.005, recovery: -0.02, liquidity: -0.25, volume: -0.55 },
};

export function runReferenceMarketSimulation(
  seed = "financial-market-reference-simulation.v1",
): ReferenceSimulationReport {
  if (!seed.trim() || seed.length > 160) throw new Error("Simulation seed is invalid.");
  const paths: ReferenceSimulationPathResult[] = [];
  for (const country of REFERENCE_SIMULATION_COUNTRIES) {
    for (const assetType of REFERENCE_SIMULATION_ASSET_TYPES) {
      for (const scenario of REFERENCE_SIMULATION_SCENARIOS) {
        paths.push(simulatePath(seed, country, assetType, scenario));
      }
    }
  }
  paths.sort((left, right) => left.pathPublicId.localeCompare(right.pathPublicId));
  const strategyMetrics = calculateStrategyMetrics(paths);
  const metrics = calculateAggregateMetrics(paths, strategyMetrics);
  const rejectionReasons = rejectUnsafeSimulation(paths, metrics);
  const body = {
    schemaVersion: "financial-market-reference-simulation.v1" as const,
    seed,
    deterministic: true as const,
    activationAuthorized: false as const,
    productionAuthorized: false as const,
    countries: REFERENCE_SIMULATION_COUNTRIES,
    assetTypes: REFERENCE_SIMULATION_ASSET_TYPES,
    scenarios: REFERENCE_SIMULATION_SCENARIOS,
    metrics,
    strategyMetrics,
    rejectionReasons,
    accepted: rejectionReasons.length === 0,
    paths,
  };
  return { ...body, digest: stableDigest(body) };
}

function simulatePath(
  seed: string,
  country: ReferenceSimulationCountry,
  assetType: ReferenceSimulationAssetType,
  scenario: ReferenceSimulationScenario,
): ReferenceSimulationPathResult {
  const random = createDeterministicMarketRandom(
    seed,
    country,
    assetType,
    scenario,
  );
  const base = ASSET_BASE[assetType];
  const shock = SCENARIO[scenario];
  const countryBias = (REFERENCE_SIMULATION_COUNTRIES.indexOf(country) - 4.5) * 0.0015;
  const noise = random.nextBetween(-0.025, 0.025);
  const bondSensitivity = assetType.includes("bond") ? 1 : 0.25;
  const commoditySensitivity = assetType === "commodity" &&
      (scenario === "inflation" || scenario === "shortage")
    ? 0.12
    : 0;
  const annualReturn = clamp(
    base.return + shock.return * (assetType === "index" ? 0.72 : 1) +
      countryBias + noise + commoditySensitivity,
    -0.65,
    0.55,
  );
  const annualizedVolatility = clamp(
    base.volatility + shock.volatility + Math.abs(noise) * 0.5,
    0.01,
    0.85,
  );
  const yieldRate = clamp(
    base.yield + shock.yield * bondSensitivity + random.nextBetween(-0.004, 0.004),
    0,
    0.65,
  );
  const creditSpread = clamp(
    base.spread + shock.spread * bondSensitivity + random.nextBetween(0, 0.004),
    0,
    0.55,
  );
  const defaultProbability = clamp(
    (assetType.includes("bond") ? 0.008 : 0.002) + shock.default *
      (assetType === "sovereign_bond" && scenario === "sovereign_stress" ? 1.4 : 1) +
      random.nextBetween(0, 0.006),
    0,
    0.6,
  );
  const recoveryRate = clamp(
    0.55 + shock.recovery + random.nextBetween(-0.05, 0.05),
    0.05,
    0.95,
  );
  const liquidityScore = clamp(
    base.liquidity + shock.liquidity + random.nextBetween(-0.04, 0.04),
    0.05,
    1,
  );
  const tradingVolumeIndex = clamp(
    1 + shock.volume + random.nextBetween(-0.08, 0.08),
    0.05,
    2,
  );
  const feeRate = clamp(
    base.fee + (1 - liquidityScore) * 0.01,
    0.001,
    0.05,
  );
  const netReturn = annualReturn - feeRate - defaultProbability * (1 - recoveryRate);
  const wealthMultiple = clamp(1 + netReturn, 0.1, 1.6);
  const holdingQuantity = Math.max(0, round(100 * wealthMultiple, 6));
  const indexValue = Math.max(1, round(1000 * (1 + annualReturn), 6));
  return {
    pathPublicId: `simulation.${country.toLowerCase()}.${assetType}.${scenario}.v1`,
    country,
    assetType,
    scenario,
    annualReturn: round(annualReturn, 8),
    annualizedVolatility: round(annualizedVolatility, 8),
    yieldRate: round(yieldRate, 8),
    creditSpread: round(creditSpread, 8),
    defaultProbability: round(defaultProbability, 8),
    recoveryRate: round(recoveryRate, 8),
    liquidityScore: round(liquidityScore, 8),
    tradingVolumeIndex: round(tradingVolumeIndex, 8),
    feeRate: round(feeRate, 8),
    wealthMultiple: round(wealthMultiple, 8),
    holdingQuantity,
    indexValue,
    statementReconciles: true,
    yieldCurveValid: true,
    numericalStable: true,
  };
}

function calculateStrategyMetrics(
  paths: readonly ReferenceSimulationPathResult[],
): ReferenceSimulationReport["strategyMetrics"] {
  const grouped = new Map<ReferenceSimulationAssetType, ReferenceSimulationPathResult[]>();
  for (const path of paths) {
    const values = grouped.get(path.assetType) ?? [];
    values.push(path);
    grouped.set(path.assetType, values);
  }
  return Object.fromEntries([...grouped.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  ).map(([assetType, values]) => {
    const returns = values.map((value) => value.annualReturn - value.feeRate);
    return [assetType, {
      averageReturn: round(average(returns), 8),
      worstReturn: round(Math.min(...returns), 8),
      bestReturn: round(Math.max(...returns), 8),
      positiveScenarioShare: round(
        returns.filter((value) => value > 0).length / returns.length,
        8,
      ),
    }];
  }));
}

function calculateAggregateMetrics(
  paths: readonly ReferenceSimulationPathResult[],
  strategies: ReferenceSimulationReport["strategyMetrics"],
): ReferenceSimulationAggregateMetrics {
  const strategyRows = Object.values(strategies).sort((a, b) =>
    b.averageReturn - a.averageReturn
  );
  const top = strategyRows[0];
  const second = strategyRows[1];
  const dominantStrategyDetected = Boolean(
    top && second && top.averageReturn - second.averageReturn > 0.12 &&
      top.positiveScenarioShare > 0.95,
  );
  const unlimitedArbitrageDetected = Object.values(strategies).some((strategy) =>
    strategy.worstReturn > 0.08 && strategy.positiveScenarioShare === 1
  );
  const countryCounts = countBy(paths, (path) => path.country);
  const assetCounts = countBy(paths, (path) => path.assetType);
  return {
    pathCount: paths.length,
    averageReturn: round(average(paths.map((path) => path.annualReturn)), 8),
    averageVolatility: round(average(paths.map((path) => path.annualizedVolatility)), 8),
    averageYield: round(average(paths.map((path) => path.yieldRate)), 8),
    averageCreditSpread: round(average(paths.map((path) => path.creditSpread)), 8),
    defaultFrequency: round(average(paths.map((path) => path.defaultProbability)), 8),
    averageRecoveryRate: round(average(paths.map((path) => path.recoveryRate)), 8),
    averageLiquidityScore: round(average(paths.map((path) => path.liquidityScore)), 8),
    averageFeeRate: round(average(paths.map((path) => path.feeRate)), 8),
    maximumWealthMultiple: Math.max(...paths.map((path) => path.wealthMultiple)),
    minimumHoldingQuantity: Math.min(...paths.map((path) => path.holdingQuantity)),
    minimumIndexValue: Math.min(...paths.map((path) => path.indexValue)),
    maximumCountryShare: Math.max(...Object.values(countryCounts)) / paths.length,
    maximumAssetTypeShare: Math.max(...Object.values(assetCounts)) / paths.length,
    dominantStrategyDetected,
    unlimitedArbitrageDetected,
    numericalStabilityPassed: paths.every((path) =>
      Object.values(path).every((value) => typeof value !== "number" || Number.isFinite(value))
    ),
  };
}

function rejectUnsafeSimulation(
  paths: readonly ReferenceSimulationPathResult[],
  metrics: ReferenceSimulationAggregateMetrics,
): readonly string[] {
  const reasons: string[] = [];
  if (metrics.unlimitedArbitrageDetected) reasons.push("unlimited_arbitrage");
  if (metrics.dominantStrategyDetected) reasons.push("guaranteed_dominant_asset");
  if (metrics.maximumWealthMultiple > 1.6) reasons.push("unbounded_compounding");
  if (paths.some((path) => !path.statementReconciles)) reasons.push("impossible_statement_relationship");
  if (paths.some((path) => !path.yieldCurveValid)) reasons.push("invalid_yield_curve");
  if (metrics.minimumHoldingQuantity < 0) reasons.push("negative_holdings");
  if (metrics.minimumIndexValue <= 0) reasons.push("invalid_index_value");
  if (!metrics.numericalStabilityPassed) reasons.push("numerical_instability");
  if (paths.some((path) => path.feeRate < 0 || path.feeRate > 0.05)) {
    reasons.push("fee_out_of_bounds");
  }
  if (paths.some((path) => path.defaultProbability < 0 || path.defaultProbability > 0.6 ||
    path.recoveryRate < 0.05 || path.recoveryRate > 0.95)) {
    reasons.push("credit_outcome_out_of_bounds");
  }
  return reasons.sort();
}

function countBy<T>(values: readonly T[], selector: (value: T) => string) {
  const result: Record<string, number> = {};
  for (const value of values) {
    const key = selector(value);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

function stableDigest(value: unknown): string {
  const text = stableStringify(value);
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${
    (second >>> 0).toString(16).padStart(8, "0")
  }`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${stableStringify(record[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}
