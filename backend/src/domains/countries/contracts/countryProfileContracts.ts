export type CountryProfileStatus = "active" | "disabled" | "archived";
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

export interface CountryEconomicSnapshotRecord {
  readonly id: string;
  readonly game_session_id: string;
  readonly country_profile_id: string;
  readonly simulation_tick: number;
  readonly snapshot_label: string | null;
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
  readonly inflationRate: number;
  readonly costOfLivingIndex: number;
  readonly regionalPriceMultiplier: number;
  readonly supplyConstraintIndex: number;
  readonly importDependencyIndex: number;
  readonly taxRate: number;
  readonly subsidyRate: number;
  readonly marketRiskIndex: number;
}

export interface ListCountryProfilesInput {
  readonly status?: CountryProfileStatus | null;
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
    inflationRate: Number(economicSnapshot.inflation_rate),
    costOfLivingIndex: Number(economicSnapshot.cost_of_living_index),
    regionalPriceMultiplier: Number(economicSnapshot.regional_price_multiplier),
    supplyConstraintIndex: Number(economicSnapshot.supply_constraint_index),
    importDependencyIndex: Number(economicSnapshot.import_dependency_index),
    taxRate: Number(economicSnapshot.tax_rate),
    subsidyRate: Number(economicSnapshot.subsidy_rate),
    marketRiskIndex: Number(economicSnapshot.market_risk_index),
  };
}
