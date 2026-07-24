import type {
  FinancialMarketGeneratedStatement,
  FinancialStatementGenerationInput,
  FinancialStatementGenerationPolicy,
} from "./financialStatements.ts";
import {
  generateFinancialMarketStatement,
  validateFinancialMarketStatement,
} from "./financialStatements.ts";
import {
  addMarketDecimals,
  compareMarketDecimals,
  divideMarketDecimals,
  marketDecimalToNumber,
  multiplyMarketDecimals,
  subtractMarketDecimals,
} from "./decimalMath.ts";

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

export interface FinancialMarketStatementEventAdjustment {
  readonly revenueGrowthDelta?: number;
  readonly grossMarginDelta?: number;
  readonly operatingExpenseRatioDelta?: number;
  readonly debtToRevenueDelta?: number;
  readonly interestRateDelta?: number;
  readonly distributionRateDelta?: number;
}

export interface FinancialMarketStatementPeriodInput {
  readonly statementPublicId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly generatedAt: string;
  readonly inputDigestSha256: string;
  readonly eventAdjustment?: FinancialMarketStatementEventAdjustment | null;
}

export interface FinancialMarketStatementSeriesInput {
  readonly gamePublicId: string;
  readonly issuerPublicId: string;
  readonly reportingCurrencyCode: string;
  readonly generatorVersion: string;
  readonly deterministicSeed: string;
  readonly policy: FinancialStatementGenerationPolicy;
  readonly periods: readonly FinancialMarketStatementPeriodInput[];
  readonly minimumRevenueMultiple?: number;
  readonly maximumRevenueMultiple?: number;
}

export interface FinancialMarketStatementSeriesResult {
  readonly statements: readonly FinancialMarketGeneratedStatement[];
  readonly metrics: readonly FinancialMarketStatementMetrics[];
  readonly minimumRevenue: string;
  readonly maximumRevenue: string;
  readonly deterministic: true;
  readonly activationAuthorized: false;
}

const HARD_EVENT_BOUND = 0.2;
const HARD_REVENUE_GROWTH_MINIMUM = -0.35;
const HARD_REVENUE_GROWTH_MAXIMUM = 0.35;
const HARD_GROSS_MARGIN_MINIMUM = 0.05;
const HARD_GROSS_MARGIN_MAXIMUM = 0.85;
const HARD_OPERATING_EXPENSE_MINIMUM = 0.03;
const HARD_OPERATING_EXPENSE_MAXIMUM = 0.7;
const HARD_DEBT_TO_REVENUE_MINIMUM = 0;
const HARD_DEBT_TO_REVENUE_MAXIMUM = 1.5;
const HARD_INTEREST_RATE_MINIMUM = 0;
const HARD_INTEREST_RATE_MAXIMUM = 0.4;

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

export function buildEventAdjustedFinancialStatementPolicy(
  policy: FinancialStatementGenerationPolicy,
  adjustment: FinancialMarketStatementEventAdjustment | null | undefined,
  revenueGrowthBounds?: {
    readonly minimum: number;
    readonly maximum: number;
  },
): FinancialStatementGenerationPolicy {
  const event = adjustment ?? {};
  for (const [key, value] of Object.entries(event)) {
    if (value !== undefined &&
      (!Number.isFinite(value) || Math.abs(value) > HARD_EVENT_BOUND)) {
      throw new Error(
        `${key} exceeds the bounded event-adjustment range.`,
      );
    }
  }
  const growthDelta = event.revenueGrowthDelta ?? 0;
  let minimumRevenueGrowth = clamp(
    policy.minimumRevenueGrowth + growthDelta,
    HARD_REVENUE_GROWTH_MINIMUM,
    HARD_REVENUE_GROWTH_MAXIMUM,
  );
  let maximumRevenueGrowth = clamp(
    policy.maximumRevenueGrowth + growthDelta,
    HARD_REVENUE_GROWTH_MINIMUM,
    HARD_REVENUE_GROWTH_MAXIMUM,
  );
  if (revenueGrowthBounds) {
    minimumRevenueGrowth = Math.max(
      minimumRevenueGrowth,
      revenueGrowthBounds.minimum,
    );
    maximumRevenueGrowth = Math.min(
      maximumRevenueGrowth,
      revenueGrowthBounds.maximum,
    );
  }
  if (maximumRevenueGrowth < minimumRevenueGrowth) {
    const bounded = clamp(
      (minimumRevenueGrowth + maximumRevenueGrowth) / 2,
      HARD_REVENUE_GROWTH_MINIMUM,
      HARD_REVENUE_GROWTH_MAXIMUM,
    );
    minimumRevenueGrowth = bounded;
    maximumRevenueGrowth = bounded;
  }

  return {
    ...policy,
    minimumRevenueGrowth: round(minimumRevenueGrowth, 8),
    maximumRevenueGrowth: round(maximumRevenueGrowth, 8),
    minimumGrossMargin: clamp(
      policy.minimumGrossMargin + (event.grossMarginDelta ?? 0),
      HARD_GROSS_MARGIN_MINIMUM,
      HARD_GROSS_MARGIN_MAXIMUM,
    ),
    maximumGrossMargin: clamp(
      policy.maximumGrossMargin + (event.grossMarginDelta ?? 0),
      HARD_GROSS_MARGIN_MINIMUM,
      HARD_GROSS_MARGIN_MAXIMUM,
    ),
    minimumOperatingExpenseRatio: clamp(
      policy.minimumOperatingExpenseRatio +
        (event.operatingExpenseRatioDelta ?? 0),
      HARD_OPERATING_EXPENSE_MINIMUM,
      HARD_OPERATING_EXPENSE_MAXIMUM,
    ),
    maximumOperatingExpenseRatio: clamp(
      policy.maximumOperatingExpenseRatio +
        (event.operatingExpenseRatioDelta ?? 0),
      HARD_OPERATING_EXPENSE_MINIMUM,
      HARD_OPERATING_EXPENSE_MAXIMUM,
    ),
    minimumDebtToRevenue: clamp(
      policy.minimumDebtToRevenue + (event.debtToRevenueDelta ?? 0),
      HARD_DEBT_TO_REVENUE_MINIMUM,
      HARD_DEBT_TO_REVENUE_MAXIMUM,
    ),
    maximumDebtToRevenue: clamp(
      policy.maximumDebtToRevenue + (event.debtToRevenueDelta ?? 0),
      HARD_DEBT_TO_REVENUE_MINIMUM,
      HARD_DEBT_TO_REVENUE_MAXIMUM,
    ),
    minimumInterestRate: clamp(
      policy.minimumInterestRate + (event.interestRateDelta ?? 0),
      HARD_INTEREST_RATE_MINIMUM,
      HARD_INTEREST_RATE_MAXIMUM,
    ),
    maximumInterestRate: clamp(
      policy.maximumInterestRate + (event.interestRateDelta ?? 0),
      HARD_INTEREST_RATE_MINIMUM,
      HARD_INTEREST_RATE_MAXIMUM,
    ),
    minimumDistributionRate: clamp(
      policy.minimumDistributionRate +
        (event.distributionRateDelta ?? 0),
      0,
      0.75,
    ),
    maximumDistributionRate: clamp(
      policy.maximumDistributionRate +
        (event.distributionRateDelta ?? 0),
      0,
      0.75,
    ),
  };
}

export function generateBoundedFinancialMarketStatementSeries(
  input: FinancialMarketStatementSeriesInput,
): FinancialMarketStatementSeriesResult {
  if (input.periods.length === 0 || input.periods.length > 120) {
    throw new Error("Statement series must contain 1-120 periods.");
  }
  const minimumMultiple = input.minimumRevenueMultiple ?? 0.25;
  const maximumMultiple = input.maximumRevenueMultiple ?? 3;
  if (!Number.isFinite(minimumMultiple) ||
    !Number.isFinite(maximumMultiple) || minimumMultiple <= 0 ||
    maximumMultiple < minimumMultiple || maximumMultiple > 10) {
    throw new Error("Statement revenue-multiple bounds are invalid.");
  }
  const minimumRevenue = multiplyMarketDecimals(
    input.policy.baseRevenue,
    minimumMultiple,
  );
  const maximumRevenue = multiplyMarketDecimals(
    input.policy.baseRevenue,
    maximumMultiple,
  );
  const statements: FinancialMarketGeneratedStatement[] = [];
  const metrics: FinancialMarketStatementMetrics[] = [];
  let prior: FinancialMarketGeneratedStatement | null = null;

  for (const period of input.periods) {
    const growthBounds = prior
      ? calculateRevenueGrowthBounds(
        prior.incomeStatement.revenue,
        minimumRevenue,
        maximumRevenue,
      )
      : undefined;
    const policy = buildEventAdjustedFinancialStatementPolicy(
      input.policy,
      period.eventAdjustment,
      growthBounds,
    );
    const generationInput: FinancialStatementGenerationInput = {
      statementPublicId: period.statementPublicId,
      gamePublicId: input.gamePublicId,
      issuerPublicId: input.issuerPublicId,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      reportingCurrencyCode: input.reportingCurrencyCode,
      generatorVersion: input.generatorVersion,
      inputDigestSha256: period.inputDigestSha256,
      generatedAt: period.generatedAt,
      deterministicSeed: input.deterministicSeed,
      policy,
      priorStatement: prior,
    };
    const statement = generateFinancialMarketStatement(generationInput);
    const validation = validateFinancialMarketStatement(statement, prior);
    if (!validation.valid) {
      throw new Error(
        `Statement series reconciliation failed: ${
          validation.errors.join(",")
        }`,
      );
    }
    if (compareMarketDecimals(
      statement.incomeStatement.revenue,
      minimumRevenue,
    ) < 0 || compareMarketDecimals(
      statement.incomeStatement.revenue,
      maximumRevenue,
    ) > 0) {
      throw new Error("Statement series revenue exceeded the bounded range.");
    }
    if (prior && statement.sharesOutstanding !== prior.sharesOutstanding) {
      throw new Error("Share count changed without a corporate action.");
    }
    statements.push(statement);
    metrics.push(calculateFinancialMarketStatementMetrics(statement, prior));
    prior = statement;
  }

  return {
    statements,
    metrics,
    minimumRevenue,
    maximumRevenue,
    deterministic: true,
    activationAuthorized: false,
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

function calculateRevenueGrowthBounds(
  priorRevenue: string,
  minimumRevenue: string,
  maximumRevenue: string,
): { readonly minimum: number; readonly maximum: number } {
  const minimum = marketDecimalToNumber(
    divideMarketDecimals(minimumRevenue, priorRevenue),
  ) - 1;
  const maximum = marketDecimalToNumber(
    divideMarketDecimals(maximumRevenue, priorRevenue),
  ) - 1;
  return {
    minimum: clamp(
      minimum,
      HARD_REVENUE_GROWTH_MINIMUM,
      HARD_REVENUE_GROWTH_MAXIMUM,
    ),
    maximum: clamp(
      maximum,
      HARD_REVENUE_GROWTH_MINIMUM,
      HARD_REVENUE_GROWTH_MAXIMUM,
    ),
  };
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}
