import type {
  FinancialMarketBondDefinition,
  FinancialMarketCouponScheduleEntry,
} from "../contracts/financialMarketContracts.ts";

export interface BondValuationInput {
  readonly bond: FinancialMarketBondDefinition;
  readonly settlementDate: string;
  readonly annualYield: number;
  readonly faceQuantity: string;
  readonly defaultState?: BondDefaultState | null;
}

export interface BondDefaultState {
  readonly defaultedAt: string;
  readonly recoveryRate: number;
  readonly recoveredAt: string | null;
}

export interface BondValuationResult {
  readonly settlementDate: string;
  readonly faceQuantity: string;
  readonly annualYield: number;
  readonly accruedInterest: string;
  readonly cleanPrice: string;
  readonly dirtyPrice: string;
  readonly principalValue: string;
  readonly remainingCashFlows: readonly BondCashFlow[];
  readonly defaulted: boolean;
  readonly recoveryValue: string | null;
}

export interface BondCashFlow {
  readonly cashFlowPublicId: string;
  readonly bondPublicId: string;
  readonly kind: "coupon" | "maturity" | "recovery";
  readonly entitlementDate: string;
  readonly paymentDate: string;
  readonly amount: string;
  readonly currencyCode: string;
  readonly idempotencyKey: string;
}

export interface BondHoldingCashFlowInput {
  readonly gamePublicId: string;
  readonly playerPublicId: string;
  readonly bond: FinancialMarketBondDefinition;
  readonly faceQuantity: string;
  readonly scheduleEntry: FinancialMarketCouponScheduleEntry;
  readonly releaseVersion: string;
}
