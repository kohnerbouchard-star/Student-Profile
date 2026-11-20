import type {
  FinancialMarketGeneratedStatement,
  FinancialStatementGenerationInput,
  FinancialStatementGenerationPolicy,
} from "./financialStatements.ts";
import {
  addMarketDecimals,
  compareMarketDecimals,
  parseMarketDecimal,
  subtractMarketDecimals,
} from "./decimalMath.ts";

export interface FinancialStatementValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly checks: {
    readonly operatingIncomeReconciles: boolean;
    readonly netIncomeReconciles: boolean;
    readonly balanceSheetBalances: boolean;
    readonly cashFlowReconciles: boolean;
    readonly retainedEarningsReconciles: boolean;
    readonly debtChangeReconciles: boolean;
    readonly sharesOutstandingPositive: boolean;
    readonly allRequiredAmountsNonNegative: boolean;
  };
}

export function validateFinancialMarketStatement(
  statement: FinancialMarketGeneratedStatement,
  priorStatement: FinancialMarketGeneratedStatement | null = null,
): FinancialStatementValidationResult {
  const errors: string[] = [];
  const income = statement.incomeStatement;
  const balance = statement.balanceSheet;
  const cashFlow = statement.cashFlowStatement;

  const expectedOperatingIncome = subtractMarketDecimals(
    subtractMarketDecimals(income.revenue, income.costOfRevenue),
    income.operatingExpenses,
  );
  const operatingIncomeReconciles = equalsDecimal(
    expectedOperatingIncome,
    income.operatingIncome,
  );
  if (!operatingIncomeReconciles) errors.push("operating_income_mismatch");

  const expectedNetIncome = subtractMarketDecimals(
    subtractMarketDecimals(income.operatingIncome, income.interestExpense),
    income.taxExpense,
  );
  const netIncomeReconciles = equalsDecimal(expectedNetIncome, income.netIncome);
  if (!netIncomeReconciles) errors.push("net_income_mismatch");

  const totalAssets = addMarketDecimals(
    balance.cash,
    balance.receivables,
    balance.inventory,
    balance.propertyPlantEquipment,
    balance.otherAssets,
  );
  const totalLiabilitiesAndEquity = addMarketDecimals(
    balance.shortTermDebt,
    balance.longTermDebt,
    balance.payables,
    balance.otherLiabilities,
    balance.contributedCapital,
    balance.retainedEarnings,
  );
  const balanceSheetBalances = equalsDecimal(
    totalAssets,
    totalLiabilitiesAndEquity,
  );
  if (!balanceSheetBalances) errors.push("balance_sheet_mismatch");

  const expectedCashChange = addMarketDecimals(
    cashFlow.operatingCashFlow,
    cashFlow.investingCashFlow,
    cashFlow.financingCashFlow,
  );
  const endingCashChange = subtractMarketDecimals(
    balance.cash,
    statement.generationMetadata.beginningCash,
  );
  const cashFlowReconciles = equalsDecimal(
    expectedCashChange,
    cashFlow.netCashChange,
  ) && equalsDecimal(cashFlow.netCashChange, endingCashChange);
  if (!cashFlowReconciles) errors.push("cash_flow_mismatch");

  const priorRetainedEarnings = priorStatement?.balanceSheet.retainedEarnings ?? "0";
  const expectedRetainedEarnings = subtractMarketDecimals(
    addMarketDecimals(priorRetainedEarnings, income.netIncome),
    statement.generationMetadata.distributionAmount,
  );
  const retainedEarningsReconciles = equalsDecimal(
    expectedRetainedEarnings,
    balance.retainedEarnings,
  );
  if (!retainedEarningsReconciles) errors.push("retained_earnings_mismatch");

  const priorDebt = priorStatement
    ? addMarketDecimals(
      priorStatement.balanceSheet.shortTermDebt,
      priorStatement.balanceSheet.longTermDebt,
    )
    : "0";
  const currentDebt = addMarketDecimals(balance.shortTermDebt, balance.longTermDebt);
  const debtChangeReconciles = equalsDecimal(
    subtractMarketDecimals(currentDebt, priorDebt),
    statement.generationMetadata.totalDebtChange,
  );
  if (!debtChangeReconciles) errors.push("debt_change_mismatch");

  const sharesOutstandingPositive = compareMarketDecimals(
    statement.sharesOutstanding,
    "0",
  ) > 0;
  if (!sharesOutstandingPositive) errors.push("shares_outstanding_not_positive");

  const requiredNonNegative = [
    income.revenue,
    income.costOfRevenue,
    income.operatingExpenses,
    income.interestExpense,
    income.taxExpense,
    balance.cash,
    balance.receivables,
    balance.inventory,
    balance.propertyPlantEquipment,
    balance.otherAssets,
    balance.shortTermDebt,
    balance.longTermDebt,
    balance.payables,
    balance.otherLiabilities,
    balance.contributedCapital,
    cashFlow.capitalExpenditure,
    statement.sharesOutstanding,
  ];
  const allRequiredAmountsNonNegative = requiredNonNegative.every((value) =>
    compareMarketDecimals(value, "0") >= 0
  );
  if (!allRequiredAmountsNonNegative) errors.push("negative_required_amount");

  return {
    valid: errors.length === 0,
    errors,
    checks: {
      operatingIncomeReconciles,
      netIncomeReconciles,
      balanceSheetBalances,
      cashFlowReconciles,
      retainedEarningsReconciles,
      debtChangeReconciles,
      sharesOutstandingPositive,
      allRequiredAmountsNonNegative,
    },
  };
}

export function validateGenerationInput(input: FinancialStatementGenerationInput): void {
  if (!input.statementPublicId || !input.gamePublicId || !input.issuerPublicId) {
    throw new Error("Statement, game, and issuer public IDs are required.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.periodStart) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.periodEnd) ||
    input.periodEnd < input.periodStart) {
    throw new Error("Statement period dates are invalid.");
  }
  if (!/^[A-Z]{3,16}$/.test(input.reportingCurrencyCode)) {
    throw new Error("Reporting currency code is invalid.");
  }
  if (!/^[0-9a-f]{64}$/.test(input.inputDigestSha256)) {
    throw new Error("Statement input digest must be SHA-256.");
  }
  validatePolicy(input.policy);
}

function validatePolicy(policy: FinancialStatementGenerationPolicy): void {
  const boundedPairs: readonly [number, number, string][] = [
    [policy.minimumRevenueGrowth, policy.maximumRevenueGrowth, "revenue growth"],
    [policy.minimumGrossMargin, policy.maximumGrossMargin, "gross margin"],
    [
      policy.minimumOperatingExpenseRatio,
      policy.maximumOperatingExpenseRatio,
      "operating expense ratio",
    ],
    [policy.minimumDebtToRevenue, policy.maximumDebtToRevenue, "debt ratio"],
    [policy.minimumTaxRate, policy.maximumTaxRate, "tax rate"],
    [policy.minimumInterestRate, policy.maximumInterestRate, "interest rate"],
    [
      policy.minimumDistributionRate,
      policy.maximumDistributionRate,
      "distribution rate",
    ],
  ];
  for (const [minimum, maximum, label] of boundedPairs) {
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum < minimum) {
      throw new Error(`Invalid ${label} bounds.`);
    }
  }
  if (policy.minimumGrossMargin < 0 || policy.maximumGrossMargin > 1 ||
    policy.minimumOperatingExpenseRatio < 0 ||
    policy.maximumOperatingExpenseRatio > 1 ||
    policy.minimumTaxRate < 0 || policy.maximumTaxRate > 1 ||
    policy.minimumDistributionRate < 0 ||
    policy.maximumDistributionRate > 1) {
    throw new Error("Statement ratio bounds must remain within approved ranges.");
  }
  if (compareMarketDecimals(policy.baseRevenue, "0") <= 0 ||
    compareMarketDecimals(policy.minimumSharesOutstanding, "0") <= 0 ||
    compareMarketDecimals(
      policy.maximumSharesOutstanding,
      policy.minimumSharesOutstanding,
    ) < 0) {
    throw new Error("Statement base amounts are invalid.");
  }
}

function equalsDecimal(left: string, right: string): boolean {
  return parseMarketDecimal(left) === parseMarketDecimal(right);
}
