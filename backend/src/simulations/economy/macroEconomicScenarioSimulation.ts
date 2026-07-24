import type { EconomicPhase } from "./economicSimulationContracts.ts";

export interface MacroCountryProfile {
  readonly countryCode: string;
  readonly currencyCode: string;
  readonly startingPriceIndex: number;
  readonly startingFxRateToBase: number;
  readonly inflationSensitivity: number;
  readonly currencySensitivity: number;
  readonly importDependency: number;
}

export interface MacroTradeLink {
  readonly exporterCountryCode: string;
  readonly importerCountryCode: string;
  readonly dependencyWeight: number;
}

export interface MacroPhaseShock {
  readonly phase: EconomicPhase;
  readonly moneyGrowthRate: number;
  readonly supplyShockByCountry: Readonly<Record<string, number>>;
  readonly confidenceShockByCountry: Readonly<Record<string, number>>;
}

export interface MacroScenarioConfig {
  readonly scenarioPublicId: string;
  readonly countries: readonly MacroCountryProfile[];
  readonly tradeLinks: readonly MacroTradeLink[];
  readonly phaseShocks: readonly MacroPhaseShock[];
  readonly maximumAnnualizedInflationRate: number;
  readonly maximumCurrencyDepreciationRate: number;
  readonly maximumScarcityIndex: number;
  readonly maximumScarcityCascadeCountries: number;
}

export interface MacroCountryPhaseResult {
  readonly phase: EconomicPhase;
  readonly countryCode: string;
  readonly currencyCode: string;
  readonly priceIndex: number;
  readonly phaseInflationRate: number;
  readonly fxRateToBase: number;
  readonly phaseCurrencyReturn: number;
  readonly scarcityIndex: number;
  readonly importedScarcityContribution: number;
}

export interface MacroScenarioFinding {
  readonly code: string;
  readonly severity: "info" | "warning" | "critical";
  readonly countryCode: string | null;
  readonly phase: EconomicPhase | null;
  readonly observedValue: number;
  readonly threshold: number;
}

export interface MacroScenarioReport {
  readonly scenarioPublicId: string;
  readonly phaseResults: readonly MacroCountryPhaseResult[];
  readonly peakInflationRate: number;
  readonly maximumCurrencyDepreciationRate: number;
  readonly peakScarcityIndex: number;
  readonly maximumScarcityCascadeCountries: number;
  readonly findings: readonly MacroScenarioFinding[];
  readonly evidenceDigest: string;
  readonly seedCatalogsModified: false;
  readonly activationAuthorized: false;
  readonly deterministic: true;
}

interface MutableMacroCountryState {
  readonly profile: MacroCountryProfile;
  priceIndex: number;
  fxRateToBase: number;
  scarcityIndex: number;
}

export function runMacroEconomicScenario(
  config: MacroScenarioConfig,
): MacroScenarioReport {
  validateConfig(config);
  const states = new Map<string, MutableMacroCountryState>(
    [...config.countries]
      .sort((left, right) => left.countryCode.localeCompare(right.countryCode))
      .map((profile) => [
        profile.countryCode,
        {
          profile,
          priceIndex: profile.startingPriceIndex,
          fxRateToBase: profile.startingFxRateToBase,
          scarcityIndex: 1,
        },
      ]),
  );
  const phaseResults: MacroCountryPhaseResult[] = [];
  const findings: MacroScenarioFinding[] = [];
  let maximumCascade = 0;

  for (const phaseShock of config.phaseShocks) {
    const scarcityByCountry = calculateScarcityPropagation(
      states,
      config.tradeLinks,
      phaseShock,
    );
    const averageInflationPressure = average(
      [...states.values()].map((state) =>
        calculateInflationRate(
          state,
          scarcityByCountry.get(state.profile.countryCode) ?? 1,
          phaseShock.moneyGrowthRate,
        )
      ),
    );
    let cascadeCountries = 0;

    for (const countryCode of [...states.keys()].sort()) {
      const state = requireValue(states.get(countryCode));
      const scarcity = requireValue(scarcityByCountry.get(countryCode));
      const ownSupplyShock = phaseShock.supplyShockByCountry[countryCode] ?? 0;
      const importedScarcityContribution = Math.max(
        0,
        scarcity - 1 - ownSupplyShock,
      );
      const phaseInflationRate = calculateInflationRate(
        state,
        scarcity,
        phaseShock.moneyGrowthRate,
      );
      const confidenceShock = phaseShock.confidenceShockByCountry[countryCode] ??
        0;
      const phaseCurrencyReturn = clamp(
        -((phaseInflationRate - averageInflationPressure) *
          state.profile.currencySensitivity) + confidenceShock,
        -0.75,
        0.75,
      );

      state.priceIndex = round(state.priceIndex * (1 + phaseInflationRate));
      state.fxRateToBase = round(
        Math.max(0.000001, state.fxRateToBase * (1 + phaseCurrencyReturn)),
      );
      state.scarcityIndex = scarcity;
      if (scarcity > config.maximumScarcityIndex) cascadeCountries += 1;

      phaseResults.push({
        phase: phaseShock.phase,
        countryCode,
        currencyCode: state.profile.currencyCode,
        priceIndex: state.priceIndex,
        phaseInflationRate: round(phaseInflationRate),
        fxRateToBase: state.fxRateToBase,
        phaseCurrencyReturn: round(phaseCurrencyReturn),
        scarcityIndex: round(scarcity),
        importedScarcityContribution: round(importedScarcityContribution),
      });

      if (phaseInflationRate > config.maximumAnnualizedInflationRate) {
        findings.push({
          code: "inflation_guardrail_exceeded",
          severity: "critical",
          countryCode,
          phase: phaseShock.phase,
          observedValue: round(phaseInflationRate),
          threshold: config.maximumAnnualizedInflationRate,
        });
      }
      const depreciationRate = Math.max(0, -phaseCurrencyReturn);
      if (depreciationRate > config.maximumCurrencyDepreciationRate) {
        findings.push({
          code: "currency_depreciation_guardrail_exceeded",
          severity: "warning",
          countryCode,
          phase: phaseShock.phase,
          observedValue: round(depreciationRate),
          threshold: config.maximumCurrencyDepreciationRate,
        });
      }
    }

    maximumCascade = Math.max(maximumCascade, cascadeCountries);
    if (cascadeCountries > config.maximumScarcityCascadeCountries) {
      findings.push({
        code: "cross_country_scarcity_cascade_exceeded",
        severity: "critical",
        countryCode: null,
        phase: phaseShock.phase,
        observedValue: cascadeCountries,
        threshold: config.maximumScarcityCascadeCountries,
      });
    }
  }

  const peakInflationRate = maximum(
    phaseResults.map((result) => result.phaseInflationRate),
  );
  const maximumCurrencyDepreciationRate = maximum(
    phaseResults.map((result) => Math.max(0, -result.phaseCurrencyReturn)),
  );
  const peakScarcityIndex = maximum(
    phaseResults.map((result) => result.scarcityIndex),
  );
  if (findings.length === 0) {
    findings.push({
      code: "macro_scenario_within_guardrails",
      severity: "info",
      countryCode: null,
      phase: null,
      observedValue: 0,
      threshold: 0,
    });
  }

  const canonicalResults = [...phaseResults].sort(comparePhaseResults);
  const canonicalFindings = [...findings].sort(compareFindings);
  return {
    scenarioPublicId: config.scenarioPublicId,
    phaseResults: canonicalResults,
    peakInflationRate: round(peakInflationRate),
    maximumCurrencyDepreciationRate: round(
      maximumCurrencyDepreciationRate,
    ),
    peakScarcityIndex: round(peakScarcityIndex),
    maximumScarcityCascadeCountries: maximumCascade,
    findings: canonicalFindings,
    evidenceDigest: digest([
      config.scenarioPublicId,
      canonicalResults,
      canonicalFindings,
    ]),
    seedCatalogsModified: false,
    activationAuthorized: false,
    deterministic: true,
  };
}

function calculateScarcityPropagation(
  states: ReadonlyMap<string, MutableMacroCountryState>,
  tradeLinks: readonly MacroTradeLink[],
  phaseShock: MacroPhaseShock,
): Map<string, number> {
  const result = new Map<string, number>();
  const orderedLinks = [...tradeLinks].sort((left, right) =>
    left.importerCountryCode.localeCompare(right.importerCountryCode) ||
    left.exporterCountryCode.localeCompare(right.exporterCountryCode)
  );

  for (const [countryCode, state] of [...states.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const ownShock = phaseShock.supplyShockByCountry[countryCode] ?? 0;
    let importedPressure = 0;
    for (const link of orderedLinks) {
      if (link.importerCountryCode !== countryCode) continue;
      const exporter = requireValue(states.get(link.exporterCountryCode));
      const exporterShock = phaseShock.supplyShockByCountry[
        link.exporterCountryCode
      ] ?? 0;
      importedPressure += link.dependencyWeight *
        Math.max(0, exporter.scarcityIndex - 1 + exporterShock);
    }
    result.set(
      countryCode,
      round(
        clamp(
          1 + ownShock + importedPressure * state.profile.importDependency,
          0.25,
          5,
        ),
      ),
    );
  }
  return result;
}

function calculateInflationRate(
  state: MutableMacroCountryState,
  scarcityIndex: number,
  moneyGrowthRate: number,
): number {
  return clamp(
    moneyGrowthRate * state.profile.inflationSensitivity +
      Math.max(0, scarcityIndex - 1) * 0.35,
    -0.25,
    2,
  );
}

function validateConfig(config: MacroScenarioConfig): void {
  validateIdentity(config.scenarioPublicId, "macro_scenario_public_id_invalid");
  if (config.countries.length !== 10) {
    throw new Error("macro_scenario_requires_ten_countries");
  }
  assertUnique(
    config.countries.map((country) => country.countryCode),
    "duplicate_macro_country_code",
  );
  assertUnique(
    config.countries.map((country) => country.currencyCode),
    "duplicate_macro_currency_code",
  );
  for (const country of config.countries) validateCountry(country);
  const countryCodes = new Set(config.countries.map((country) => country.countryCode));
  for (const link of config.tradeLinks) {
    if (
      !countryCodes.has(link.exporterCountryCode) ||
      !countryCodes.has(link.importerCountryCode)
    ) {
      throw new Error("macro_trade_link_unknown_country");
    }
    if (link.exporterCountryCode === link.importerCountryCode) {
      throw new Error("macro_trade_link_self_reference");
    }
    validateUnitInterval(link.dependencyWeight, "macro_trade_weight_invalid");
  }
  assertUnique(
    config.tradeLinks.map((link) =>
      `${link.exporterCountryCode}\u0000${link.importerCountryCode}`
    ),
    "duplicate_macro_trade_link",
  );
  if (config.phaseShocks.length === 0) {
    throw new Error("macro_phase_shocks_required");
  }
  assertUnique(
    config.phaseShocks.map((shock) => shock.phase),
    "duplicate_macro_phase_shock",
  );
  for (const shock of config.phaseShocks) {
    if (!Number.isFinite(shock.moneyGrowthRate) || shock.moneyGrowthRate < -0.5 || shock.moneyGrowthRate > 2) {
      throw new Error("macro_money_growth_invalid");
    }
    validateShockRecord(shock.supplyShockByCountry, countryCodes, "macro_supply_shock_invalid");
    validateShockRecord(
      shock.confidenceShockByCountry,
      countryCodes,
      "macro_confidence_shock_invalid",
    );
  }
  validateNonNegative(
    config.maximumAnnualizedInflationRate,
    "macro_inflation_threshold_invalid",
  );
  validateUnitInterval(
    config.maximumCurrencyDepreciationRate,
    "macro_currency_threshold_invalid",
  );
  if (!Number.isFinite(config.maximumScarcityIndex) || config.maximumScarcityIndex < 1) {
    throw new Error("macro_scarcity_threshold_invalid");
  }
  if (
    !Number.isInteger(config.maximumScarcityCascadeCountries) ||
    config.maximumScarcityCascadeCountries < 0 ||
    config.maximumScarcityCascadeCountries > 10
  ) {
    throw new Error("macro_scarcity_cascade_threshold_invalid");
  }
}

function validateCountry(country: MacroCountryProfile): void {
  if (!/^[A-Z][A-Z0-9_]{2,31}$/.test(country.countryCode)) {
    throw new Error("macro_country_code_invalid");
  }
  if (!/^[A-Z]{3,16}$/.test(country.currencyCode)) {
    throw new Error("macro_currency_code_invalid");
  }
  for (const [value, errorCode] of [
    [country.startingPriceIndex, "macro_starting_price_index_invalid"],
    [country.startingFxRateToBase, "macro_starting_fx_rate_invalid"],
    [country.inflationSensitivity, "macro_inflation_sensitivity_invalid"],
    [country.currencySensitivity, "macro_currency_sensitivity_invalid"],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0 || value > 10) {
      throw new Error(errorCode);
    }
  }
  validateUnitInterval(country.importDependency, "macro_import_dependency_invalid");
}

function validateShockRecord(
  values: Readonly<Record<string, number>>,
  countryCodes: ReadonlySet<string>,
  errorCode: string,
): void {
  for (const [countryCode, value] of Object.entries(values)) {
    if (!countryCodes.has(countryCode) || !Number.isFinite(value) || value < -0.75 || value > 2) {
      throw new Error(errorCode);
    }
  }
}

function comparePhaseResults(
  left: MacroCountryPhaseResult,
  right: MacroCountryPhaseResult,
): number {
  return phaseOrder(left.phase) - phaseOrder(right.phase) ||
    left.countryCode.localeCompare(right.countryCode);
}

function compareFindings(
  left: MacroScenarioFinding,
  right: MacroScenarioFinding,
): number {
  return left.code.localeCompare(right.code) ||
    (left.phase ?? "").localeCompare(right.phase ?? "") ||
    (left.countryCode ?? "").localeCompare(right.countryCode ?? "");
}

function phaseOrder(phase: EconomicPhase): number {
  return ["peace", "shortage", "war", "reconstruction"].indexOf(phase);
}

function validateIdentity(value: string, errorCode: string): void {
  if (!value.trim() || value.length > 180) throw new Error(errorCode);
}

function validateNonNegative(value: number, errorCode: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(errorCode);
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
  if (value === undefined) throw new Error("macro_scenario_internal_value_missing");
  return value;
}

function maximum(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

function average(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function clamp(value: number, minimum: number, maximumValue: number): number {
  return Math.min(maximumValue, Math.max(minimum, value));
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
