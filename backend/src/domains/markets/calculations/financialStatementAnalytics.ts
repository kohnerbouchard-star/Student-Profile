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
  compareMarketDecimals,
  divideMarketDecimals,
  marketDecimalToNumber,
  multiplyMarketDecimals,
} from "./decimalMath.ts";
import type { FinancialMarketStatementMetrics } from "./financialStatementMetrics.ts";
import { calculateFinancialMarketStatementMetrics } from "./financialStatementMetrics.ts";
import { clamp, round } from "./financialStatementNumericPolicy.ts";
export type { FinancialMarketStatementMetrics } from "./financialStatementMetrics.ts";
export {
  assertFinancialMarketMetricsBounded,
  calculateFinancialMarketStatementMetrics,
} from "./financialStatementMetrics.ts";

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
