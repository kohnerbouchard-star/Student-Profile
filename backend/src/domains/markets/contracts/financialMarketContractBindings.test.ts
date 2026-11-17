import type * as Facade from "./financialMarketContracts.ts";
import type * as Investment from "./financialMarketInvestmentContracts.ts";
import type * as Trading from "./financialMarketTradingContracts.ts";
declare const Deno: { test(name: string, fn: () => void): void };
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
const bindings: [
  Same<
    Facade.FinancialMarketBenchmarkDefinition,
    Investment.FinancialMarketBenchmarkDefinition
  >,
  Same<
    Facade.FinancialMarketIndexMethodologyDefinition,
    Investment.FinancialMarketIndexMethodologyDefinition
  >,
  Same<
    Facade.FinancialMarketIndexConstituentDefinition,
    Investment.FinancialMarketIndexConstituentDefinition
  >,
  Same<
    Facade.FinancialMarketFundDefinition,
    Investment.FinancialMarketFundDefinition
  >,
  Same<
    Facade.FinancialMarketFundHoldingDefinition,
    Investment.FinancialMarketFundHoldingDefinition
  >,
  Same<
    Facade.FinancialMarketTrustDefinition,
    Investment.FinancialMarketTrustDefinition
  >,
  Same<
    Facade.FinancialMarketBondDefinition,
    Investment.FinancialMarketBondDefinition
  >,
  Same<
    Facade.FinancialMarketCouponScheduleEntry,
    Investment.FinancialMarketCouponScheduleEntry
  >,
  Same<
    Facade.FinancialMarketPreferredEquityDefinition,
    Investment.FinancialMarketPreferredEquityDefinition
  >,
  Same<
    Facade.FinancialMarketConversionPolicyDefinition,
    Investment.FinancialMarketConversionPolicyDefinition
  >,
  Same<
    Facade.FinancialMarketExchangeCalendarPolicy,
    Trading.FinancialMarketExchangeCalendarPolicy
  >,
  Same<
    Facade.FinancialMarketWeeklySession,
    Trading.FinancialMarketWeeklySession
  >,
  Same<Facade.FinancialMarketEarlyClose, Trading.FinancialMarketEarlyClose>,
  Same<
    Facade.FinancialMarketTradingRulePolicy,
    Trading.FinancialMarketTradingRulePolicy
  >,
  Same<Facade.FinancialMarketOrderCommand, Trading.FinancialMarketOrderCommand>,
  Same<Facade.FinancialMarketOrderRecord, Trading.FinancialMarketOrderRecord>,
  Same<
    Facade.FinancialMarketReservationRecord,
    Trading.FinancialMarketReservationRecord
  >,
  Same<Facade.FinancialMarketFillRecord, Trading.FinancialMarketFillRecord>,
  Same<Facade.FinancialMarketTradeRecord, Trading.FinancialMarketTradeRecord>,
  Same<Facade.FinancialMarketFeeRecord, Trading.FinancialMarketFeeRecord>,
] = [
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
];
Deno.test("financial market facade retains all twenty extracted type contracts", () => {
  if (bindings.length !== 20 || bindings.some((value) => value !== true)) {
    throw new Error("Type binding drift");
  }
});
