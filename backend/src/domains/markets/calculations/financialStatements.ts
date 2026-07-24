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

function validateGenerationInput(input: FinancialStatementGenerationInput): void {
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

function roundFactor(value: number): number {
  return Number(value.toFixed(6));
}
