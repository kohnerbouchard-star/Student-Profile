export const FINANCIAL_MARKET_CONTRACT_VERSION = "financial-markets.v1" as const;

export const FINANCIAL_MARKET_PUBLIC_ID_PATTERN =
  /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+\.v[1-9][0-9]*$/;

export type FinancialMarketPublicId = string;
export type FinancialMarketCountryCode =
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

export type FinancialMarketAssetClass =
  | "equity"
  | "fixed_income"
  | "fund"
  | "trust"
  | "index"
  | "commodity_reference"
  | "economic_benchmark";

export type FinancialMarketInstrumentType =
  | "common_equity"
  | "preferred_equity"
  | "convertible_preferred"
  | "corporate_bond"
  | "sovereign_bond"
  | "agency_bond"
  | "etf"
  | "listed_fund"
  | "listed_trust"
  | "broad_market_index"
  | "country_index"
  | "sector_index"
  | "industry_index"
  | "commodity_benchmark"
  | "economic_reference_benchmark";

export type FinancialMarketIssuerType =
  | "corporation"
  | "government"
  | "agency"
  | "fund_administrator"
  | "trust_administrator"
  | "index_administrator"
  | "exchange_operator"
  | "commodity_benchmark_administrator";

export type FinancialMarketDefinitionStatus =
  | "draft"
  | "reviewed"
  | "approved_inactive"
  | "retired";

export type FinancialMarketListingStatus =
  | "inactive"
  | "active"
  | "suspended"
  | "delisted";

export type FinancialMarketOrderSide = "buy" | "sell";
export type FinancialMarketOrderType = "market" | "limit";
export type FinancialMarketOrderStatus =
  | "pending_validation"
  | "rejected"
  | "open"
  | "partially_filled"
  | "filled"
  | "cancel_pending"
  | "cancelled"
  | "expired";

export type FinancialMarketReservationKind = "cash" | "asset";
export type FinancialMarketReservationStatus =
  | "active"
  | "partially_consumed"
  | "consumed"
  | "released";

export type FinancialMarketCreditEventKind =
  | "upgrade"
  | "downgrade"
  | "watch_positive"
  | "watch_negative"
  | "default"
  | "recovery";

export type FinancialMarketCorporateActionKind =
  | "cash_dividend"
  | "preferred_dividend"
  | "split"
  | "reverse_split"
  | "conversion"
  | "coupon"
  | "maturity_redemption"
  | "default_recovery"
  | "constituent_addition"
  | "constituent_removal"
  | "fund_rebalance"
  | "trust_distribution";

export type FinancialMarketWeightingMethod =
  | "market_cap"
  | "float_adjusted_market_cap"
  | "equal_weight"
  | "price_weight"
  | "fundamental_weight"
  | "fixed_weight";

export type FinancialMarketCouponType = "fixed" | "zero_coupon";
export type FinancialMarketCouponFrequency =
  | "annual"
  | "semiannual"
  | "quarterly";
export type FinancialMarketDayCountConvention =
  | "actual_365"
  | "actual_360"
  | "thirty_360";
export type FinancialMarketBusinessDayConvention =
  | "following"
  | "modified_following"
  | "preceding";

export type FinancialMarketSettlementConvention =
  | "T0"
  | "T1"
  | "T2";

export interface FinancialMarketSourceIdentity {
  readonly sourceVersion: string;
  readonly sourceChecksumSha256: string;
}

export interface FinancialMarketAuditMetadata {
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export interface FinancialMarketIssuerDefinition
  extends FinancialMarketSourceIdentity {
  readonly issuerPublicId: FinancialMarketPublicId;
  readonly legalName: string;
  readonly displayName: string;
  readonly issuerType: FinancialMarketIssuerType;
  readonly homeCountryCode: FinancialMarketCountryCode;
  readonly reportingCurrencyCode: string;
  readonly sectorPublicId: FinancialMarketPublicId | null;
  readonly industryPublicId: FinancialMarketPublicId | null;
  readonly riskProfilePublicId: FinancialMarketPublicId;
  readonly eventExposureProfilePublicId: FinancialMarketPublicId;
  readonly status: FinancialMarketDefinitionStatus;
  readonly audit: FinancialMarketAuditMetadata;
}

export interface FinancialMarketExchangeDefinition
  extends FinancialMarketSourceIdentity {
  readonly exchangePublicId: FinancialMarketPublicId;
  readonly code: string;
  readonly displayName: string;
  readonly countryCode: FinancialMarketCountryCode;
  readonly timezone: string;
  readonly calendarPolicyPublicId: FinancialMarketPublicId;
  readonly tradingRulePolicyPublicId: FinancialMarketPublicId;
  readonly supportedAssetClasses: readonly FinancialMarketAssetClass[];
  readonly status: FinancialMarketDefinitionStatus;
}

export interface FinancialMarketSectorDefinition
  extends FinancialMarketSourceIdentity {
  readonly sectorPublicId: FinancialMarketPublicId;
  readonly displayName: string;
  readonly status: FinancialMarketDefinitionStatus;
}

export interface FinancialMarketIndustryDefinition
  extends FinancialMarketSourceIdentity {
  readonly industryPublicId: FinancialMarketPublicId;
  readonly sectorPublicId: FinancialMarketPublicId;
  readonly displayName: string;
  readonly status: FinancialMarketDefinitionStatus;
}

export interface FinancialMarketInstrumentDefinition
  extends FinancialMarketSourceIdentity {
  readonly instrumentPublicId: FinancialMarketPublicId;
  readonly issuerPublicId: FinancialMarketPublicId;
  readonly name: string;
  readonly assetClass: FinancialMarketAssetClass;
  readonly instrumentType: FinancialMarketInstrumentType;
  readonly countryCode: FinancialMarketCountryCode;
  readonly denominationCurrencyCode: string;
  readonly sectorPublicId: FinancialMarketPublicId | null;
  readonly industryPublicId: FinancialMarketPublicId | null;
  readonly riskClass: string;
  readonly typeContractPublicId: FinancialMarketPublicId;
  readonly status: FinancialMarketDefinitionStatus;
  readonly activationAuthorized: false;
  readonly effectiveAt: string | null;
  readonly retiredAt: string | null;
}

export interface FinancialMarketListingDefinition
  extends FinancialMarketSourceIdentity {
  readonly listingPublicId: FinancialMarketPublicId;
  readonly instrumentPublicId: FinancialMarketPublicId;
  readonly exchangePublicId: FinancialMarketPublicId;
  readonly symbol: string;
  readonly quotationCurrencyCode: string;
  readonly minimumOrderQuantity: string;
  readonly quantityIncrement: string;
  readonly priceIncrement: string;
  readonly settlementConvention: FinancialMarketSettlementConvention;
  readonly status: FinancialMarketDefinitionStatus;
  readonly effectiveAt: string;
  readonly retiredAt: string | null;
}

export interface FinancialMarketCommodityDefinition
  extends FinancialMarketSourceIdentity {
  readonly commodityPublicId: FinancialMarketPublicId;
  readonly displayName: string;
  readonly unit: string;
  readonly quotationCurrencyCode: string;
  readonly benchmarkMethodologyPublicId: FinancialMarketPublicId;
  readonly supplyDriverKeys: readonly string[];
  readonly demandDriverKeys: readonly string[];
  readonly countryExposure: Readonly<Record<FinancialMarketCountryCode, number>>;
  readonly eventExposureProfilePublicId: FinancialMarketPublicId;
  readonly minimumAnnualizedVolatility: number;
  readonly maximumAnnualizedVolatility: number;
  readonly carryingEffectPolicyPublicId: FinancialMarketPublicId | null;
  readonly physicalDeliverySupported: false;
  readonly status: FinancialMarketDefinitionStatus;
}

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

export interface FinancialMarketIncomeStatement {
  readonly revenue: string;
  readonly costOfRevenue: string;
  readonly operatingExpenses: string;
  readonly operatingIncome: string;
  readonly interestExpense: string;
  readonly taxExpense: string;
  readonly netIncome: string;
}

export interface FinancialMarketBalanceSheet {
  readonly cash: string;
  readonly receivables: string;
  readonly inventory: string;
  readonly propertyPlantEquipment: string;
  readonly otherAssets: string;
  readonly shortTermDebt: string;
  readonly longTermDebt: string;
  readonly payables: string;
  readonly otherLiabilities: string;
  readonly contributedCapital: string;
  readonly retainedEarnings: string;
}

export interface FinancialMarketCashFlowStatement {
  readonly operatingCashFlow: string;
  readonly investingCashFlow: string;
  readonly financingCashFlow: string;
  readonly capitalExpenditure: string;
  readonly netCashChange: string;
}

export interface FinancialMarketIssuerStatementPeriod {
  readonly statementPublicId: FinancialMarketPublicId;
  readonly issuerPublicId: FinancialMarketPublicId;
  readonly gamePublicId: FinancialMarketPublicId;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly reportingCurrencyCode: string;
  readonly incomeStatement: FinancialMarketIncomeStatement;
  readonly balanceSheet: FinancialMarketBalanceSheet;
  readonly cashFlowStatement: FinancialMarketCashFlowStatement;
  readonly sharesOutstanding: string;
  readonly bookValue: string;
  readonly generatorVersion: string;
  readonly inputDigestSha256: string;
  readonly generatedAt: string;
}

export interface FinancialMarketYieldCurvePoint {
  readonly tenorDays: number;
  readonly continuouslyCompoundedZeroRate: number;
}

export interface FinancialMarketYieldCurveVersion {
  readonly curvePublicId: FinancialMarketPublicId;
  readonly gamePublicId: FinancialMarketPublicId;
  readonly countryCode: FinancialMarketCountryCode;
  readonly currencyCode: string;
  readonly observedAt: string;
  readonly version: number;
  readonly riskFreeBaseline: number;
  readonly liquidityAdjustment: number;
  readonly eventAdjustment: number;
  readonly points: readonly FinancialMarketYieldCurvePoint[];
  readonly inputDigestSha256: string;
}

export interface FinancialMarketCreditEvent {
  readonly creditEventPublicId: FinancialMarketPublicId;
  readonly gamePublicId: FinancialMarketPublicId;
  readonly issuerPublicId: FinancialMarketPublicId;
  readonly kind: FinancialMarketCreditEventKind;
  readonly priorRating: string | null;
  readonly nextRating: string | null;
  readonly effectiveAt: string;
  readonly recoveryRate: number | null;
  readonly idempotencyKey: string;
  readonly sourceEventPublicId: FinancialMarketPublicId | null;
}

export interface FinancialMarketCorporateAction {
  readonly corporateActionPublicId: FinancialMarketPublicId;
  readonly gamePublicId: FinancialMarketPublicId;
  readonly instrumentPublicId: FinancialMarketPublicId;
  readonly kind: FinancialMarketCorporateActionKind;
  readonly recordAt: string;
  readonly effectiveAt: string;
  readonly payableAt: string | null;
  readonly termsVersion: string;
  readonly idempotencyKey: string;
}

export interface FinancialMarketExchangeCalendarPolicy
  extends FinancialMarketSourceIdentity {
  readonly calendarPolicyPublicId: FinancialMarketPublicId;
  readonly timezone: string;
  readonly weeklySessions: readonly FinancialMarketWeeklySession[];
  readonly holidayDates: readonly string[];
  readonly earlyCloses: readonly FinancialMarketEarlyClose[];
  readonly status: FinancialMarketDefinitionStatus;
}

export interface FinancialMarketWeeklySession {
  readonly isoWeekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly opensAtLocal: string;
  readonly closesAtLocal: string;
}

export interface FinancialMarketEarlyClose {
  readonly date: string;
  readonly closesAtLocal: string;
}

export interface FinancialMarketTradingRulePolicy
  extends FinancialMarketSourceIdentity {
  readonly tradingRulePolicyPublicId: FinancialMarketPublicId;
  readonly transactionFeeRate: number;
  readonly exchangeFeeRate: number;
  readonly fixedFee: string;
  readonly minimumOrderQuantity: string;
  readonly quantityIncrement: string;
  readonly priceIncrement: string;
  readonly settlementConvention: FinancialMarketSettlementConvention;
  readonly shortSellingSupported: false;
  readonly derivativesSupported: false;
  readonly status: FinancialMarketDefinitionStatus;
}

export interface FinancialMarketOrderCommand {
  readonly gameSessionId: string;
  readonly playerSessionId: string;
  readonly listingPublicId: FinancialMarketPublicId;
  readonly side: FinancialMarketOrderSide;
  readonly orderType: FinancialMarketOrderType;
  readonly quantity: string;
  readonly limitPrice: string | null;
  readonly reviewedQuoteVersion: number;
  readonly reviewedPrice: string;
  readonly expiresAt: string | null;
  readonly idempotencyKey: string;
  readonly requestDigestSha256: string;
}

export interface FinancialMarketOrderRecord {
  readonly orderPublicId: FinancialMarketPublicId;
  readonly listingPublicId: FinancialMarketPublicId;
  readonly side: FinancialMarketOrderSide;
  readonly orderType: FinancialMarketOrderType;
  readonly originalQuantity: string;
  readonly remainingQuantity: string;
  readonly cumulativeFilledQuantity: string;
  readonly limitPrice: string | null;
  readonly averageFillPrice: string | null;
  readonly status: FinancialMarketOrderStatus;
  readonly quoteVersion: number;
  readonly feePolicyPublicId: FinancialMarketPublicId;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly terminalAt: string | null;
}

export interface FinancialMarketReservationRecord {
  readonly reservationPublicId: FinancialMarketPublicId;
  readonly orderPublicId: FinancialMarketPublicId;
  readonly kind: FinancialMarketReservationKind;
  readonly currencyCode: string | null;
  readonly instrumentPublicId: FinancialMarketPublicId | null;
  readonly originalAmount: string;
  readonly remainingAmount: string;
  readonly status: FinancialMarketReservationStatus;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly releasedAt: string | null;
}

export interface FinancialMarketFillRecord {
  readonly fillPublicId: FinancialMarketPublicId;
  readonly orderPublicId: FinancialMarketPublicId;
  readonly listingPublicId: FinancialMarketPublicId;
  readonly sequence: number;
  readonly quantity: string;
  readonly price: string;
  readonly grossValue: string;
  readonly quoteVersion: number;
  readonly executedAt: string;
  readonly idempotencyKey: string;
}

export interface FinancialMarketTradeRecord {
  readonly tradePublicId: FinancialMarketPublicId;
  readonly fillPublicId: FinancialMarketPublicId;
  readonly orderPublicId: FinancialMarketPublicId;
  readonly listingPublicId: FinancialMarketPublicId;
  readonly side: FinancialMarketOrderSide;
  readonly quantity: string;
  readonly price: string;
  readonly grossValue: string;
  readonly settlementDate: string;
  readonly createdAt: string;
}

export interface FinancialMarketFeeRecord {
  readonly feePublicId: FinancialMarketPublicId;
  readonly tradePublicId: FinancialMarketPublicId;
  readonly feePolicyPublicId: FinancialMarketPublicId;
  readonly feeKind: "transaction" | "exchange" | "fixed";
  readonly currencyCode: string;
  readonly amount: string;
  readonly createdAt: string;
}

export interface FinancialMarketHoldingDto {
  readonly instrumentPublicId: FinancialMarketPublicId;
  readonly listingPublicId: FinancialMarketPublicId | null;
  readonly displayName: string;
  readonly symbol: string | null;
  readonly assetClass: FinancialMarketAssetClass;
  readonly quantity: string;
  readonly availableQuantity: string;
  readonly averageCost: string;
  readonly currentValue: string;
  readonly accruedInterest: string;
  readonly unrealizedPnl: string;
  readonly realizedPnl: string;
  readonly quotationCurrencyCode: string;
  readonly valuationAt: string;
  readonly valuationVersion: number;
}

export interface FinancialMarketPortfolioDto {
  readonly asOf: string;
  readonly cash: readonly FinancialMarketCashBalanceDto[];
  readonly totalsByAssetClass: Readonly<
    Partial<Record<FinancialMarketAssetClass, string>>
  >;
  readonly totalValueByCurrency: Readonly<Record<string, string>>;
  readonly holdings: readonly FinancialMarketHoldingDto[];
}

export interface FinancialMarketCashBalanceDto {
  readonly currencyCode: string;
  readonly balance: string;
  readonly reserved: string;
  readonly available: string;
}

export interface FinancialMarketIssuerProfileDto {
  readonly issuerPublicId: FinancialMarketPublicId;
  readonly displayName: string;
  readonly issuerType: FinancialMarketIssuerType;
  readonly homeCountryCode: FinancialMarketCountryCode;
  readonly reportingCurrencyCode: string;
  readonly sectorPublicId: FinancialMarketPublicId | null;
  readonly industryPublicId: FinancialMarketPublicId | null;
  readonly riskLabel: string;
  readonly status: "active" | "inactive";
}

export interface FinancialMarketInstrumentDetailDto {
  readonly instrumentPublicId: FinancialMarketPublicId;
  readonly issuerPublicId: FinancialMarketPublicId;
  readonly displayName: string;
  readonly assetClass: FinancialMarketAssetClass;
  readonly instrumentType: FinancialMarketInstrumentType;
  readonly countryCode: FinancialMarketCountryCode;
  readonly denominationCurrencyCode: string;
  readonly listings: readonly FinancialMarketListingDto[];
  readonly status: "active" | "inactive" | "suspended" | "delisted";
}

export interface FinancialMarketListingDto {
  readonly listingPublicId: FinancialMarketPublicId;
  readonly exchangeCode: string;
  readonly symbol: string;
  readonly quotationCurrencyCode: string;
  readonly status: FinancialMarketListingStatus;
  readonly quote: FinancialMarketQuoteDto | null;
}

export interface FinancialMarketQuoteDto {
  readonly version: number;
  readonly lastPrice: string;
  readonly bidPrice: string | null;
  readonly askPrice: string | null;
  readonly observedAt: string;
  readonly staleAfter: string;
  readonly isStale: boolean;
}

export function isFinancialMarketPublicId(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= 160 &&
    FINANCIAL_MARKET_PUBLIC_ID_PATTERN.test(value);
}

export function assertFinancialMarketPublicId(
  value: unknown,
  fieldName: string,
): asserts value is string {
  if (!isFinancialMarketPublicId(value)) {
    throw new Error(`${fieldName} must be a valid financial-market public ID.`);
  }
}
