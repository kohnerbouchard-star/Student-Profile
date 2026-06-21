export type EconomicBaselineStatus = "active" | "disabled" | "archived";
export type GameEconomicBaselineSource = "default" | "custom";

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

export interface GetGameCountryEconomicBaselineSettingsInput {
  readonly gameSessionId: string;
}
