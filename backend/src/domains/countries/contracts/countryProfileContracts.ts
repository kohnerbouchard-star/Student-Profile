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
  readonly inflation_rate: number;
  readonly cost_of_living_index: number;
  readonly regional_price_multiplier: number;
  readonly supply_constraint_index: number;
  readonly market_risk_index: number;
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
  readonly inflationRate: number;
  readonly costOfLivingIndex: number;
  readonly regionalPriceMultiplier: number;
  readonly supplyConstraintIndex: number;
  readonly marketRiskIndex: number;
  readonly status: CountryProfileStatus | string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
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
}

export interface CountryPricingInput {
  readonly countryProfileId: string;
  readonly countryCode: EcoNovariaCountryCode | string;
  readonly currencyCode: string;
  readonly inflationRate: number;
  readonly costOfLivingIndex: number;
  readonly regionalPriceMultiplier: number;
  readonly supplyConstraintIndex: number;
  readonly marketRiskIndex: number;
}

export interface ListCountryProfilesInput {
  readonly status?: CountryProfileStatus | null;
}

export interface GetActivePlayerCountryInput {
  readonly gameSessionId: string;
  readonly playerId: string;
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
    inflationRate: Number(record.inflation_rate),
    costOfLivingIndex: Number(record.cost_of_living_index),
    regionalPriceMultiplier: Number(record.regional_price_multiplier),
    supplyConstraintIndex: Number(record.supply_constraint_index),
    marketRiskIndex: Number(record.market_risk_index),
    status: record.status,
    metadata: record.metadata,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export function toCountryPricingInput(record: CountryProfileRecord): CountryPricingInput {
  return {
    countryProfileId: record.id,
    countryCode: record.country_code,
    currencyCode: record.currency_code,
    inflationRate: Number(record.inflation_rate),
    costOfLivingIndex: Number(record.cost_of_living_index),
    regionalPriceMultiplier: Number(record.regional_price_multiplier),
    supplyConstraintIndex: Number(record.supply_constraint_index),
    marketRiskIndex: Number(record.market_risk_index),
  };
}
