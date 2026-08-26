import {
  FX_NATIONAL_CURRENCY_DEFINITIONS,
  type FxCountryCode,
  type FxFixingCurrencyInput,
  type FxFixingStoryShockInput,
  type FxNationalCurrencyCode,
} from "../contracts/fxFixingContracts.ts";

export const DECIMAL_PLACES = 18;
export const SCALE = 10n ** BigInt(DECIMAL_PLACES);
export const MAX_NUMERIC_MAGNITUDE = 10n ** 38n - 1n;

export const FX_V1_STORAGE_ENVELOPE = Object.freeze({
  normal: 200,
  crisis: 1_500,
  gdp: 50,
  inflation: 45,
  realInterest: 30,
  trade: 40,
  confidenceStability: 35,
});

export const EXPECTED_COUNTRY_BY_CURRENCY = new Map<
  FxNationalCurrencyCode,
  FxCountryCode
>(
  FX_NATIONAL_CURRENCY_DEFINITIONS.map((definition) => [
    definition.currencyCode,
    definition.countryCode,
  ]),
);

export interface NormalizedCurrencyInput {
  readonly source: FxFixingCurrencyInput;
  readonly previousUnitsPerEco: bigint;
  readonly realGdpIndex: bigint;
  readonly gdpGrowthRate: bigint;
  readonly inflationRate: bigint;
  readonly interestRate: bigint;
  readonly consumerConfidenceIndex: bigint;
  readonly businessConfidenceIndex: bigint;
  readonly importDependencyIndex: bigint;
  readonly currencyStabilityIndex: bigint;
  readonly tradeBalanceIndex: bigint;
  readonly exportStrengthIndex: bigint;
  readonly marketRiskIndex: bigint;
  readonly politicalStabilityIndex: bigint;
}

export interface NormalizedInput {
  readonly gameSessionId: string;
  readonly fixingLocalDate: string;
  readonly policyVersion: string;
  readonly policy: NormalizedPolicy;
  readonly currencies: readonly NormalizedCurrencyInput[];
  readonly storyShocks: readonly FxFixingStoryShockInput[];
  readonly canonicalInputJson: string;
}

export interface NormalizedPolicy {
  readonly fixingLocalTime: "08:00:00";
  readonly normalMovementCapBasisPoints: number;
  readonly crisisMovementCapBasisPoints: number;
  readonly gdp: {
    readonly capBasisPoints: number;
    readonly levelWeightBasisPoints: number;
    readonly growthWeightBasisPoints: number;
    readonly levelNormalizer: bigint;
    readonly growthNormalizer: bigint;
  };
  readonly inflation: { readonly capBasisPoints: number; readonly normalizer: bigint };
  readonly realInterest: { readonly capBasisPoints: number; readonly normalizer: bigint };
  readonly trade: {
    readonly capBasisPoints: number;
    readonly tradeBalanceWeightBasisPoints: number;
    readonly exportStrengthWeightBasisPoints: number;
    readonly inverseImportDependencyWeightBasisPoints: number;
    readonly tradeBalanceNormalizer: bigint;
    readonly exportStrengthNormalizer: bigint;
    readonly importDependencyNormalizer: bigint;
  };
  readonly confidenceStability: {
    readonly capBasisPoints: number;
    readonly signalWeightBasisPoints: number;
    readonly confidenceNormalizer: bigint;
    readonly indexNormalizer: bigint;
  };
  readonly exchangeRateIndexWeightBasisPoints: 0;
  readonly bilateralTradeExposureWeightBasisPoints: 0;
}

export interface MacroMedians {
  readonly realGdpIndex: bigint;
  readonly gdpGrowthRate: bigint;
  readonly inflationRate: bigint;
  readonly realInterestRate: bigint;
  readonly consumerConfidenceIndex: bigint;
  readonly businessConfidenceIndex: bigint;
  readonly importDependencyIndex: bigint;
  readonly currencyStabilityIndex: bigint;
  readonly tradeBalanceIndex: bigint;
  readonly exportStrengthIndex: bigint;
  readonly marketRiskIndex: bigint;
  readonly politicalStabilityIndex: bigint;
}
