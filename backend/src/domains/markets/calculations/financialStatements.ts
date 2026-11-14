import type {
  FinancialMarketIssuerStatementPeriod,
} from "../contracts/financialMarketContracts.ts";
import {
  addMarketDecimals,
  compareMarketDecimals,
  divideMarketDecimals,
  formatMarketDecimal,
  multiplyMarketDecimals,
  parseMarketDecimal,
  subtractMarketDecimals,
} from "./decimalMath.ts";
import {
  createDeterministicMarketRandom,
} from "./deterministicMarketSeed.ts";

import {
  validateFinancialMarketStatement,
  validateGenerationInput,
} from "./financialStatementValidation.ts";
export { validateFinancialMarketStatement } from "./financialStatementValidation.ts";
export type { FinancialStatementValidationResult } from "./financialStatementValidation.ts";

export interface FinancialStatementGenerationPolicy {
  readonly baseRevenue: string;
  readonly minimumRevenueGrowth: number;
  readonly maximumRevenueGrowth: number;
  readonly minimumGrossMargin: number;
  readonly maximumGrossMargin: number;
  readonly minimumOperatingExpenseRatio: number;
  readonly maximumOperatingExpenseRatio: number;
  readonly minimumDebtToRevenue: number;
  readonly maximumDebtToRevenue: number;
  readonly minimumTaxRate: number;
  readonly maximumTaxRate: number;
  readonly minimumInterestRate: number;
  readonly maximumInterestRate: number;
  readonly minimumDistributionRate: number;
  readonly maximumDistributionRate: number;
  readonly minimumSharesOutstanding: string;
  readonly maximumSharesOutstanding: string;
}

export interface FinancialStatementGenerationInput {
  readonly statementPublicId: string;
  readonly gamePublicId: string;
  readonly issuerPublicId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly reportingCurrencyCode: string;
  readonly generatorVersion: string;
  readonly inputDigestSha256: string;
  readonly generatedAt: string;
  readonly deterministicSeed: string;
  readonly policy: FinancialStatementGenerationPolicy;
  readonly priorStatement?: FinancialMarketGeneratedStatement | null;
}

export interface FinancialMarketStatementGenerationMetadata {
  readonly revenueGrowth: number;
  readonly grossMargin: number;
  readonly operatingExpenseRatio: number;
  readonly taxRate: number;
  readonly interestRate: number;
  readonly debtToRevenue: number;
  readonly distributionAmount: string;
  readonly beginningCash: string;
  readonly totalDebtChange: string;
  readonly contributedCapitalChange: string;
}

export interface FinancialMarketGeneratedStatement
  extends FinancialMarketIssuerStatementPeriod {
  readonly generationMetadata: FinancialMarketStatementGenerationMetadata;
}

export const DEFAULT_FINANCIAL_STATEMENT_POLICY:
  FinancialStatementGenerationPolicy = Object.freeze({
    baseRevenue: "1000000",
    minimumRevenueGrowth: -0.12,
    maximumRevenueGrowth: 0.18,
    minimumGrossMargin: 0.24,
    maximumGrossMargin: 0.62,
    minimumOperatingExpenseRatio: 0.12,
    maximumOperatingExpenseRatio: 0.34,
    minimumDebtToRevenue: 0.08,
    maximumDebtToRevenue: 0.78,
    minimumTaxRate: 0.08,
    maximumTaxRate: 0.28,
    minimumInterestRate: 0.015,
    maximumInterestRate: 0.11,
    minimumDistributionRate: 0,
    maximumDistributionRate: 0.35,
    minimumSharesOutstanding: "100000",
    maximumSharesOutstanding: "10000000",
  });

export function generateFinancialMarketStatement(
  input: FinancialStatementGenerationInput,
): FinancialMarketGeneratedStatement {
  validateGenerationInput(input);
  const random = createDeterministicMarketRandom(
    "financial-statement",
    input.deterministicSeed,
    input.gamePublicId,
    input.issuerPublicId,
    input.periodStart,
    input.periodEnd,
    input.generatorVersion,
    input.inputDigestSha256,
  );
  const policy = input.policy;
  const prior = input.priorStatement ?? null;

  const revenueGrowth = random.nextBetween(
    policy.minimumRevenueGrowth,
    policy.maximumRevenueGrowth,
  );
  const grossMargin = random.nextBetween(
    policy.minimumGrossMargin,
    policy.maximumGrossMargin,
  );
  const operatingExpenseRatio = random.nextBetween(
    policy.minimumOperatingExpenseRatio,
    policy.maximumOperatingExpenseRatio,
  );
  const debtToRevenue = random.nextBetween(
    policy.minimumDebtToRevenue,
    policy.maximumDebtToRevenue,
  );
  const taxRate = random.nextBetween(
    policy.minimumTaxRate,
    policy.maximumTaxRate,
  );
  const interestRate = random.nextBetween(
    policy.minimumInterestRate,
    policy.maximumInterestRate,
  );
  const distributionRate = random.nextBetween(
    policy.minimumDistributionRate,
    policy.maximumDistributionRate,
  );

  const priorRevenue = prior?.incomeStatement.revenue ?? policy.baseRevenue;
  const revenue = prior
    ? multiplyMarketDecimals(priorRevenue, 1 + revenueGrowth)
    : policy.baseRevenue;
  const costOfRevenue = multiplyMarketDecimals(revenue, 1 - grossMargin);
  const operatingExpenses = multiplyMarketDecimals(
    revenue,
    operatingExpenseRatio,
  );
  const operatingIncome = subtractMarketDecimals(
    subtractMarketDecimals(revenue, costOfRevenue),
    operatingExpenses,
  );

  const totalDebt = multiplyMarketDecimals(revenue, debtToRevenue);
  const shortTermDebtRatio = random.nextBetween(0.12, 0.34);
  const shortTermDebt = multiplyMarketDecimals(totalDebt, shortTermDebtRatio);
  const longTermDebt = subtractMarketDecimals(totalDebt, shortTermDebt);
  const interestExpense = multiplyMarketDecimals(totalDebt, interestRate);
  const preTaxIncome = subtractMarketDecimals(operatingIncome, interestExpense);
  const taxableIncome = compareMarketDecimals(preTaxIncome, "0") > 0
    ? preTaxIncome
    : "0";
  const taxExpense = multiplyMarketDecimals(taxableIncome, taxRate);
  const netIncome = subtractMarketDecimals(preTaxIncome, taxExpense);
  const distributableIncome = compareMarketDecimals(netIncome, "0") > 0
    ? netIncome
    : "0";
  const distributionAmount = multiplyMarketDecimals(
    distributableIncome,
    distributionRate,
  );

  const priorRetainedEarnings = prior?.balanceSheet.retainedEarnings ?? "0";
  const retainedEarnings = subtractMarketDecimals(
    addMarketDecimals(priorRetainedEarnings, netIncome),
    distributionAmount,
  );

  const priorContributedCapital = prior?.balanceSheet.contributedCapital;
  const contributedCapital = priorContributedCapital ?? multiplyMarketDecimals(
    revenue,
    random.nextBetween(0.18, 0.42),
  );
  const contributedCapitalChange = priorContributedCapital
    ? subtractMarketDecimals(contributedCapital, priorContributedCapital)
    : contributedCapital;

  const payables = multiplyMarketDecimals(
    costOfRevenue,
    random.nextBetween(0.08, 0.22),
  );
  const otherLiabilities = multiplyMarketDecimals(
    revenue,
    random.nextBetween(0.03, 0.14),
  );
  const totalLiabilities = addMarketDecimals(
    shortTermDebt,
    longTermDebt,
    payables,
    otherLiabilities,
  );
  const totalEquity = addMarketDecimals(
    contributedCapital,
    retainedEarnings,
  );
  const totalAssets = addMarketDecimals(totalLiabilities, totalEquity);

  const receivablesRatio = random.nextBetween(0.07, 0.16);
  const inventoryRatio = random.nextBetween(0.04, 0.13);
  const propertyRatio = random.nextBetween(0.18, 0.42);
  const otherAssetRatio = random.nextBetween(0.03, 0.12);
  const ratioTotal = receivablesRatio + inventoryRatio + propertyRatio +
    otherAssetRatio;
  const scale = ratioTotal > 0.78 ? 0.78 / ratioTotal : 1;

  const receivables = multiplyMarketDecimals(
    totalAssets,
    receivablesRatio * scale,
  );
  const inventory = multiplyMarketDecimals(
    totalAssets,
    inventoryRatio * scale,
  );
  const propertyPlantEquipment = multiplyMarketDecimals(
    totalAssets,
    propertyRatio * scale,
  );
  const otherAssets = multiplyMarketDecimals(
    totalAssets,
    otherAssetRatio * scale,
  );
  const cash = subtractMarketDecimals(
    totalAssets,
    addMarketDecimals(
      receivables,
      inventory,
      propertyPlantEquipment,
      otherAssets,
    ),
  );

  const depreciation = multiplyMarketDecimals(
    propertyPlantEquipment,
    random.nextBetween(0.025, 0.075),
  );
  const priorWorkingCapital = prior
    ? subtractMarketDecimals(
      addMarketDecimals(
        prior.balanceSheet.receivables,
        prior.balanceSheet.inventory,
      ),
      prior.balanceSheet.payables,
    )
    : "0";
  const workingCapital = subtractMarketDecimals(
    addMarketDecimals(receivables, inventory),
    payables,
  );
  const workingCapitalIncrease = subtractMarketDecimals(
    workingCapital,
    priorWorkingCapital,
  );
  const operatingCashFlow = subtractMarketDecimals(
    addMarketDecimals(netIncome, depreciation),
    workingCapitalIncrease,
  );
  const capitalExpenditure = multiplyMarketDecimals(
    revenue,
    random.nextBetween(0.025, 0.12),
  );
  const investingCashFlow = formatMarketDecimal(
    -parseMarketDecimal(capitalExpenditure),
  );
  const beginningCash = prior?.balanceSheet.cash ?? multiplyMarketDecimals(
    cash,
    random.nextBetween(0.72, 0.94),
  );
  const netCashChange = subtractMarketDecimals(cash, beginningCash);
  const financingCashFlow = subtractMarketDecimals(
    netCashChange,
    addMarketDecimals(operatingCashFlow, investingCashFlow),
  );

  const priorTotalDebt = prior
    ? addMarketDecimals(
      prior.balanceSheet.shortTermDebt,
      prior.balanceSheet.longTermDebt,
    )
    : "0";
  const totalDebtChange = subtractMarketDecimals(totalDebt, priorTotalDebt);

  const sharesOutstanding = prior?.sharesOutstanding ?? deterministicShares(
    policy.minimumSharesOutstanding,
    policy.maximumSharesOutstanding,
    random.next(),
  );
  const bookValue = totalEquity;

  const statement: FinancialMarketGeneratedStatement = {
    statementPublicId: input.statementPublicId,
    issuerPublicId: input.issuerPublicId,
    gamePublicId: input.gamePublicId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    reportingCurrencyCode: input.reportingCurrencyCode,
    incomeStatement: {
      revenue,
      costOfRevenue,
      operatingExpenses,
      operatingIncome,
      interestExpense,
      taxExpense,
      netIncome,
    },
    balanceSheet: {
      cash,
      receivables,
      inventory,
      propertyPlantEquipment,
      otherAssets,
      shortTermDebt,
      longTermDebt,
      payables,
      otherLiabilities,
      contributedCapital,
      retainedEarnings,
    },
    cashFlowStatement: {
      operatingCashFlow,
      investingCashFlow,
      financingCashFlow,
      capitalExpenditure,
      netCashChange,
    },
    sharesOutstanding,
    bookValue,
    generatorVersion: input.generatorVersion,
    inputDigestSha256: input.inputDigestSha256,
    generatedAt: input.generatedAt,
    generationMetadata: {
      revenueGrowth: roundFactor(revenueGrowth),
      grossMargin: roundFactor(grossMargin),
      operatingExpenseRatio: roundFactor(operatingExpenseRatio),
      taxRate: roundFactor(taxRate),
      interestRate: roundFactor(interestRate),
      debtToRevenue: roundFactor(debtToRevenue),
      distributionAmount,
      beginningCash,
      totalDebtChange,
      contributedCapitalChange,
    },
  };

  const validation = validateFinancialMarketStatement(statement, prior);
  if (!validation.valid) {
    throw new Error(
      `Generated statement failed reconciliation: ${validation.errors.join(", ")}`,
    );
  }
  return statement;
}

function deterministicShares(
  minimum: string,
  maximum: string,
  unitInterval: number,
): string {
  const minimumScaled = parseMarketDecimal(minimum);
  const maximumScaled = parseMarketDecimal(maximum);
  if (maximumScaled < minimumScaled) {
    throw new Error("Maximum shares must not be below minimum shares.");
  }
  const span = maximumScaled - minimumScaled;
  const position = BigInt(Math.floor(unitInterval * 1_000_000));
  return formatMarketDecimal(
    minimumScaled + (span * position) / 1_000_000n,
  );
}

function roundFactor(value: number): number {
  return Number(value.toFixed(6));
}
