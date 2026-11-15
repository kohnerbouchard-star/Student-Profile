import type { FinancialMarketGeneratedStatement } from "./financialStatements.ts";
import {
  addMarketDecimals,
  compareMarketDecimals,
  divideMarketDecimals,
  marketDecimalToNumber,
  subtractMarketDecimals,
} from "./decimalMath.ts";
import { clamp, round } from "./financialStatementNumericPolicy.ts";

export interface FinancialMarketStatementMetrics {
  readonly grossProfit: string;
  readonly totalAssets: string;
  readonly totalDebt: string;
  readonly totalLiabilities: string;
  readonly totalEquity: string;
  readonly currentAssets: string;
  readonly currentLiabilities: string;
  readonly workingCapital: string;
  readonly bookValuePerShare: string;
  readonly revenueGrowth: number | null;
  readonly grossMargin: number;
  readonly operatingMargin: number;
  readonly netMargin: number;
  readonly operatingCashFlowMargin: number;
  readonly currentRatio: number;
  readonly quickRatio: number;
  readonly debtToEquity: number;
  readonly debtToAssets: number;
  readonly interestCoverage: number;
  readonly returnOnAssets: number;
  readonly returnOnEquity: number;
  readonly cashToDebt: number;
  readonly creditMetricScore: number;
}

export function calculateFinancialMarketStatementMetrics(
  statement: FinancialMarketGeneratedStatement,
  priorStatement: FinancialMarketGeneratedStatement | null = null,
): FinancialMarketStatementMetrics {
  const income = statement.incomeStatement;
  const balance = statement.balanceSheet;
  const cashFlow = statement.cashFlowStatement;
  const grossProfit = subtractMarketDecimals(
    income.revenue,
    income.costOfRevenue,
  );
  const totalAssets = addMarketDecimals(
    balance.cash,
    balance.receivables,
    balance.inventory,
    balance.propertyPlantEquipment,
    balance.otherAssets,
  );
  const totalDebt = addMarketDecimals(
    balance.shortTermDebt,
    balance.longTermDebt,
  );
  const totalLiabilities = addMarketDecimals(
    totalDebt,
    balance.payables,
    balance.otherLiabilities,
  );
  const totalEquity = addMarketDecimals(
    balance.contributedCapital,
    balance.retainedEarnings,
  );
  const currentAssets = addMarketDecimals(
    balance.cash,
    balance.receivables,
    balance.inventory,
  );
  const currentLiabilities = addMarketDecimals(
    balance.shortTermDebt,
    balance.payables,
  );
  const quickAssets = addMarketDecimals(
    balance.cash,
    balance.receivables,
  );
  const workingCapital = subtractMarketDecimals(
    currentAssets,
    currentLiabilities,
  );
  const bookValuePerShare = safeDecimalRatio(
    statement.bookValue,
    statement.sharesOutstanding,
  );
  const revenueGrowth = priorStatement
    ? safeNumericRatio(
      subtractMarketDecimals(
        income.revenue,
        priorStatement.incomeStatement.revenue,
      ),
      priorStatement.incomeStatement.revenue,
    )
    : null;
  const grossMargin = safeNumericRatio(grossProfit, income.revenue);
  const operatingMargin = safeNumericRatio(
    income.operatingIncome,
    income.revenue,
  );
  const netMargin = safeNumericRatio(income.netIncome, income.revenue);
  const operatingCashFlowMargin = safeNumericRatio(
    cashFlow.operatingCashFlow,
    income.revenue,
  );
  const currentRatio = safeNumericRatio(
    currentAssets,
    currentLiabilities,
    99,
  );
  const quickRatio = safeNumericRatio(
    quickAssets,
    currentLiabilities,
    99,
  );
  const debtToEquity = safeNumericRatio(totalDebt, totalEquity, 99);
  const debtToAssets = safeNumericRatio(totalDebt, totalAssets);
  const interestCoverage = safeNumericRatio(
    income.operatingIncome,
    income.interestExpense,
    99,
  );
  const returnOnAssets = safeNumericRatio(
    income.netIncome,
    totalAssets,
  );
  const returnOnEquity = safeNumericRatio(
    income.netIncome,
    totalEquity,
    99,
  );
  const cashToDebt = safeNumericRatio(balance.cash, totalDebt, 99);
  const creditMetricScore = calculateCreditMetricScore({
    currentRatio,
    debtToAssets,
    interestCoverage,
    operatingMargin,
    operatingCashFlowMargin,
  });

  return {
    grossProfit,
    totalAssets,
    totalDebt,
    totalLiabilities,
    totalEquity,
    currentAssets,
    currentLiabilities,
    workingCapital,
    bookValuePerShare,
    revenueGrowth: revenueGrowth === null ? null : round(revenueGrowth, 8),
    grossMargin: round(grossMargin, 8),
    operatingMargin: round(operatingMargin, 8),
    netMargin: round(netMargin, 8),
    operatingCashFlowMargin: round(operatingCashFlowMargin, 8),
    currentRatio: round(currentRatio, 8),
    quickRatio: round(quickRatio, 8),
    debtToEquity: round(debtToEquity, 8),
    debtToAssets: round(debtToAssets, 8),
    interestCoverage: round(interestCoverage, 8),
    returnOnAssets: round(returnOnAssets, 8),
    returnOnEquity: round(returnOnEquity, 8),
    cashToDebt: round(cashToDebt, 8),
    creditMetricScore,
  };
}

export function assertFinancialMarketMetricsBounded(
  metrics: FinancialMarketStatementMetrics,
): void {
  const unitScaleRatios = [
    metrics.grossMargin,
    metrics.operatingMargin,
    metrics.netMargin,
    metrics.operatingCashFlowMargin,
    metrics.debtToAssets,
    metrics.returnOnAssets,
  ];
  if (unitScaleRatios.some((value) =>
    !Number.isFinite(value) || value < -2 || value > 2
  )) {
    throw new Error(
      "Statement ratio exceeded the bounded analytics range.",
    );
  }

  const nonNegativeRatios = [
    metrics.currentRatio,
    metrics.quickRatio,
    metrics.cashToDebt,
  ];
  if (nonNegativeRatios.some((value) =>
    !Number.isFinite(value) || value < 0 || value > 99
  )) {
    throw new Error(
      "Statement non-negative credit metric exceeded the bounded range.",
    );
  }

  const signedCreditRatios = [
    metrics.debtToEquity,
    metrics.interestCoverage,
    metrics.returnOnEquity,
  ];
  if (signedCreditRatios.some((value) =>
    !Number.isFinite(value) || value < -99 || value > 99
  )) {
    throw new Error(
      "Statement signed credit metric exceeded the bounded range.",
    );
  }

  if (!Number.isFinite(metrics.creditMetricScore) ||
    metrics.creditMetricScore < 0 || metrics.creditMetricScore > 100) {
    throw new Error("Statement credit score exceeded 0-100.");
  }
}

function calculateCreditMetricScore(input: {
  readonly currentRatio: number;
  readonly debtToAssets: number;
  readonly interestCoverage: number;
  readonly operatingMargin: number;
  readonly operatingCashFlowMargin: number;
}): number {
  const liquidity = clamp(input.currentRatio / 3, 0, 1) * 20;
  const leverage = (1 - clamp(input.debtToAssets, 0, 1)) * 25;
  const coverage = clamp(input.interestCoverage / 8, 0, 1) * 25;
  const profitability = clamp(
    (input.operatingMargin + 0.2) / 0.6,
    0,
    1,
  ) * 15;
  const cashGeneration = clamp(
    (input.operatingCashFlowMargin + 0.2) / 0.6,
    0,
    1,
  ) * 15;
  return round(
    liquidity + leverage + coverage + profitability + cashGeneration,
    4,
  );
}

function safeDecimalRatio(
  numerator: string,
  denominator: string,
): string {
  return compareMarketDecimals(denominator, "0") === 0
    ? "0"
    : divideMarketDecimals(numerator, denominator);
}

function safeNumericRatio(
  numerator: string,
  denominator: string,
  zeroDenominatorValue = 0,
): number {
  if (compareMarketDecimals(denominator, "0") === 0) {
    return zeroDenominatorValue;
  }
  return marketDecimalToNumber(
    divideMarketDecimals(numerator, denominator),
  );
}
