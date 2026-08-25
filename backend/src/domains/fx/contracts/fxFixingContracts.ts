export const FX_NUMERAIRE_CURRENCY_CODE = "ECO" as const;

export const FX_NATIONAL_CURRENCY_DEFINITIONS = [
  { currencyCode: "NRC", countryCode: "NORTHREACH" },
  { currencyCode: "YRC", countryCode: "YRETHIA" },
  { currencyCode: "THD", countryCode: "THALORIS" },
  { currencyCode: "SLV", countryCode: "SOLVEND" },
  { currencyCode: "ELD", countryCode: "ELDORAN" },
  { currencyCode: "VAL", countryCode: "VALERION" },
  { currencyCode: "LUM", countryCode: "LUMENOR" },
  { currencyCode: "SYN", countryCode: "SYNDALIS" },
  { currencyCode: "XAL", countryCode: "XALVORIA" },
  { currencyCode: "DRV", countryCode: "DRAVENLOK" },
] as const;

export type FxNationalCurrencyCode =
  typeof FX_NATIONAL_CURRENCY_DEFINITIONS[number]["currencyCode"];
export type FxCountryCode =
  typeof FX_NATIONAL_CURRENCY_DEFINITIONS[number]["countryCode"];
export type FxCurrencyCode =
  | typeof FX_NUMERAIRE_CURRENCY_CODE
  | FxNationalCurrencyCode;

/** A base-10 decimal without exponent notation. */
export type FxDecimal = string;

export interface FxFixingCurrencyInput {
  readonly currencyCode: FxNationalCurrencyCode;
  readonly countryCode: FxCountryCode;
  readonly previousUnitsPerEco: FxDecimal;
  readonly snapshotId: string;
  readonly snapshotSequence: number;
  readonly realGdpIndex: FxDecimal;
  readonly gdpGrowthRate: FxDecimal;
  readonly inflationRate: FxDecimal;
  readonly interestRate: FxDecimal;
  readonly consumerConfidenceIndex: FxDecimal;
  readonly businessConfidenceIndex: FxDecimal;
  readonly importDependencyIndex: FxDecimal;
  readonly currencyStabilityIndex: FxDecimal;
  readonly tradeBalanceIndex: FxDecimal;
  readonly exportStrengthIndex: FxDecimal;
  readonly marketRiskIndex: FxDecimal;
  readonly politicalStabilityIndex: FxDecimal;
}

export interface FxFixingStoryShockInput {
  readonly shockId: string;
  readonly currencyCode: FxNationalCurrencyCode;
  /** Positive basis points mean depreciation against ECO. */
  readonly basisPoints: number;
}

export interface FxFixingPolicyParameters {
  readonly numeraireCurrencyCode: typeof FX_NUMERAIRE_CURRENCY_CODE;
  readonly gdp: {
    readonly capBasisPoints: number;
    readonly levelWeightBasisPoints: number;
    readonly growthWeightBasisPoints: number;
    readonly levelNormalizer: FxDecimal;
    readonly growthNormalizer: FxDecimal;
  };
  readonly inflation: {
    readonly capBasisPoints: number;
    readonly normalizer: FxDecimal;
  };
  readonly realInterest: {
    readonly capBasisPoints: number;
    readonly normalizer: FxDecimal;
  };
  readonly trade: {
    readonly capBasisPoints: number;
    readonly tradeBalanceWeightBasisPoints: number;
    readonly exportStrengthWeightBasisPoints: number;
    readonly inverseImportDependencyWeightBasisPoints: number;
    readonly tradeBalanceNormalizer: FxDecimal;
    readonly exportStrengthNormalizer: FxDecimal;
    readonly importDependencyNormalizer: FxDecimal;
  };
  readonly confidenceStability: {
    readonly capBasisPoints: number;
    readonly signalWeightBasisPoints: number;
    readonly confidenceNormalizer: FxDecimal;
    readonly indexNormalizer: FxDecimal;
  };
  /** Explicitly zero until a non-circular Economy/World authority exists. */
  readonly exchangeRateIndexWeightBasisPoints: 0;
  /** Explicitly zero until a canonical bilateral-trade authority exists. */
  readonly bilateralTradeExposureWeightBasisPoints: 0;
}

/** Immutable policy evidence resolved from the fixing's database policy row. */
export interface FxFixingPolicyInput {
  readonly fixingLocalTime: "08:00:00";
  readonly normalMovementCapBasisPoints: number;
  readonly crisisMovementCapBasisPoints: number;
  readonly parameters: FxFixingPolicyParameters;
}

export interface FxFixingEngineInput {
  readonly gameSessionId: string;
  readonly fixingLocalDate: string;
  readonly policyVersion: string;
  readonly policy: FxFixingPolicyInput;
  readonly currencies: readonly FxFixingCurrencyInput[];
  readonly storyShocks?: readonly FxFixingStoryShockInput[];
}

export interface FxFixingComponentBreakdown {
  /** Positive values mean depreciation, or more local units per ECO. */
  readonly gdpBasisPoints: number;
  readonly inflationBasisPoints: number;
  readonly realInterestBasisPoints: number;
  readonly tradeBasisPoints: number;
  readonly confidenceStabilityBasisPoints: number;
  readonly fundamentalBasisPoints: number;
  readonly storyBasisPoints: number;
  readonly finalBasisPoints: number;
}

export interface FxFixingCurrencyValue {
  readonly currencyCode: FxCurrencyCode;
  readonly countryCode: FxCountryCode | null;
  readonly snapshotId: string | null;
  readonly snapshotSequence: number | null;
  readonly previousUnitsPerEco: FxDecimal;
  readonly unitsPerEco: FxDecimal;
  readonly components: FxFixingComponentBreakdown;
  readonly appliedStoryShockIds: readonly string[];
}

export interface FxFixingEngineResult {
  readonly gameSessionId: string;
  readonly fixingLocalDate: string;
  readonly policyVersion: string;
  /** Stable validated calculation evidence; persistence uses the database-owned input digest. */
  readonly canonicalInputJson: string;
  /** ECO is first; national currencies then follow in currency-code order. */
  readonly values: readonly FxFixingCurrencyValue[];
}
