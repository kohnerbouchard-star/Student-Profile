export type CountryProfileStatus = "active" | "disabled" | "archived";
export type DifficultyPolicyStatus = "active" | "disabled" | "archived";
export type EconomicBaselineStatus = "active" | "disabled" | "archived";
export type GameDifficultyPolicySource = "preset" | "custom";
export type GameEconomicBaselineSource = "default" | "custom";
export type PlayerCountryAssignmentStatus = "active" | "inactive" | "archived";

export type EcoNovariaCountryCode =
  | "NORTHREACH"
  | "YRETHIA"
  | "THALORIS"
  | "SOLVEND"
  | "ELDORAN"
  | "VALERION"
  | "LUMENOR"
  | "XALVORIA"
  | "DRAVENLOK"
  | "SYNDALIS";

export type SelectableDifficultyPresetKey =
  | "easy"
  | "standard"
  | "moderate"
  | "hard"
  | "insane";

export type DifficultyPresetKey = SelectableDifficultyPresetKey | "custom";

export type PlayerCountryAssignmentReason =
  | "initial_assignment"
  | "immigration"
  | "event_relocation"
  | "admin_adjustment";

export interface CountryProfileRecord {
  readonly id: string;
  readonly country_code: EcoNovariaCountryCode | string;
  readonly country_name: string;
  readonly capital_name: string;
  readonly currency_code: string;
  readonly status: CountryProfileStatus | string;
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CountryProfileDto {
  readonly id: string;
  readonly countryCode: EcoNovariaCountryCode | string;
  readonly countryName: string;
  readonly capitalName: string;
  readonly currencyCode: string;
  readonly status: CountryProfileStatus | string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DifficultyPolicyProfileRecord {
  readonly id: string;
  readonly preset_key: SelectableDifficultyPresetKey | string;
  readonly label: string;
  readonly description: string | null;
  readonly price_modifier: number;
  readonly event_volatility_modifier: number;
  readonly scarcity_modifier: number;
  readonly income_modifier: number;
  readonly trade_modifier: number;
  readonly credit_modifier: number;
  readonly status: DifficultyPolicyStatus | string;
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface GameDifficultyPolicySettingsRecord {
  readonly id: string;
  readonly game_session_id: string;
  readonly difficulty_policy_profile_id: string | null;
  readonly difficulty_preset: DifficultyPresetKey | string;
  readonly custom_label: string | null;
  readonly source: GameDifficultyPolicySource | string;
  readonly price_modifier: number;
  readonly event_volatility_modifier: number;
  readonly scarcity_modifier: number;
  readonly income_modifier: number;
  readonly trade_modifier: number;
  readonly credit_modifier: number;
  readonly status: DifficultyPolicyStatus | string;
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface GameCountryEconomicBaselineSettingsRecord {
  readonly id: string;
  readonly game_session_id: string;
  readonly source: GameEconomicBaselineSource | string;
  readonly custom_label: string | null;
  readonly real_gdp_index: number;
  readonly gdp_growth_rate: number;
  readonly inflation_rate: number;
  readonly unemployment_rate: number;
  readonly interest_rate: number;
  readonly consumer_confidence_index: number;
  readonly business_confidence_index: number;
  readonly cost_of_living_index: number;
  readonly regional_price_multiplier: number;
  readonly supply_constraint_index: number;
  readonly import_dependency_index: number;
  readonly tax_rate: number;
  readonly subsidy_rate: number;
  readonly exchange_rate_index: number;
  readonly currency_stability_index: number;
  readonly trade_balance_index: number;
  readonly export_strength_index: number;
  readonly market_risk_index: number;
  readonly political_stability_index: number;
  readonly infrastructure_index: number;
  readonly energy_security_index: number;
  readonly status: EconomicBaselineStatus | string;
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CountryEconomicSnapshotRecord {
  readonly id: string;
  readonly game_session_id: string;
  readonly country_profile_id: string;
  readonly simulation_tick: number;
  readonly snapshot_label: string | null;
  readonly difficulty_policy_profile_id: string | null;
  readonly difficulty_preset: DifficultyPresetKey | string;
  readonly price_difficulty_modifier: number;
  readonly event_volatility_modifier: number;
  readonly scarcity_difficulty_modifier: number;
  readonly income_difficulty_modifier: number;
  readonly trade_difficulty_modifier: number;
  readonly credit_difficulty_modifier: number;
  readonly real_gdp_index: number;
  readonly gdp_growth_rate: number;
  readonly inflation_rate: number;
  readonly unemployment_rate: number;
  readonly interest_rate: number;
  readonly consumer_confidence_index: number;
  readonly business_confidence_index: number;
  readonly cost_of_living_index: number;
  readonly regional_price_multiplier: number;
  readonly supply_constraint_index: number;
  readonly import_dependency_index: number;
  readonly tax_rate: number;
  readonly subsidy_rate: number;
  readonly exchange_rate_index: number;
  readonly currency_stability_index: number;
  readonly trade_balance_index: number;
  readonly export_strength_index: number;
  readonly market_risk_index: number;
  readonly political_stability_index: number;
  readonly infrastructure_index: number;
  readonly energy_security_index: number;
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
}

export interface CountryEventImpactRecord {
  readonly id: string;
  readonly game_session_id: string;
  readonly country_profile_id: string;
  readonly event_key: string;
  readonly event_name: string;
  readonly event_type: string;
  readonly impact_summary: string;
  readonly stat_deltas: Record<string, unknown>;
  readonly source_snapshot_id: string | null;
  readonly result_snapshot_id: string | null;
  readonly applied_at: string;
  readonly created_at: string;
}

export interface PlayerCountryAssignmentRecord {
  readonly id: string;
  readonly game_session_id: string;
  readonly player_id: string;
  readonly country_profile_id: string;
  readonly status: PlayerCountryAssignmentStatus | string;
  readonly assignment_reason: PlayerCountryAssignmentReason | string;
  readonly assigned_at: string;
  readonly ended_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface PlayerCountryMigrationEventRecord {
  readonly id: string;
  readonly game_session_id: string;
  readonly player_id: string;
  readonly from_country_profile_id: string | null;
  readonly to_country_profile_id: string;
  readonly from_assignment_id: string | null;
  readonly to_assignment_id: string;
  readonly migration_reason: PlayerCountryAssignmentReason | string;
  readonly metadata: Record<string, unknown>;
  readonly migrated_at: string;
  readonly created_at: string;
}

export interface ActivePlayerCountryProfile {
  readonly assignment: PlayerCountryAssignmentRecord;
  readonly countryProfile: CountryProfileRecord;
  readonly latestEconomicSnapshot: CountryEconomicSnapshotRecord | null;
}

export interface CountryPricingInput {
  readonly countryProfileId: string;
  readonly countryCode: EcoNovariaCountryCode | string;
  readonly currencyCode: string;
  readonly simulationTick: number;
  readonly difficultyPreset: DifficultyPresetKey | string;
  readonly priceDifficultyModifier: number;
  readonly scarcityDifficultyModifier: number;
  readonly inflationRate: number;
  readonly costOfLivingIndex: number;
  readonly regionalPriceMultiplier: number;
  readonly supplyConstraintIndex: number;
  readonly importDependencyIndex: number;
  readonly taxRate: number;
  readonly subsidyRate: number;
  readonly exchangeRateIndex: number;
  readonly currencyStabilityIndex: number;
  readonly energySecurityIndex: number;
  readonly marketRiskIndex: number;
}

export interface ListCountryProfilesInput {
  readonly status?: CountryProfileStatus | null;
}

export interface ListDifficultyPolicyProfilesInput {
  readonly status?: DifficultyPolicyStatus | null;
}

export interface GetGameDifficultyPolicySettingsInput {
  readonly gameSessionId: string;
}

export interface GetGameCountryEconomicBaselineSettingsInput {
  readonly gameSessionId: string;
}

export interface SaveGamePresetDifficultyPolicySettingsInput {
  readonly gameSessionId: string;
  readonly difficultyPolicyProfileId: string;
  readonly difficultyPreset: SelectableDifficultyPresetKey | string;
  readonly priceModifier: number;
  readonly eventVolatilityModifier: number;
  readonly scarcityModifier: number;
  readonly incomeModifier: number;
  readonly tradeModifier: number;
  readonly creditModifier: number;
  readonly metadata?: Record<string, unknown> | null;
}

export interface SaveGameCustomDifficultyPolicySettingsInput {
  readonly gameSessionId: string;
  readonly customLabel: string;
  readonly priceModifier: number;
  readonly eventVolatilityModifier: number;
  readonly scarcityModifier: number;
  readonly incomeModifier: number;
  readonly tradeModifier: number;
  readonly creditModifier: number;
  readonly metadata?: Record<string, unknown> | null;
}

export type SaveGameDifficultyPolicySettingsInput =
  | SaveGamePresetDifficultyPolicySettingsInput
  | SaveGameCustomDifficultyPolicySettingsInput;

export interface SaveGameCountryEconomicBaselineSettingsInput {
  readonly gameSessionId: string;
  readonly source: GameEconomicBaselineSource | string;
  readonly customLabel?: string | null;
  readonly realGdpIndex: number;
  readonly gdpGrowthRate: number;
  readonly inflationRate: number;
  readonly unemploymentRate: number;
  readonly interestRate: number;
  readonly consumerConfidenceIndex: number;
  readonly businessConfidenceIndex: number;
  readonly costOfLivingIndex: number;
  readonly regionalPriceMultiplier: number;
  readonly supplyConstraintIndex: number;
  readonly importDependencyIndex: number;
  readonly taxRate: number;
  readonly subsidyRate: number;
  readonly exchangeRateIndex: number;
  readonly currencyStabilityIndex: number;
  readonly tradeBalanceIndex: number;
  readonly exportStrengthIndex: number;
  readonly marketRiskIndex: number;
  readonly politicalStabilityIndex: number;
  readonly infrastructureIndex: number;
  readonly energySecurityIndex: number;
  readonly metadata?: Record<string, unknown> | null;
}

export interface GetActivePlayerCountryInput {
  readonly gameSessionId: string;
  readonly playerId: string;
}

export interface GetLatestCountryEconomicSnapshotInput {
  readonly gameSessionId: string;
  readonly countryProfileId: string;
}

export interface AssignPlayerCountryInput {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly countryProfileId: string;
  readonly assignedAtIso: string;
  readonly assignmentReason?: PlayerCountryAssignmentReason | string | null;
}

export interface ImmigratePlayerCountryInput {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly toCountryProfileId: string;
  readonly migratedAtIso: string;
  readonly migrationReason: PlayerCountryAssignmentReason | string;
  readonly metadata?: Record<string, unknown> | null;
}

export interface InitializeCountryEconomicSnapshotsInput {
  readonly gameSessionId: string;
  readonly simulationTick?: number | null;
  readonly snapshotLabel?: string | null;
  readonly requestMetadata?: Record<string, unknown> | null;
}

export interface InitializeCountryEconomicSnapshotsRpcArgs {
  readonly p_game_session_id: string;
  readonly p_simulation_tick?: number;
  readonly p_snapshot_label?: string | null;
  readonly p_request_metadata?: Record<string, unknown>;
}

export interface InitializeCountryEconomicSnapshotsRpcRow {
  readonly country_profile_id: string;
  readonly snapshot_id: string;
  readonly simulation_tick: number;
}

export interface CountryProfileRepository {
  listCountryProfiles(input?: ListCountryProfilesInput): Promise<readonly CountryProfileRecord[]>;
  listDifficultyPolicyProfiles(
    input?: ListDifficultyPolicyProfilesInput,
  ): Promise<readonly DifficultyPolicyProfileRecord[]>;
  getGameDifficultyPolicySettings(
    input: GetGameDifficultyPolicySettingsInput,
  ): Promise<GameDifficultyPolicySettingsRecord | null>;
  saveGameDifficultyPolicySettings(
    input: SaveGameDifficultyPolicySettingsInput,
  ): Promise<GameDifficultyPolicySettingsRecord>;
  getGameCountryEconomicBaselineSettings(
    input: GetGameCountryEconomicBaselineSettingsInput,
  ): Promise<GameCountryEconomicBaselineSettingsRecord | null>;
  saveGameCountryEconomicBaselineSettings(
    input: SaveGameCountryEconomicBaselineSettingsInput,
  ): Promise<GameCountryEconomicBaselineSettingsRecord>;
  getActivePlayerCountry(input: GetActivePlayerCountryInput): Promise<ActivePlayerCountryProfile | null>;
  getLatestEconomicSnapshot(
    input: GetLatestCountryEconomicSnapshotInput,
  ): Promise<CountryEconomicSnapshotRecord | null>;
  initializeEconomicSnapshotsForGame(
    input: InitializeCountryEconomicSnapshotsInput,
  ): Promise<readonly InitializeCountryEconomicSnapshotsRpcRow[]>;
}

export const ECO_NOVARIA_COUNTRY_CODES: readonly EcoNovariaCountryCode[] = [
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
];

export const SELECTABLE_DIFFICULTY_PRESET_KEYS: readonly SelectableDifficultyPresetKey[] = [
  "easy",
  "standard",
  "moderate",
  "hard",
  "insane",
];

export const DIFFICULTY_SNAPSHOT_PRESET_KEYS: readonly DifficultyPresetKey[] = [
  ...SELECTABLE_DIFFICULTY_PRESET_KEYS,
  "custom",
];

export const DIFFICULTY_MODIFIER_MIN = 0.5;
export const DIFFICULTY_MODIFIER_MAX = 2;

export const DIFFICULTY_MODIFIER_FIELDS = [
  "priceModifier",
  "eventVolatilityModifier",
  "scarcityModifier",
  "incomeModifier",
  "tradeModifier",
  "creditModifier",
] as const;

export type DifficultyModifierField = (typeof DIFFICULTY_MODIFIER_FIELDS)[number];

export const COUNTRY_ECONOMIC_BASELINE_LIMITS = {
  realGdpIndex: { min: 50, max: 200 },
  gdpGrowthRate: { min: -0.25, max: 0.5 },
  inflationRate: { min: -0.05, max: 0.5 },
  unemploymentRate: { min: 0, max: 0.5 },
  interestRate: { min: 0, max: 0.5 },
  consumerConfidenceIndex: { min: 25, max: 200 },
  businessConfidenceIndex: { min: 25, max: 200 },
  costOfLivingIndex: { min: 0.5, max: 2 },
  regionalPriceMultiplier: { min: 0.5, max: 2 },
  supplyConstraintIndex: { min: 0.5, max: 2 },
  importDependencyIndex: { min: 0.5, max: 2 },
  taxRate: { min: 0, max: 0.5 },
  subsidyRate: { min: 0, max: 0.5 },
  exchangeRateIndex: { min: 0.5, max: 2 },
  currencyStabilityIndex: { min: 0.5, max: 2 },
  tradeBalanceIndex: { min: -100, max: 100 },
  exportStrengthIndex: { min: 0.5, max: 2 },
  marketRiskIndex: { min: 0.5, max: 2 },
  politicalStabilityIndex: { min: 0.5, max: 2 },
  infrastructureIndex: { min: 0.5, max: 2 },
  energySecurityIndex: { min: 0.5, max: 2 },
} as const;

export type CountryEconomicBaselineField = keyof typeof COUNTRY_ECONOMIC_BASELINE_LIMITS;

export function toCountryProfileDto(record: CountryProfileRecord): CountryProfileDto {
  return {
    id: record.id,
    countryCode: record.country_code,
    countryName: record.country_name,
    capitalName: record.capital_name,
    currencyCode: record.currency_code,
    status: record.status,
    metadata: record.metadata,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export function toCountryPricingInput(
  countryProfile: CountryProfileRecord,
  economicSnapshot: CountryEconomicSnapshotRecord,
): CountryPricingInput {
  return {
    countryProfileId: countryProfile.id,
    countryCode: countryProfile.country_code,
    currencyCode: countryProfile.currency_code,
    simulationTick: economicSnapshot.simulation_tick,
    difficultyPreset: economicSnapshot.difficulty_preset,
    priceDifficultyModifier: Number(economicSnapshot.price_difficulty_modifier),
    scarcityDifficultyModifier: Number(economicSnapshot.scarcity_difficulty_modifier),
    inflationRate: Number(economicSnapshot.inflation_rate),
    costOfLivingIndex: Number(economicSnapshot.cost_of_living_index),
    regionalPriceMultiplier: Number(economicSnapshot.regional_price_multiplier),
    supplyConstraintIndex: Number(economicSnapshot.supply_constraint_index),
    importDependencyIndex: Number(economicSnapshot.import_dependency_index),
    taxRate: Number(economicSnapshot.tax_rate),
    subsidyRate: Number(economicSnapshot.subsidy_rate),
    exchangeRateIndex: Number(economicSnapshot.exchange_rate_index),
    currencyStabilityIndex: Number(economicSnapshot.currency_stability_index),
    energySecurityIndex: Number(economicSnapshot.energy_security_index),
    marketRiskIndex: Number(economicSnapshot.market_risk_index),
  };
}
