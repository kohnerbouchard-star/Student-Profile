import type { EconomicPhase } from "./economicSimulationContracts.ts";

export type SimulatedLoanStatus =
  | "current"
  | "delinquent"
  | "defaulted"
  | "restructured"
  | "repaid";

export interface CreditRecoveryCountryProfile {
  readonly countryCode: string;
  readonly incomeModifier: number;
  readonly costModifier: number;
  readonly creditModifier: number;
}

export interface CreditRecoveryPlayerProfile {
  readonly playerPublicId: string;
  readonly countryCode: string;
  readonly joinTick: number;
  readonly incomeCapacity: number;
  readonly savingsDiscipline: number;
  readonly initialDebtMinor: number;
}

export interface CreditRecoveryPhaseWindow {
  readonly phase: EconomicPhase;
  readonly ticks: number;
  readonly incomeModifier: number;
  readonly costModifier: number;
  readonly interestModifier: number;
}

export interface CreditRecoveryScenarioConfig {
  readonly scenarioPublicId: string;
  readonly countries: readonly CreditRecoveryCountryProfile[];
  readonly players: readonly CreditRecoveryPlayerProfile[];
  readonly phaseWindows: readonly CreditRecoveryPhaseWindow[];
  readonly startingCashMinor: number;
  readonly baseIncomeMinor: number;
  readonly subsistenceCostMinor: number;
  readonly lateJoinCatchUpGrantMinor: number;
  readonly lateJoinIncomeMultiplier: number;
  readonly scheduledPaymentRate: number;
  readonly minimumScheduledPaymentMinor: number;
  readonly delinquencyAfterMissedPayments: number;
  readonly defaultAfterMissedPayments: number;
  readonly restructuringPrincipalReductionRate: number;
  readonly reconstructionRecoveryIncomeMinor: number;
  readonly maximumDefaultRate: number;
  readonly minimumDefaultRecoveryRate: number;
  readonly maximumLateJoinWealthGapRatio: number;
}

export interface CreditRecoveryPlayerResult {
  readonly playerPublicId: string;
  readonly countryCode: string;
  readonly joinTick: number;
  readonly endingCashMinor: number;
  readonly endingDebtMinor: number;
  readonly endingNetWealthMinor: number;
  readonly missedPayments: number;
  readonly loanStatus: SimulatedLoanStatus;
  readonly defaultedEver: boolean;
  readonly recoveredAfterDefault: boolean;
  readonly catchUpGrantReceivedMinor: number;
  readonly totalIncomeMinor: number;
  readonly totalDebtServiceMinor: number;
}

export interface CreditRecoveryFinding {
  readonly code: string;
  readonly severity: "info" | "warning" | "critical";
  readonly observedValue: number;
  readonly threshold: number;
}

export interface CreditRecoveryScenarioReport {
  readonly scenarioPublicId: string;
  readonly totalTicks: number;
  readonly playerResults: readonly CreditRecoveryPlayerResult[];
  readonly defaultRate: number;
  readonly defaultRecoveryRate: number;
  readonly lateJoinWealthGapRatio: number;
  readonly delinquentPlayerCount: number;
  readonly defaultedPlayerCount: number;
  readonly recoveredPlayerCount: number;
  readonly findings: readonly CreditRecoveryFinding[];
  readonly evidenceDigest: string;
  readonly seedCatalogsModified: false;
  readonly activationAuthorized: false;
  readonly deterministic: true;
}

interface MutableCreditPlayerState {
  readonly profile: CreditRecoveryPlayerProfile;
  joined: boolean;
  cashMinor: number;
  debtMinor: number;
  missedPayments: number;
  loanStatus: SimulatedLoanStatus;
  defaultedEver: boolean;
  recoveredAfterDefault: boolean;
  catchUpGrantReceivedMinor: number;
  totalIncomeMinor: number;
  totalDebtServiceMinor: number;
  restructuringApplied: boolean;
}

export function runCreditRecoveryScenario(
  config: CreditRecoveryScenarioConfig,
): CreditRecoveryScenarioReport {
  validateConfig(config);
  const countries = new Map(
    config.countries.map((country) => [country.countryCode, country]),
  );
  const states = [...config.players]
    .sort((left, right) => left.playerPublicId.localeCompare(right.playerPublicId))
    .map<MutableCreditPlayerState>((profile) => ({
      profile,
      joined: false,
      cashMinor: 0,
      debtMinor: profile.initialDebtMinor,
      missedPayments: 0,
      loanStatus: profile.initialDebtMinor === 0 ? "repaid" : "current",
      defaultedEver: false,
      recoveredAfterDefault: false,
      catchUpGrantReceivedMinor: 0,
      totalIncomeMinor: 0,
      totalDebtServiceMinor: 0,
      restructuringApplied: false,
    }));

  let absoluteTick = 0;
  for (const phaseWindow of config.phaseWindows) {
    for (let phaseTick = 0; phaseTick < phaseWindow.ticks; phaseTick += 1) {
      for (const state of states) {
        if (!state.joined && state.profile.joinTick === absoluteTick) {
          joinPlayer(state, config, absoluteTick);
        }
        if (state.joined) {
          applyTick(state, requireValue(countries.get(state.profile.countryCode)), phaseWindow, config);
        }
      }
      absoluteTick += 1;
    }
  }

  const playerResults = states.map(toResult).sort((left, right) =>
    left.playerPublicId.localeCompare(right.playerPublicId)
  );
  const defaulted = playerResults.filter((player) => player.defaultedEver);
  const recovered = defaulted.filter((player) => player.recoveredAfterDefault);
  const defaultRate = playerResults.length === 0
    ? 0
    : defaulted.length / playerResults.length;
  const defaultRecoveryRate = defaulted.length === 0
    ? 1
    : recovered.length / defaulted.length;
  const lateJoinWealthGapRatio = calculateLateJoinWealthGap(playerResults);
  const findings = buildFindings(
    config,
    defaultRate,
    defaultRecoveryRate,
    lateJoinWealthGapRatio,
  );

  return {
    scenarioPublicId: config.scenarioPublicId,
    totalTicks: absoluteTick,
    playerResults,
    defaultRate: round(defaultRate),
    defaultRecoveryRate: round(defaultRecoveryRate),
    lateJoinWealthGapRatio: round(lateJoinWealthGapRatio),
    delinquentPlayerCount: playerResults.filter((player) =>
      player.loanStatus === "delinquent"
    ).length,
    defaultedPlayerCount: defaulted.length,
    recoveredPlayerCount: recovered.length,
    findings,
    evidenceDigest: digest([
      config.scenarioPublicId,
      absoluteTick,
      playerResults,
      findings,
    ]),
    seedCatalogsModified: false,
    activationAuthorized: false,
    deterministic: true,
  };
}

function joinPlayer(
  state: MutableCreditPlayerState,
  config: CreditRecoveryScenarioConfig,
  absoluteTick: number,
): void {
  state.joined = true;
  state.cashMinor = config.startingCashMinor;
  if (absoluteTick > 0) {
    state.cashMinor += config.lateJoinCatchUpGrantMinor;
    state.catchUpGrantReceivedMinor = config.lateJoinCatchUpGrantMinor;
  }
}

function applyTick(
  state: MutableCreditPlayerState,
  country: CreditRecoveryCountryProfile,
  phase: CreditRecoveryPhaseWindow,
  config: CreditRecoveryScenarioConfig,
): void {
  const lateJoinMultiplier = state.profile.joinTick > 0
    ? config.lateJoinIncomeMultiplier
    : 1;
  let income = boundedRound(
    config.baseIncomeMinor * country.incomeModifier * phase.incomeModifier *
      state.profile.incomeCapacity * lateJoinMultiplier,
  );
  if (
    phase.phase === "reconstruction" &&
    (state.defaultedEver || state.loanStatus === "restructured")
  ) {
    income += config.reconstructionRecoveryIncomeMinor;
  }
  const cost = boundedRound(
    config.subsistenceCostMinor * country.costModifier * phase.costModifier,
  );
  state.cashMinor += income;
  state.totalIncomeMinor += income;
  if (state.cashMinor >= cost) {
    state.cashMinor -= cost;
  } else {
    state.debtMinor += cost - state.cashMinor;
    state.cashMinor = 0;
  }

  if (state.debtMinor <= 0) {
    state.debtMinor = 0;
    state.loanStatus = "repaid";
    state.missedPayments = 0;
    return;
  }

  const interestRate = clamp(
    (0.008 / country.creditModifier) * phase.interestModifier,
    0,
    0.15,
  );
  state.debtMinor += boundedRound(state.debtMinor * interestRate);
  const scheduledPayment = Math.min(
    state.debtMinor,
    Math.max(
      config.minimumScheduledPaymentMinor,
      boundedRound(state.debtMinor * config.scheduledPaymentRate),
    ),
  );
  const paymentCapacity = boundedRound(
    state.cashMinor * (0.2 + state.profile.savingsDiscipline * 0.65),
  );
  const payment = Math.min(state.cashMinor, scheduledPayment, paymentCapacity);
  state.cashMinor -= payment;
  state.debtMinor -= payment;
  state.totalDebtServiceMinor += payment;

  if (payment < scheduledPayment) {
    state.missedPayments += 1;
  } else {
    state.missedPayments = Math.max(0, state.missedPayments - 1);
  }

  if (state.missedPayments >= config.defaultAfterMissedPayments) {
    state.loanStatus = "defaulted";
    state.defaultedEver = true;
  } else if (state.missedPayments >= config.delinquencyAfterMissedPayments) {
    state.loanStatus = "delinquent";
  } else {
    state.loanStatus = "current";
  }

  if (
    phase.phase === "reconstruction" &&
    state.defaultedEver &&
    !state.restructuringApplied
  ) {
    state.debtMinor = boundedRound(
      state.debtMinor * (1 - config.restructuringPrincipalReductionRate),
    );
    state.restructuringApplied = true;
    state.loanStatus = "restructured";
    state.missedPayments = Math.min(
      state.missedPayments,
      config.delinquencyAfterMissedPayments - 1,
    );
  }

  if (
    state.defaultedEver &&
    state.restructuringApplied &&
    state.loanStatus !== "defaulted" &&
    state.debtMinor <= config.minimumScheduledPaymentMinor * 2
  ) {
    state.recoveredAfterDefault = true;
  }
  if (state.debtMinor <= 0) {
    state.debtMinor = 0;
    state.loanStatus = "repaid";
    if (state.defaultedEver) state.recoveredAfterDefault = true;
  }
}

function toResult(state: MutableCreditPlayerState): CreditRecoveryPlayerResult {
  return {
    playerPublicId: state.profile.playerPublicId,
    countryCode: state.profile.countryCode,
    joinTick: state.profile.joinTick,
    endingCashMinor: state.cashMinor,
    endingDebtMinor: state.debtMinor,
    endingNetWealthMinor: state.cashMinor - state.debtMinor,
    missedPayments: state.missedPayments,
    loanStatus: state.loanStatus,
    defaultedEver: state.defaultedEver,
    recoveredAfterDefault: state.recoveredAfterDefault,
    catchUpGrantReceivedMinor: state.catchUpGrantReceivedMinor,
    totalIncomeMinor: state.totalIncomeMinor,
    totalDebtServiceMinor: state.totalDebtServiceMinor,
  };
}

function calculateLateJoinWealthGap(
  players: readonly CreditRecoveryPlayerResult[],
): number {
  const early = players.filter((player) => player.joinTick === 0);
  const late = players.filter((player) => player.joinTick > 0);
  if (early.length === 0 || late.length === 0) return 1;
  const earlyAverage = average(early.map((player) => player.endingNetWealthMinor));
  const lateAverage = average(late.map((player) => player.endingNetWealthMinor));
  const higher = Math.max(1, earlyAverage, lateAverage);
  const lower = Math.max(1, Math.min(earlyAverage, lateAverage));
  return higher / lower;
}

function buildFindings(
  config: CreditRecoveryScenarioConfig,
  defaultRate: number,
  recoveryRate: number,
  lateJoinGap: number,
): CreditRecoveryFinding[] {
  const findings: CreditRecoveryFinding[] = [];
  if (defaultRate > config.maximumDefaultRate) {
    findings.push({
      code: "credit_default_rate_exceeded",
      severity: "critical",
      observedValue: round(defaultRate),
      threshold: config.maximumDefaultRate,
    });
  }
  if (recoveryRate < config.minimumDefaultRecoveryRate) {
    findings.push({
      code: "default_recovery_rate_below_minimum",
      severity: "critical",
      observedValue: round(recoveryRate),
      threshold: config.minimumDefaultRecoveryRate,
    });
  }
  if (lateJoinGap > config.maximumLateJoinWealthGapRatio) {
    findings.push({
      code: "late_join_wealth_gap_exceeded",
      severity: "warning",
      observedValue: round(lateJoinGap),
      threshold: config.maximumLateJoinWealthGapRatio,
    });
  }
  if (findings.length === 0) {
    findings.push({
      code: "credit_recovery_within_guardrails",
      severity: "info",
      observedValue: 0,
      threshold: 0,
    });
  }
  return findings.sort((left, right) => left.code.localeCompare(right.code));
}

function validateConfig(config: CreditRecoveryScenarioConfig): void {
  validateIdentity(config.scenarioPublicId, "credit_scenario_public_id_invalid");
  if (config.countries.length !== 10) {
    throw new Error("credit_scenario_requires_ten_countries");
  }
  if (config.players.length === 0) throw new Error("credit_scenario_players_required");
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
  const countryCodes = new Set(config.countries.map((country) => country.countryCode));
  for (const country of config.countries) {
    if (!/^[A-Z][A-Z0-9_]{2,31}$/.test(country.countryCode)) {
      throw new Error("credit_country_code_invalid");
    }
    for (const value of [
      country.incomeModifier,
      country.costModifier,
      country.creditModifier,
    ]) {
      if (!Number.isFinite(value) || value <= 0 || value > 5) {
        throw new Error("credit_country_modifier_invalid");
      }
    }
  }
  const totalTicks = config.phaseWindows.reduce((total, window) => {
    if (!Number.isInteger(window.ticks) || window.ticks < 1 || window.ticks > 10_000) {
      throw new Error("credit_phase_ticks_invalid");
    }
    for (const value of [
      window.incomeModifier,
      window.costModifier,
      window.interestModifier,
    ]) {
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
    if (!Number.isInteger(player.joinTick) || player.joinTick < 0 || player.joinTick >= totalTicks) {
      throw new Error("credit_player_join_tick_invalid");
    }
    validateUnitInterval(player.incomeCapacity, "credit_income_capacity_invalid");
    validateUnitInterval(player.savingsDiscipline, "credit_savings_discipline_invalid");
    if (!Number.isInteger(player.initialDebtMinor) || player.initialDebtMinor < 0) {
      throw new Error("credit_initial_debt_invalid");
    }
  }
  for (const [value, errorCode] of [
    [config.startingCashMinor, "credit_starting_cash_invalid"],
    [config.baseIncomeMinor, "credit_base_income_invalid"],
    [config.subsistenceCostMinor, "credit_subsistence_cost_invalid"],
    [config.lateJoinCatchUpGrantMinor, "credit_catch_up_grant_invalid"],
    [config.minimumScheduledPaymentMinor, "credit_minimum_payment_invalid"],
    [config.reconstructionRecoveryIncomeMinor, "credit_recovery_income_invalid"],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) throw new Error(errorCode);
  }
  for (const [value, errorCode] of [
    [config.scheduledPaymentRate, "credit_payment_rate_invalid"],
    [config.restructuringPrincipalReductionRate, "credit_restructuring_rate_invalid"],
    [config.maximumDefaultRate, "credit_default_threshold_invalid"],
    [config.minimumDefaultRecoveryRate, "credit_recovery_threshold_invalid"],
  ] as const) {
    validateUnitInterval(value, errorCode);
  }
  if (!Number.isFinite(config.lateJoinIncomeMultiplier) || config.lateJoinIncomeMultiplier < 1 || config.lateJoinIncomeMultiplier > 5) {
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
    config.defaultAfterMissedPayments <= config.delinquencyAfterMissedPayments
  ) {
    throw new Error("credit_default_window_invalid");
  }
  if (!Number.isFinite(config.maximumLateJoinWealthGapRatio) || config.maximumLateJoinWealthGapRatio < 1) {
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

function requireValue<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("credit_scenario_internal_value_missing");
  return value;
}

function average(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function boundedRound(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    throw new Error("credit_scenario_numeric_overflow");
  }
  return Math.round(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function digest(value: unknown): string {
  const source = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
