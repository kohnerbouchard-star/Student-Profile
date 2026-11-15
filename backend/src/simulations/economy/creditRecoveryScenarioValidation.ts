import type { CreditRecoveryScenarioConfig } from "./creditRecoveryScenarioSimulation.ts";

export function validateConfig(config: CreditRecoveryScenarioConfig): void {
  validateIdentity(
    config.scenarioPublicId,
    "credit_scenario_public_id_invalid",
  );
  if (config.countries.length !== 10) {
    throw new Error("credit_scenario_requires_ten_countries");
  }
  if (config.players.length === 0) {
    throw new Error("credit_scenario_players_required");
  }
  if (config.phaseWindows.length === 0) {
    throw new Error("credit_scenario_phase_windows_required");
  }
  assertUnique(
    config.countries.map((country) => country.countryCode),
    "duplicate_credit_country_code",
  );
  assertUnique(
    config.players.map((player) => player.playerPublicId),
    "duplicate_credit_player_public_id",
  );
  const countryCodes = new Set(
    config.countries.map((country) => country.countryCode),
  );
  for (const country of config.countries) {
    if (!/^[A-Z][A-Z0-9_]{2,31}$/.test(country.countryCode)) {
      throw new Error("credit_country_code_invalid");
    }
    for (
      const value of [
        country.incomeModifier,
        country.costModifier,
        country.creditModifier,
      ]
    ) {
      if (!Number.isFinite(value) || value <= 0 || value > 5) {
        throw new Error("credit_country_modifier_invalid");
      }
    }
  }
  const totalTicks = config.phaseWindows.reduce((total, window) => {
    if (
      !Number.isInteger(window.ticks) ||
      window.ticks < 1 ||
      window.ticks > 10_000
    ) {
      throw new Error("credit_phase_ticks_invalid");
    }
    for (
      const value of [
        window.incomeModifier,
        window.costModifier,
        window.interestModifier,
      ]
    ) {
      if (!Number.isFinite(value) || value <= 0 || value > 10) {
        throw new Error("credit_phase_modifier_invalid");
      }
    }
    return total + window.ticks;
  }, 0);
  for (const player of config.players) {
    validateIdentity(player.playerPublicId, "credit_player_public_id_invalid");
    if (!countryCodes.has(player.countryCode)) {
      throw new Error("credit_player_unknown_country");
    }
    if (
      !Number.isInteger(player.joinTick) ||
      player.joinTick < 0 ||
      player.joinTick >= totalTicks
    ) {
      throw new Error("credit_player_join_tick_invalid");
    }
    validateUnitInterval(
      player.incomeCapacity,
      "credit_income_capacity_invalid",
    );
    validateUnitInterval(
      player.savingsDiscipline,
      "credit_savings_discipline_invalid",
    );
    if (
      !Number.isInteger(player.initialDebtMinor) || player.initialDebtMinor < 0
    ) {
      throw new Error("credit_initial_debt_invalid");
    }
  }
  for (
    const [value, errorCode] of [
      [config.startingCashMinor, "credit_starting_cash_invalid"],
      [config.baseIncomeMinor, "credit_base_income_invalid"],
      [config.subsistenceCostMinor, "credit_subsistence_cost_invalid"],
      [config.lateJoinCatchUpGrantMinor, "credit_catch_up_grant_invalid"],
      [config.minimumScheduledPaymentMinor, "credit_minimum_payment_invalid"],
      [
        config.reconstructionRecoveryIncomeMinor,
        "credit_recovery_income_invalid",
      ],
    ] as const
  ) {
    if (!Number.isInteger(value) || value < 0) throw new Error(errorCode);
  }
  for (
    const [value, errorCode] of [
      [config.scheduledPaymentRate, "credit_payment_rate_invalid"],
      [
        config.restructuringPrincipalReductionRate,
        "credit_restructuring_rate_invalid",
      ],
      [config.maximumDefaultRate, "credit_default_threshold_invalid"],
      [
        config.minimumDefaultRecoveryRate,
        "credit_recovery_threshold_invalid",
      ],
    ] as const
  ) {
    validateUnitInterval(value, errorCode);
  }
  if (
    !Number.isFinite(config.lateJoinIncomeMultiplier) ||
    config.lateJoinIncomeMultiplier < 1 ||
    config.lateJoinIncomeMultiplier > 5
  ) {
    throw new Error("credit_late_join_multiplier_invalid");
  }
  if (
    !Number.isInteger(config.delinquencyAfterMissedPayments) ||
    config.delinquencyAfterMissedPayments < 1
  ) {
    throw new Error("credit_delinquency_window_invalid");
  }
  if (
    !Number.isInteger(config.defaultAfterMissedPayments) ||
    config.defaultAfterMissedPayments <=
      config.delinquencyAfterMissedPayments
  ) {
    throw new Error("credit_default_window_invalid");
  }
  if (
    !Number.isFinite(config.maximumLateJoinWealthGapRatio) ||
    config.maximumLateJoinWealthGapRatio < 1
  ) {
    throw new Error("credit_late_join_gap_threshold_invalid");
  }
}

function validateIdentity(value: string, errorCode: string): void {
  if (!value.trim() || value.length > 180) throw new Error(errorCode);
}

function validateUnitInterval(value: number, errorCode: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(errorCode);
  }
}

function assertUnique(values: readonly string[], errorCode: string): void {
  if (new Set(values).size !== values.length) throw new Error(errorCode);
}
