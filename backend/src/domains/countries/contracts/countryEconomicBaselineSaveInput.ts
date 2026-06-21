import type { GameEconomicBaselineSource } from "./countryEconomicBaselineTypes.ts";

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
