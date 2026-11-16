import {
  type CountryEconomyProfile,
  ECONOMIC_PHASES,
  type EconomicBalanceFinding,
  type EconomicDomain,
  type EconomicPlayerState,
  type EconomicSimulationConfig,
  type EconomicSimulationPhaseResult,
  type EconomicSimulationReport,
  type PlayerStrategyProfile,
} from "./economicSimulationContracts.ts";
import { validateConfig } from "./economicSimulationValidation.ts";
import type {
  MutablePlayerState,
  PhaseModifiers,
} from "./economicSimulationState.ts";
import {
  boundedRound,
  createDeterministicRandom,
  emptyActionCounts,
  incrementAction,
  median,
  netWealthMinor,
  PHASE_MODIFIERS,
  requireValue,
  round,
  sortActionCounts,
  sum,
  toImmutablePlayer,
} from "./economicSimulationState.ts";
import { applyStrategicAction } from "./economicSimulationActions.ts";

export function runDeterministicEconomicSimulation(
  config: EconomicSimulationConfig,
): EconomicSimulationReport {
  validateConfig(config);
  const random = createDeterministicRandom(config.deterministicSeed);
  const countryByCode = new Map(
    config.countries.map((country) => [country.countryCode, country]),
  );
  const strategyById = new Map(
    config.strategies.map((strategy) => [strategy.strategyPublicId, strategy]),
  );
  const players = createPlayers(config);
  const phaseResults: EconomicSimulationPhaseResult[] = [];

  for (const phase of ECONOMIC_PHASES) {
    const phaseModifiers = PHASE_MODIFIERS[phase];
    const actionCounts = emptyActionCounts();

    for (let tick = 0; tick < config.ticksPerPhase; tick += 1) {
      for (const player of players) {
        const country = requireValue(
          countryByCode.get(player.countryCode),
          "simulation_country_missing",
        );
        const strategy = requireValue(
          strategyById.get(player.strategyPublicId),
          "simulation_strategy_missing",
        );
        applyAttendance(player, country, phaseModifiers, random, actionCounts);
        applySubsistence(player, country, phaseModifiers, config, actionCounts);
        applyStrategicAction(
          player,
          country,
          strategy,
          phaseModifiers,
          random,
          actionCounts,
        );
        applyDebtService(player, country, strategy, random, actionCounts);
        updateSolvency(player, config.insolvencyThresholdMinor);
      }
    }

    const immutablePlayers = players
      .map(toImmutablePlayer)
      .sort((left, right) =>
        left.playerPublicId.localeCompare(right.playerPublicId)
      );
    const wealth = immutablePlayers.map(netWealthMinor).sort((a, b) => a - b);
    phaseResults.push({
      phase,
      endingPlayers: immutablePlayers,
      totalWealthMinor: sum(wealth),
      medianWealthMinor: median(wealth),
      insolventPlayerCount: immutablePlayers.filter((player) =>
        player.insolvent
      ).length,
      recoveredPlayerCount: immutablePlayers.filter((player) =>
        player.recoveredFromInsolvency
      ).length,
      actionCounts: sortActionCounts(actionCounts),
    });
  }

  const finalPlayers = players
    .map(toImmutablePlayer)
    .sort((left, right) =>
      left.playerPublicId.localeCompare(right.playerPublicId)
    );
  const dominantPathShare = calculateDominantPathShare(finalPlayers);
  const richestToPoorestCountryRatio = calculateCountryWealthRatio(
    finalPlayers,
  );
  const insolvencyRecoveryRate = calculateRecoveryRate(finalPlayers);
  const giniCoefficient = calculateGini(finalPlayers.map(netWealthMinor));
  const findings = buildFindings(
    config,
    dominantPathShare,
    richestToPoorestCountryRatio,
    insolvencyRecoveryRate,
    giniCoefficient,
  );

  return {
    simulationPublicId: config.simulationPublicId,
    deterministicSeed: config.deterministicSeed,
    playerCount: config.playerCount,
    phaseResults,
    finalPlayers,
    dominantPathShare: round(dominantPathShare),
    richestToPoorestCountryRatio: round(richestToPoorestCountryRatio),
    insolvencyRecoveryRate: round(insolvencyRecoveryRate),
    giniCoefficient: round(giniCoefficient),
    findings,
    seedCatalogsModified: false,
    activationAuthorized: false,
    deterministic: true,
  };
}

function createPlayers(config: EconomicSimulationConfig): MutablePlayerState[] {
  return Array.from({ length: config.playerCount }, (_, index) => {
    const country = config.countries[index % config.countries.length];
    const strategy = config.strategies[index % config.strategies.length];
    return {
      playerPublicId: `simulation.player.${String(index + 1).padStart(3, "0")}`,
      countryCode: country.countryCode,
      strategyPublicId: strategy.strategyPublicId,
      cashMinor: config.startingCashMinor,
      debtMinor: 0,
      inventoryValueMinor: 0,
      businessValueMinor: 0,
      portfolioValueMinor: 0,
      experience: 0,
      reputation: 0,
      completedActions: emptyActionCounts(),
      insolvent: false,
      recoveredFromInsolvency: false,
    };
  });
}

function applyAttendance(
  player: MutablePlayerState,
  country: CountryEconomyProfile,
  phase: PhaseModifiers,
  random: () => number,
  aggregateActions: Record<EconomicDomain, number>,
): void {
  const reliability = 0.94 + random() * 0.06;
  const income = boundedRound(
    1_000 * country.incomeModifier * phase.income * reliability,
  );
  player.cashMinor += income;
  incrementAction(player, aggregateActions, "attendance");
}

function applySubsistence(
  player: MutablePlayerState,
  country: CountryEconomyProfile,
  phase: PhaseModifiers,
  config: EconomicSimulationConfig,
  aggregateActions: Record<EconomicDomain, number>,
): void {
  const cost = boundedRound(
    config.subsistenceCostMinor * country.costModifier * phase.cost *
      country.scarcityModifier * phase.scarcity,
  );
  if (player.cashMinor >= cost) {
    player.cashMinor -= cost;
  } else {
    player.debtMinor += cost - player.cashMinor;
    player.cashMinor = 0;
  }
  incrementAction(player, aggregateActions, "store");
}

function applyDebtService(
  player: MutablePlayerState,
  country: CountryEconomyProfile,
  strategy: PlayerStrategyProfile,
  random: () => number,
  aggregateActions: Record<EconomicDomain, number>,
): void {
  if (player.debtMinor <= 0) return;
  const interestRate = Math.max(
    0.002,
    0.009 / country.creditModifier + random() * 0.002,
  );
  player.debtMinor += boundedRound(player.debtMinor * interestRate);
  const paymentCapacity = boundedRound(
    player.cashMinor * (0.08 + strategy.savingWeight * 0.22),
  );
  const payment = Math.min(player.cashMinor, player.debtMinor, paymentCapacity);
  player.cashMinor -= payment;
  player.debtMinor -= payment;
  incrementAction(player, aggregateActions, "banking");
}

function updateSolvency(
  player: MutablePlayerState,
  insolvencyThresholdMinor: number,
): void {
  const wealth = netWealthMinor(player);
  if (wealth < insolvencyThresholdMinor) {
    player.insolvent = true;
    return;
  }
  if (player.insolvent) {
    player.insolvent = false;
    player.recoveredFromInsolvency = true;
  }
}

function buildFindings(
  config: EconomicSimulationConfig,
  dominantPathShare: number,
  countryRatio: number,
  recoveryRate: number,
  gini: number,
): EconomicBalanceFinding[] {
  const findings: EconomicBalanceFinding[] = [];
  if (dominantPathShare > config.maximumDominantPathShare) {
    findings.push({
      code: "dominant_economic_path_exceeded",
      severity: "critical",
      message:
        "One economic path exceeds the configured share of productive actions.",
      observedValue: round(dominantPathShare),
      threshold: config.maximumDominantPathShare,
    });
  }
  if (countryRatio > config.maximumCountryWealthRatio) {
    findings.push({
      code: "country_wealth_ratio_exceeded",
      severity: "critical",
      message:
        "Average country wealth diverges beyond the configured balance limit.",
      observedValue: round(countryRatio),
      threshold: config.maximumCountryWealthRatio,
    });
  }
  if (recoveryRate < config.minimumRecoveryRate) {
    findings.push({
      code: "insolvency_recovery_below_minimum",
      severity: "warning",
      message: "Too few insolvent players recover before the simulation ends.",
      observedValue: round(recoveryRate),
      threshold: config.minimumRecoveryRate,
    });
  }
  if (gini > 0.6) {
    findings.push({
      code: "wealth_inequality_high",
      severity: "warning",
      message:
        "Final player wealth concentration is above the simulation guardrail.",
      observedValue: round(gini),
      threshold: 0.6,
    });
  }
  if (findings.length === 0) {
    findings.push({
      code: "economic_balance_within_guardrails",
      severity: "info",
      message:
        "The deterministic run remained inside configured balance guardrails.",
      observedValue: 0,
      threshold: 0,
    });
  }
  return findings.sort((left, right) => left.code.localeCompare(right.code));
}

function calculateDominantPathShare(
  players: readonly EconomicPlayerState[],
): number {
  const productiveDomains: EconomicDomain[] = [
    "contracts",
    "business",
    "crafting",
    "marketplace",
    "financial_markets",
  ];
  const totals = productiveDomains.map((domain) =>
    players.reduce((sum, player) => sum + player.completedActions[domain], 0)
  );
  const totalActions = sum(totals);
  return totalActions === 0 ? 0 : Math.max(...totals) / totalActions;
}

function calculateCountryWealthRatio(
  players: readonly EconomicPlayerState[],
): number {
  const grouped = new Map<string, number[]>();
  for (const player of players) {
    const values = grouped.get(player.countryCode) ?? [];
    values.push(netWealthMinor(player));
    grouped.set(player.countryCode, values);
  }
  const averages = [...grouped.values()].map((values) =>
    sum(values) / values.length
  );
  const richest = Math.max(...averages);
  const poorest = Math.max(1, Math.min(...averages));
  return richest / poorest;
}

function calculateRecoveryRate(
  players: readonly EconomicPlayerState[],
): number {
  const everAffected = players.filter((player) =>
    player.insolvent || player.recoveredFromInsolvency
  );
  if (everAffected.length === 0) return 1;
  return everAffected.filter((player) => player.recoveredFromInsolvency)
    .length /
    everAffected.length;
}

function calculateGini(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const minimum = Math.min(...values);
  const normalized = values
    .map((value) => value - Math.min(0, minimum))
    .sort((left, right) => left - right);
  const total = sum(normalized);
  if (total === 0) return 0;
  let weighted = 0;
  normalized.forEach((value, index) => {
    weighted += (index + 1) * value;
  });
  return (2 * weighted) / (normalized.length * total) -
    (normalized.length + 1) / normalized.length;
}
