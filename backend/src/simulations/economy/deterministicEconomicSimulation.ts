import {
  type CountryEconomyProfile,
  ECONOMIC_DOMAINS,
  ECONOMIC_PHASES,
  type EconomicBalanceFinding,
  type EconomicDomain,
  type EconomicPlayerState,
  type EconomicSimulationConfig,
  type EconomicSimulationPhaseResult,
  type EconomicSimulationReport,
  type PlayerStrategyProfile,
} from "./economicSimulationContracts.ts";

interface MutablePlayerState {
  playerPublicId: string;
  countryCode: string;
  strategyPublicId: string;
  cashMinor: number;
  debtMinor: number;
  inventoryValueMinor: number;
  businessValueMinor: number;
  portfolioValueMinor: number;
  experience: number;
  reputation: number;
  completedActions: Record<EconomicDomain, number>;
  insolvent: boolean;
  recoveredFromInsolvency: boolean;
}

interface PhaseModifiers {
  readonly income: number;
  readonly cost: number;
  readonly scarcity: number;
  readonly marketVolatility: number;
}

const PHASE_MODIFIERS: Readonly<Record<string, PhaseModifiers>> = {
  peace: { income: 1, cost: 1, scarcity: 1, marketVolatility: 1 },
  shortage: { income: 0.92, cost: 1.25, scarcity: 1.3, marketVolatility: 1.2 },
  war: { income: 0.78, cost: 1.55, scarcity: 1.65, marketVolatility: 1.65 },
  reconstruction: {
    income: 1.12,
    cost: 1.15,
    scarcity: 1.1,
    marketVolatility: 1.35,
  },
};

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

function applyStrategicAction(
  player: MutablePlayerState,
  country: CountryEconomyProfile,
  strategy: PlayerStrategyProfile,
  phase: PhaseModifiers,
  random: () => number,
  aggregateActions: Record<EconomicDomain, number>,
): void {
  const action = selectWeightedAction(strategy, random());
  switch (action) {
    case "contracts":
      performContract(player, country, phase, random);
      break;
    case "business":
      performBusiness(player, country, phase, strategy, random);
      break;
    case "crafting":
      performCrafting(player, country, phase, random);
      break;
    case "marketplace":
      performMarketplace(player, country, phase, random);
      break;
    case "financial_markets":
      performFinancialMarketAction(player, country, phase, strategy, random);
      break;
    case "banking":
      performSavingAction(player, strategy);
      break;
  }
  incrementAction(player, aggregateActions, action);
  incrementAction(player, aggregateActions, "progression");
  player.experience += 8 + Math.floor(random() * 8);
  player.reputation += random() > 0.08 ? 1 : 0;
}

function performContract(
  player: MutablePlayerState,
  country: CountryEconomyProfile,
  phase: PhaseModifiers,
  random: () => number,
): void {
  const outcome = 0.78 + random() * 0.5;
  player.cashMinor += boundedRound(
    700 * country.incomeModifier * phase.income * outcome,
  );
}

function performBusiness(
  player: MutablePlayerState,
  country: CountryEconomyProfile,
  phase: PhaseModifiers,
  strategy: PlayerStrategyProfile,
  random: () => number,
): void {
  const investment = Math.min(player.cashMinor, 450);
  if (investment <= 0) return;
  player.cashMinor -= investment;
  player.businessValueMinor += investment;
  const failureProbability = Math.min(
    0.55,
    0.08 + (1 - country.creditModifier) * 0.18 +
      (phase.cost - 1) * 0.16 + strategy.riskTolerance * 0.04,
  );
  if (random() < failureProbability) {
    const impairment = boundedRound(
      player.businessValueMinor * (0.08 + random() * 0.18),
    );
    player.businessValueMinor = Math.max(
      0,
      player.businessValueMinor - impairment,
    );
    return;
  }
  player.cashMinor += boundedRound(
    investment * (0.1 + random() * 0.22) * country.incomeModifier,
  );
}

function performCrafting(
  player: MutablePlayerState,
  country: CountryEconomyProfile,
  phase: PhaseModifiers,
  random: () => number,
): void {
  const inputCost = boundedRound(
    260 * country.costModifier * phase.cost * country.scarcityModifier *
      phase.scarcity,
  );
  if (player.cashMinor < inputCost) return;
  player.cashMinor -= inputCost;
  const quality = 0.92 + random() * 0.38;
  player.inventoryValueMinor += boundedRound(inputCost * quality);
}

function performMarketplace(
  player: MutablePlayerState,
  country: CountryEconomyProfile,
  phase: PhaseModifiers,
  random: () => number,
): void {
  if (player.inventoryValueMinor > 0) {
    const soldValue = Math.max(
      1,
      boundedRound(player.inventoryValueMinor * 0.3),
    );
    player.inventoryValueMinor -= soldValue;
    const scarcityPremium = Math.min(
      0.45,
      (country.scarcityModifier * phase.scarcity - 1) * 0.18,
    );
    player.cashMinor += boundedRound(
      soldValue * (0.94 + scarcityPremium + random() * 0.16),
    );
    return;
  }
  const purchase = Math.min(player.cashMinor, 220);
  if (purchase <= 0) return;
  player.cashMinor -= purchase;
  player.inventoryValueMinor += boundedRound(
    purchase * (0.9 + random() * 0.12),
  );
}

function performFinancialMarketAction(
  player: MutablePlayerState,
  country: CountryEconomyProfile,
  phase: PhaseModifiers,
  strategy: PlayerStrategyProfile,
  random: () => number,
): void {
  const contribution = Math.min(player.cashMinor, 400);
  if (contribution > 0) {
    player.cashMinor -= contribution;
    player.portfolioValueMinor += contribution;
  }
  if (player.portfolioValueMinor <= 0) return;
  const shockScale = 0.035 * country.marketVolatilityModifier *
    phase.marketVolatility * (0.5 + strategy.riskTolerance);
  const returnRate = (random() - 0.47) * shockScale;
  player.portfolioValueMinor = Math.max(
    0,
    boundedRound(player.portfolioValueMinor * (1 + returnRate)),
  );
}

function performSavingAction(
  player: MutablePlayerState,
  strategy: PlayerStrategyProfile,
): void {
  if (player.debtMinor > 0) {
    const payment = Math.min(
      player.cashMinor,
      player.debtMinor,
      boundedRound(300 + strategy.savingWeight * 200),
    );
    player.cashMinor -= payment;
    player.debtMinor -= payment;
    return;
  }
  player.cashMinor += boundedRound(player.cashMinor * 0.0005);
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

function selectWeightedAction(
  strategy: PlayerStrategyProfile,
  draw: number,
):
  | "contracts"
  | "business"
  | "crafting"
  | "marketplace"
  | "financial_markets"
  | "banking" {
  const choices = [
    ["contracts", strategy.contractWeight],
    ["business", strategy.businessWeight],
    ["crafting", strategy.craftingWeight],
    ["marketplace", strategy.marketplaceWeight],
    ["financial_markets", strategy.financialMarketWeight],
    ["banking", strategy.savingWeight],
  ] as const;
  const total = choices.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = draw * total;
  for (const [choice, weight] of choices) {
    cursor -= weight;
    if (cursor < 0) return choice;
  }
  return "banking";
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

function validateConfig(config: EconomicSimulationConfig): void {
  if (
    !config.simulationPublicId.trim() || config.simulationPublicId.length > 180
  ) {
    throw new Error("simulation_public_id_invalid");
  }
  if (
    !Number.isInteger(config.deterministicSeed) || config.deterministicSeed < 0
  ) {
    throw new Error("simulation_seed_invalid");
  }
  if (config.playerCount !== 30 && config.playerCount !== 40) {
    throw new Error("simulation_player_count_invalid");
  }
  if (
    !Number.isInteger(config.ticksPerPhase) || config.ticksPerPhase < 1 ||
    config.ticksPerPhase > 10_000
  ) {
    throw new Error("simulation_ticks_invalid");
  }
  if (config.countries.length !== 10) {
    throw new Error("simulation_requires_ten_countries");
  }
  if (config.strategies.length < 3) {
    throw new Error("simulation_strategies_insufficient");
  }
  assertUnique(
    config.countries.map((country) => country.countryCode),
    "duplicate_country_code",
  );
  assertUnique(
    config.countries.map((country) => country.currencyCode),
    "duplicate_currency_code",
  );
  assertUnique(
    config.strategies.map((strategy) => strategy.strategyPublicId),
    "duplicate_strategy_public_id",
  );
  for (const country of config.countries) validateCountry(country);
  for (const strategy of config.strategies) validateStrategy(strategy);
  for (
    const [value, errorCode] of [
      [config.startingCashMinor, "starting_cash_invalid"],
      [config.subsistenceCostMinor, "subsistence_cost_invalid"],
    ] as const
  ) {
    if (!Number.isInteger(value) || value <= 0) throw new Error(errorCode);
  }
  for (
    const [value, errorCode] of [
      [config.maximumDominantPathShare, "dominant_path_threshold_invalid"],
      [config.minimumRecoveryRate, "recovery_threshold_invalid"],
    ] as const
  ) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(errorCode);
    }
  }
  if (
    !Number.isFinite(config.maximumCountryWealthRatio) ||
    config.maximumCountryWealthRatio < 1
  ) {
    throw new Error("country_wealth_threshold_invalid");
  }
}

function validateCountry(country: CountryEconomyProfile): void {
  if (!/^[A-Z][A-Z0-9_]{2,31}$/.test(country.countryCode)) {
    throw new Error("country_code_invalid");
  }
  if (!/^[A-Z]{3,16}$/.test(country.currencyCode)) {
    throw new Error("currency_code_invalid");
  }
  for (
    const value of [
      country.incomeModifier,
      country.costModifier,
      country.scarcityModifier,
      country.creditModifier,
      country.marketVolatilityModifier,
    ]
  ) {
    if (!Number.isFinite(value) || value <= 0 || value > 5) {
      throw new Error("country_modifier_invalid");
    }
  }
}

function validateStrategy(strategy: PlayerStrategyProfile): void {
  if (
    !strategy.strategyPublicId.trim() || strategy.strategyPublicId.length > 180
  ) {
    throw new Error("strategy_public_id_invalid");
  }
  const weights = [
    strategy.contractWeight,
    strategy.businessWeight,
    strategy.craftingWeight,
    strategy.marketplaceWeight,
    strategy.financialMarketWeight,
    strategy.savingWeight,
  ];
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new Error("strategy_weight_invalid");
  }
  if (sum(weights) <= 0) throw new Error("strategy_weight_total_invalid");
  if (
    !Number.isFinite(strategy.riskTolerance) || strategy.riskTolerance < 0 ||
    strategy.riskTolerance > 1
  ) {
    throw new Error("strategy_risk_tolerance_invalid");
  }
}

function incrementAction(
  player: MutablePlayerState,
  aggregate: Record<EconomicDomain, number>,
  domain: EconomicDomain,
): void {
  player.completedActions[domain] += 1;
  aggregate[domain] += 1;
}

function emptyActionCounts(): Record<EconomicDomain, number> {
  return Object.fromEntries(
    ECONOMIC_DOMAINS.map((domain) => [domain, 0]),
  ) as Record<
    EconomicDomain,
    number
  >;
}

function sortActionCounts(
  values: Readonly<Record<EconomicDomain, number>>,
): Readonly<Record<EconomicDomain, number>> {
  return Object.fromEntries(
    Object.entries(values).sort(([left], [right]) => left.localeCompare(right)),
  ) as Readonly<Record<EconomicDomain, number>>;
}

function toImmutablePlayer(player: MutablePlayerState): EconomicPlayerState {
  return {
    ...player,
    completedActions: sortActionCounts(player.completedActions),
  };
}

function netWealthMinor(
  player: EconomicPlayerState | MutablePlayerState,
): number {
  return player.cashMinor + player.inventoryValueMinor +
    player.businessValueMinor +
    player.portfolioValueMinor - player.debtMinor;
}

function createDeterministicRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function boundedRound(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    throw new Error("simulation_numeric_overflow");
  }
  return Math.round(value);
}

function assertUnique(values: readonly string[], errorCode: string): void {
  if (new Set(values).size !== values.length) throw new Error(errorCode);
}

function requireValue<T>(value: T | undefined, errorCode: string): T {
  if (value === undefined) throw new Error(errorCode);
  return value;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const midpoint = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? Math.round((values[midpoint - 1] + values[midpoint]) / 2)
    : values[midpoint];
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
