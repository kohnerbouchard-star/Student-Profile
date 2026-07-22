export const ECONOMIC_COHERENCE_SCENARIOS = [
  "price_discovery",
  "liquidity_drought",
  "rate_shock",
  "credit_deterioration",
  "issuer_default",
  "fund_redemption",
  "market_manipulation_attempt",
  "wash_trading",
  "circular_valuation",
  "reservation_abuse",
  "replay_abuse",
  "settlement_failure",
  "arbitrage_leakage",
] as const;

export type EconomicCoherenceScenarioKind =
  typeof ECONOMIC_COHERENCE_SCENARIOS[number];

export interface EconomicCoherenceInitialState {
  readonly priceIndex: number;
  readonly liquidityIndex: number;
  readonly creditQuality: number;
  readonly fundNavIndex: number;
  readonly fundCashBuffer: number;
  readonly reservationUtilization: number;
  readonly settlementReliability: number;
  readonly arbitrageGapRatio: number;
}

export interface EconomicCoherenceSimulationInput {
  readonly simulationPublicId: string;
  readonly seed: string;
  readonly stepsPerScenario: number;
  readonly initialState: EconomicCoherenceInitialState;
  readonly activationAuthorized: false;
  readonly marketplacePhysicalItemSettlementSupported: false;
}

export interface EconomicCoherenceScenarioResult {
  readonly scenario: EconomicCoherenceScenarioKind;
  readonly priceIndex: number;
  readonly liquidityIndex: number;
  readonly creditQuality: number;
  readonly fundNavIndex: number;
  readonly fundCashBuffer: number;
  readonly reservationUtilization: number;
  readonly settlementReliability: number;
  readonly arbitrageLeakageRatio: number;
  readonly manipulationAlerts: number;
  readonly washTradeAlerts: number;
  readonly circularValuationAlerts: number;
  readonly reservationRejections: number;
  readonly replayRejections: number;
  readonly settlementFailures: number;
  readonly coherenceBreaches: readonly string[];
  readonly operations: number;
  readonly deterministicDigest: string;
}

export interface EconomicCoherenceSimulationReport {
  readonly simulationPublicId: string;
  readonly seed: string;
  readonly scenarioCount: number;
  readonly totalOperations: number;
  readonly scenarios: readonly EconomicCoherenceScenarioResult[];
  readonly aggregateBreaches: readonly string[];
  readonly activationAuthorized: false;
  readonly marketplacePhysicalItemSettlementSupported: false;
  readonly deterministic: true;
  readonly deterministicDigest: string;
}

export function runEconomicCoherenceScenarioSimulation(
  input: EconomicCoherenceSimulationInput,
): EconomicCoherenceSimulationReport {
  validateInput(input);
  const scenarios = ECONOMIC_COHERENCE_SCENARIOS.map((scenario, index) =>
    simulateScenario(input, scenario, index)
  );
  const aggregateBreaches = [...new Set(
    scenarios.flatMap((scenario) => scenario.coherenceBreaches),
  )].sort();
  const totalOperations = scenarios.reduce(
    (sum, scenario) => sum + scenario.operations,
    0,
  );
  const deterministicDigest = stableHash([
    input.simulationPublicId,
    input.seed,
    input.stepsPerScenario,
    ...scenarios.map(canonicalScenario),
  ].join("\n"));
  return {
    simulationPublicId: input.simulationPublicId,
    seed: input.seed,
    scenarioCount: scenarios.length,
    totalOperations,
    scenarios,
    aggregateBreaches,
    activationAuthorized: false,
    marketplacePhysicalItemSettlementSupported: false,
    deterministic: true,
    deterministicDigest,
  };
}

function simulateScenario(
  input: EconomicCoherenceSimulationInput,
  scenario: EconomicCoherenceScenarioKind,
  scenarioIndex: number,
): EconomicCoherenceScenarioResult {
  const jitter = deterministicUnit(
    `${input.seed}|${scenario}|${scenarioIndex}`,
  );
  const intensity = 0.85 + jitter * 0.3;
  let priceIndex = input.initialState.priceIndex;
  let liquidityIndex = input.initialState.liquidityIndex;
  let creditQuality = input.initialState.creditQuality;
  let fundNavIndex = input.initialState.fundNavIndex;
  let fundCashBuffer = input.initialState.fundCashBuffer;
  let reservationUtilization = input.initialState.reservationUtilization;
  let settlementReliability = input.initialState.settlementReliability;
  let arbitrageLeakageRatio = input.initialState.arbitrageGapRatio;
  let manipulationAlerts = 0;
  let washTradeAlerts = 0;
  let circularValuationAlerts = 0;
  let reservationRejections = 0;
  let replayRejections = 0;
  let settlementFailures = 0;
  const coherenceBreaches: string[] = [];

  switch (scenario) {
    case "price_discovery":
      priceIndex *= 1 + (jitter - 0.5) * 0.04;
      liquidityIndex = clamp01(liquidityIndex + 0.03 * intensity);
      arbitrageLeakageRatio *= 0.45;
      break;
    case "liquidity_drought":
      liquidityIndex *= 0.2 / intensity;
      priceIndex *= 1 - 0.08 * intensity;
      coherenceBreaches.push("liquidity_drought_detected");
      break;
    case "rate_shock":
      priceIndex *= 1 - 0.12 * intensity;
      liquidityIndex *= 1 - 0.08 * intensity;
      coherenceBreaches.push("rate_shock_loss_detected");
      break;
    case "credit_deterioration":
      creditQuality *= 1 - 0.25 * intensity;
      priceIndex *= 1 - 0.1 * intensity;
      coherenceBreaches.push("credit_deterioration_detected");
      break;
    case "issuer_default":
      creditQuality = 0;
      priceIndex *= 0.35;
      settlementReliability *= 0.9;
      coherenceBreaches.push("issuer_default_detected");
      break;
    case "fund_redemption":
      fundCashBuffer *= 0.25;
      fundNavIndex *= 1 - 0.09 * intensity;
      liquidityIndex *= 1 - 0.18 * intensity;
      coherenceBreaches.push("fund_redemption_pressure_detected");
      break;
    case "market_manipulation_attempt":
      manipulationAlerts = Math.max(
        1,
        Math.floor(input.stepsPerScenario * 0.035 * intensity),
      );
      priceIndex *= 1 + 0.015 * intensity;
      coherenceBreaches.push("manipulation_attempt_rejected");
      break;
    case "wash_trading":
      washTradeAlerts = Math.max(
        1,
        Math.floor(input.stepsPerScenario * 0.05 * intensity),
      );
      liquidityIndex = clamp01(liquidityIndex - 0.02 * intensity);
      coherenceBreaches.push("wash_trading_detected");
      break;
    case "circular_valuation":
      circularValuationAlerts = Math.max(
        1,
        Math.floor(input.stepsPerScenario * 0.02 * intensity),
      );
      fundNavIndex *= 1 - 0.04 * intensity;
      coherenceBreaches.push("circular_valuation_detected");
      break;
    case "reservation_abuse":
      reservationUtilization = 1;
      reservationRejections = Math.max(
        1,
        Math.floor(input.stepsPerScenario * 0.12 * intensity),
      );
      coherenceBreaches.push("reservation_abuse_rate_limited");
      break;
    case "replay_abuse":
      replayRejections = Math.max(
        1,
        Math.floor(input.stepsPerScenario * 0.18 * intensity),
      );
      coherenceBreaches.push("replay_abuse_rejected");
      break;
    case "settlement_failure":
      settlementFailures = Math.max(
        1,
        Math.floor(input.stepsPerScenario * 0.04 * intensity),
      );
      settlementReliability *= 1 - 0.22 * intensity;
      coherenceBreaches.push("settlement_failure_detected");
      break;
    case "arbitrage_leakage":
      arbitrageLeakageRatio = Math.min(
        0.5,
        arbitrageLeakageRatio + 0.06 * intensity,
      );
      arbitrageLeakageRatio *= 0.25;
      coherenceBreaches.push("arbitrage_leakage_bounded");
      break;
  }

  priceIndex = round(Math.max(0.000001, priceIndex));
  liquidityIndex = round(clamp01(liquidityIndex));
  creditQuality = round(clamp01(creditQuality));
  fundNavIndex = round(Math.max(0, fundNavIndex));
  fundCashBuffer = round(clamp01(fundCashBuffer));
  reservationUtilization = round(clamp01(reservationUtilization));
  settlementReliability = round(clamp01(settlementReliability));
  arbitrageLeakageRatio = round(
    Math.max(0, Math.min(0.5, arbitrageLeakageRatio)),
  );
  const operations = input.stepsPerScenario * 17 + scenarioIndex * 3;
  const deterministicDigest = stableHash([
    scenario,
    priceIndex,
    liquidityIndex,
    creditQuality,
    fundNavIndex,
    fundCashBuffer,
    reservationUtilization,
    settlementReliability,
    arbitrageLeakageRatio,
    manipulationAlerts,
    washTradeAlerts,
    circularValuationAlerts,
    reservationRejections,
    replayRejections,
    settlementFailures,
    ...coherenceBreaches,
  ].join("|"));
  return {
    scenario,
    priceIndex,
    liquidityIndex,
    creditQuality,
    fundNavIndex,
    fundCashBuffer,
    reservationUtilization,
    settlementReliability,
    arbitrageLeakageRatio,
    manipulationAlerts,
    washTradeAlerts,
    circularValuationAlerts,
    reservationRejections,
    replayRejections,
    settlementFailures,
    coherenceBreaches: [...coherenceBreaches].sort(),
    operations,
    deterministicDigest,
  };
}

function validateInput(input: EconomicCoherenceSimulationInput): void {
  if (
    !input.simulationPublicId.trim() ||
    input.simulationPublicId.length > 180
  ) {
    throw new Error("economic_simulation_id_invalid");
  }
  if (!input.seed.trim() || input.seed.length > 180) {
    throw new Error("economic_simulation_seed_invalid");
  }
  if (
    !Number.isInteger(input.stepsPerScenario) ||
    input.stepsPerScenario < 10 ||
    input.stepsPerScenario > 10_000_000
  ) {
    throw new Error("economic_simulation_steps_invalid");
  }
  if (input.activationAuthorized !== false) {
    throw new Error("economic_simulation_activation_must_remain_disabled");
  }
  if (input.marketplacePhysicalItemSettlementSupported !== false) {
    throw new Error("economic_simulation_marketplace_coupling_forbidden");
  }
  const state = input.initialState;
  if (
    !Number.isFinite(state.priceIndex) ||
    state.priceIndex <= 0 ||
    !Number.isFinite(state.fundNavIndex) ||
    state.fundNavIndex <= 0
  ) {
    throw new Error("economic_simulation_price_or_nav_invalid");
  }
  for (const [name, value] of [
    ["liquidity", state.liquidityIndex],
    ["credit_quality", state.creditQuality],
    ["fund_cash_buffer", state.fundCashBuffer],
    ["reservation_utilization", state.reservationUtilization],
    ["settlement_reliability", state.settlementReliability],
  ] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`economic_simulation_${name}_invalid`);
    }
  }
  if (
    !Number.isFinite(state.arbitrageGapRatio) ||
    state.arbitrageGapRatio < 0 ||
    state.arbitrageGapRatio > 0.5
  ) {
    throw new Error("economic_simulation_arbitrage_gap_invalid");
  }
}

function canonicalScenario(
  result: EconomicCoherenceScenarioResult,
): string {
  return [
    result.scenario,
    result.priceIndex,
    result.liquidityIndex,
    result.creditQuality,
    result.fundNavIndex,
    result.fundCashBuffer,
    result.reservationUtilization,
    result.settlementReliability,
    result.arbitrageLeakageRatio,
    result.manipulationAlerts,
    result.washTradeAlerts,
    result.circularValuationAlerts,
    result.reservationRejections,
    result.replayRejections,
    result.settlementFailures,
    result.operations,
    ...result.coherenceBreaches,
  ].join("|");
}

function deterministicUnit(input: string): number {
  const hash = Number.parseInt(stableHash(input), 36);
  return (hash % 1_000_003) / 1_000_003;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}
