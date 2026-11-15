import type {
  FinancialMarketDefinitionStatus,
  FinancialMarketOrderSide,
  FinancialMarketOrderStatus,
  FinancialMarketOrderType,
  FinancialMarketPublicId,
  FinancialMarketReservationKind,
  FinancialMarketReservationStatus,
  FinancialMarketSettlementConvention,
  FinancialMarketSourceIdentity,
} from "./financialMarketContracts.ts";
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
