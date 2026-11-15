import type {
  CountryEconomyProfile,
  EconomicSimulationConfig,
  PlayerStrategyProfile,
} from "./economicSimulationContracts.ts";
import { sum } from "./economicSimulationState.ts";

export function validateConfig(config: EconomicSimulationConfig): void {
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

function assertUnique(values: readonly string[], errorCode: string): void {
  if (new Set(values).size !== values.length) throw new Error(errorCode);
}
