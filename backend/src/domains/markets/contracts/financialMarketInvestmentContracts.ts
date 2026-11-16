import type {
  FinancialMarketBusinessDayConvention,
  FinancialMarketCouponFrequency,
  FinancialMarketCouponType,
  FinancialMarketDayCountConvention,
  FinancialMarketDefinitionStatus,
  FinancialMarketPublicId,
  FinancialMarketSourceIdentity,
  FinancialMarketWeightingMethod,
} from "./financialMarketContracts.ts";
export interface FinancialMarketBenchmarkDefinition
  extends FinancialMarketSourceIdentity {
  readonly benchmarkPublicId: FinancialMarketPublicId;
  readonly administratorIssuerPublicId: FinancialMarketPublicId;
  readonly displayName: string;
  readonly benchmarkType:
    | "broad_market"
    | "country"
    | "sector"
    | "industry"
    | "commodity"
    | "economic_reference";
  readonly quotationCurrencyCode: string;
  readonly methodologyPublicId: FinancialMarketPublicId;
  readonly tradable: false;
  readonly status: FinancialMarketDefinitionStatus;
}

export interface FinancialMarketIndexMethodologyDefinition
  extends FinancialMarketSourceIdentity {
  readonly methodologyPublicId: FinancialMarketPublicId;
  readonly weightingMethod: FinancialMarketWeightingMethod;
  readonly eligibilityRuleVersion: string;
  readonly baseDate: string;
  readonly baseValue: string;
  readonly initialDivisor: string;
  readonly rebalanceRulePublicId: FinancialMarketPublicId;
  readonly continuityRulePublicId: FinancialMarketPublicId;
  readonly maximumConstituentWeight: number;
  readonly status: FinancialMarketDefinitionStatus;
}

export interface FinancialMarketIndexConstituentDefinition
  extends FinancialMarketSourceIdentity {
  readonly indexPublicId: FinancialMarketPublicId;
  readonly componentInstrumentPublicId: FinancialMarketPublicId;
  readonly targetWeight: number | null;
  readonly effectiveAt: string;
  readonly retiredAt: string | null;
}

export interface FinancialMarketFundDefinition
  extends FinancialMarketSourceIdentity {
  readonly fundPublicId: FinancialMarketPublicId;
  readonly administratorIssuerPublicId: FinancialMarketPublicId;
  readonly benchmarkPublicId: FinancialMarketPublicId | null;
  readonly expenseRatioAnnual: number;
  readonly rebalanceRulePublicId: FinancialMarketPublicId;
  readonly navMethodologyPublicId: FinancialMarketPublicId;
  readonly trackingDifferenceAnnual: number;
  readonly status: FinancialMarketDefinitionStatus;
}

export interface FinancialMarketFundHoldingDefinition
  extends FinancialMarketSourceIdentity {
  readonly fundPublicId: FinancialMarketPublicId;
  readonly componentPublicId: FinancialMarketPublicId;
  readonly componentKind: "instrument" | "benchmark";
  readonly targetWeight: number;
  readonly effectiveAt: string;
  readonly retiredAt: string | null;
}

export interface FinancialMarketTrustDefinition
  extends FinancialMarketSourceIdentity {
  readonly trustPublicId: FinancialMarketPublicId;
  readonly administratorIssuerPublicId: FinancialMarketPublicId;
  readonly compositionVersion: string;
  readonly distributionPolicyPublicId: FinancialMarketPublicId;
  readonly navMethodologyPublicId: FinancialMarketPublicId;
  readonly benchmarkPublicId: FinancialMarketPublicId | null;
  readonly status: FinancialMarketDefinitionStatus;
}

export interface FinancialMarketBondDefinition
  extends FinancialMarketSourceIdentity {
  readonly bondPublicId: FinancialMarketPublicId;
  readonly instrumentPublicId: FinancialMarketPublicId;
  readonly issuerPublicId: FinancialMarketPublicId;
  readonly bondKind: "corporate" | "sovereign" | "agency";
  readonly issueDate: string;
  readonly settlementDate: string;
  readonly maturityDate: string;
  readonly faceValue: string;
  readonly denominationCurrencyCode: string;
  readonly couponType: FinancialMarketCouponType;
  readonly couponRateAnnual: number;
  readonly couponFrequency: FinancialMarketCouponFrequency;
  readonly dayCountConvention: FinancialMarketDayCountConvention;
  readonly businessDayConvention: FinancialMarketBusinessDayConvention;
  readonly creditRating: string;
  readonly callable: boolean;
  readonly callSchedulePublicId: FinancialMarketPublicId | null;
  readonly recoveryPolicyPublicId: FinancialMarketPublicId;
  readonly status: FinancialMarketDefinitionStatus;
}

export interface FinancialMarketCouponScheduleEntry {
  readonly couponSchedulePublicId: FinancialMarketPublicId;
  readonly bondPublicId: FinancialMarketPublicId;
  readonly sequence: number;
  readonly accrualStartDate: string;
  readonly accrualEndDate: string;
  readonly paymentDate: string;
  readonly couponAmountPerFaceUnit: string;
  readonly principalAmountPerFaceUnit: string;
  readonly sourceVersion: string;
}

export interface FinancialMarketPreferredEquityDefinition
  extends FinancialMarketSourceIdentity {
  readonly preferredPublicId: FinancialMarketPublicId;
  readonly instrumentPublicId: FinancialMarketPublicId;
  readonly liquidationPreferencePerUnit: string;
  readonly dividendRateAnnual: number;
  readonly cumulative: boolean;
  readonly seniorityRank: number;
  readonly conversionPolicyPublicId: FinancialMarketPublicId | null;
  readonly status: FinancialMarketDefinitionStatus;
}

export interface FinancialMarketConversionPolicyDefinition
  extends FinancialMarketSourceIdentity {
  readonly conversionPolicyPublicId: FinancialMarketPublicId;
  readonly sourceInstrumentPublicId: FinancialMarketPublicId;
  readonly targetCommonInstrumentPublicId: FinancialMarketPublicId;
  readonly conversionRatio: string;
  readonly minimumSourceQuantity: string;
  readonly conversionIncrement: string;
  readonly eligibleAt: string;
  readonly complexPricingSupported: false;
  readonly status: FinancialMarketDefinitionStatus;
}
