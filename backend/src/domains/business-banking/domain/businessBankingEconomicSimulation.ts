export interface BusinessCycleSimulationInput {
  readonly inventoryUnits: number;
  readonly baseDemandUnits: number;
  readonly unitPrice: number;
  readonly referencePrice: number;
  readonly unitCost: number;
  readonly wageExpense: number;
  readonly taxRate: number;
  readonly inflationRate: number;
  readonly exchangeRateIndex: number;
  readonly difficultyMultiplier: number;
  readonly businessConfidenceIndex: number;
  readonly supplyConstraintIndex: number;
}

export interface BusinessCycleSimulationResult {
  readonly demandUnits: number;
  readonly unitsSold: number;
  readonly grossRevenue: number;
  readonly costOfGoodsSold: number;
  readonly wageExpense: number;
  readonly taxExpense: number;
  readonly netIncome: number;
  readonly profitable: boolean;
  readonly wageAffordable: boolean;
  readonly failureRisk: "low" | "moderate" | "high";
}

export interface LoanAffordabilityInput {
  readonly amount: number;
  readonly annualRate: number;
  readonly originationFeeRate: number;
  readonly termCycles: number;
  readonly recurringIncomePerCycle: number;
  readonly existingDebtPaymentPerCycle: number;
  readonly maximumPaymentToIncome: number;
  readonly inflationRate: number;
  readonly interestDifficultyModifier: number;
}

export interface LoanAffordabilityResult {
  readonly effectiveAnnualRate: number;
  readonly totalRepayment: number;
  readonly scheduledPayment: number;
  readonly paymentToIncome: number;
  readonly affordable: boolean;
}

export interface EconomicCreditBehaviorInput {
  readonly onTimePaymentRate: number;
  readonly savingsRatio: number;
  readonly incomeStability: number;
  readonly transferAnomalyCount: number;
  readonly delinquencyCount: number;
  readonly defaultCount: number;
}

export interface TransferPattern {
  readonly sender: string;
  readonly recipient: string;
  readonly amount: number;
  readonly occurredAtMs: number;
}

export function simulateBusinessCycle(
  input: BusinessCycleSimulationInput,
): BusinessCycleSimulationResult {
  assertNonNegative(input.inventoryUnits, "inventoryUnits");
  assertNonNegative(input.baseDemandUnits, "baseDemandUnits");
  assertPositive(input.unitPrice, "unitPrice");
  assertPositive(input.referencePrice, "referencePrice");
  assertNonNegative(input.unitCost, "unitCost");
  assertNonNegative(input.wageExpense, "wageExpense");
  assertRange(input.taxRate, 0, 1, "taxRate");
  assertRange(input.inflationRate, -0.25, 5, "inflationRate");
  assertPositive(input.exchangeRateIndex, "exchangeRateIndex");
  assertPositive(input.difficultyMultiplier, "difficultyMultiplier");
  assertRange(input.businessConfidenceIndex, 0, 300, "businessConfidenceIndex");
  assertPositive(input.supplyConstraintIndex, "supplyConstraintIndex");

  const inflationAdjustedReference = input.referencePrice * (1 + input.inflationRate);
  const priceRatio = input.unitPrice / Math.max(inflationAdjustedReference, 0.01);
  const priceElasticity = clamp(2 - priceRatio, 0.1, 2);
  const confidence = clamp(input.businessConfidenceIndex / 100, 0.1, 3);
  const exchangeEffect = clamp(input.exchangeRateIndex, 0.1, 5);
  const supplyEffect = 1 / clamp(input.supplyConstraintIndex, 0.1, 5);
  const difficultyEffect = 1 / clamp(input.difficultyMultiplier, 0.5, 2);
  const demandUnits = Math.max(0, Math.floor(
    input.baseDemandUnits * priceElasticity * confidence * exchangeEffect *
      supplyEffect * difficultyEffect,
  ));
  const unitsSold = Math.min(Math.floor(input.inventoryUnits), demandUnits);
  const grossRevenue = money(unitsSold * input.unitPrice);
  const costOfGoodsSold = money(unitsSold * input.unitCost);
  const taxExpense = money(Math.max(0, grossRevenue) * input.taxRate);
  const netIncome = money(
    grossRevenue - costOfGoodsSold - input.wageExpense - taxExpense,
  );
  const wageAffordable = grossRevenue - costOfGoodsSold >= input.wageExpense;
  const margin = grossRevenue > 0 ? netIncome / grossRevenue : -1;
  const failureRisk = !wageAffordable || margin < -0.25
    ? "high"
    : margin < 0.05
    ? "moderate"
    : "low";

  return {
    demandUnits,
    unitsSold,
    grossRevenue,
    costOfGoodsSold,
    wageExpense: money(input.wageExpense),
    taxExpense,
    netIncome,
    profitable: netIncome >= 0,
    wageAffordable,
    failureRisk,
  };
}

export function calculateLoanAffordability(
  input: LoanAffordabilityInput,
): LoanAffordabilityResult {
  assertPositive(input.amount, "amount");
  assertRange(input.annualRate, 0, 1, "annualRate");
  assertRange(input.originationFeeRate, 0, 0.25, "originationFeeRate");
  assertIntegerRange(input.termCycles, 1, 240, "termCycles");
  assertNonNegative(input.recurringIncomePerCycle, "recurringIncomePerCycle");
  assertNonNegative(
    input.existingDebtPaymentPerCycle,
    "existingDebtPaymentPerCycle",
  );
  assertRange(
    input.maximumPaymentToIncome,
    0.05,
    0.75,
    "maximumPaymentToIncome",
  );
  assertRange(input.inflationRate, -0.25, 5, "inflationRate");
  assertPositive(
    input.interestDifficultyModifier,
    "interestDifficultyModifier",
  );

  const effectiveAnnualRate = clamp(
    input.annualRate * input.interestDifficultyModifier +
      Math.max(0, input.inflationRate) * 0.1,
    0,
    1,
  );
  const termYears = input.termCycles / 12;
  const interest = input.amount * effectiveAnnualRate * termYears;
  const fee = input.amount * input.originationFeeRate;
  const totalRepayment = money(input.amount + interest + fee);
  const scheduledPayment = money(totalRepayment / input.termCycles);
  const totalPayment = scheduledPayment + input.existingDebtPaymentPerCycle;
  const paymentToIncome = input.recurringIncomePerCycle > 0
    ? round(totalPayment / input.recurringIncomePerCycle, 6)
    : 100;

  return {
    effectiveAnnualRate: round(effectiveAnnualRate, 6),
    totalRepayment,
    scheduledPayment,
    paymentToIncome,
    affordable: paymentToIncome <= input.maximumPaymentToIncome,
  };
}

export function calculateEconomicCreditScore(
  input: EconomicCreditBehaviorInput,
): number {
  assertRange(input.onTimePaymentRate, 0, 1, "onTimePaymentRate");
  assertRange(input.savingsRatio, 0, 1, "savingsRatio");
  assertRange(input.incomeStability, 0, 1, "incomeStability");
  assertIntegerRange(
    input.transferAnomalyCount,
    0,
    1_000_000,
    "transferAnomalyCount",
  );
  assertIntegerRange(
    input.delinquencyCount,
    0,
    1_000_000,
    "delinquencyCount",
  );
  assertIntegerRange(input.defaultCount, 0, 1_000_000, "defaultCount");

  return Math.round(clamp(
    520 + input.onTimePaymentRate * 140 + input.savingsRatio * 80 +
      input.incomeStability * 70 - input.transferAnomalyCount * 10 -
      input.delinquencyCount * 35 - input.defaultCount * 120,
    300,
    850,
  ));
}

export function projectBoundedSavingsInterest(input: {
  readonly balance: number;
  readonly annualRate: number;
  readonly days: number;
  readonly maximumInterest: number;
}): number {
  assertNonNegative(input.balance, "balance");
  assertRange(input.annualRate, 0, 0.25, "annualRate");
  assertIntegerRange(input.days, 0, 366, "days");
  assertNonNegative(input.maximumInterest, "maximumInterest");
  return money(Math.min(
    input.balance * input.annualRate * input.days / 365,
    input.maximumInterest,
  ));
}

export function detectCircularTransfer(
  proposed: TransferPattern,
  recent: readonly TransferPattern[],
  windowMs = 10 * 60 * 1_000,
): boolean {
  assertPositive(proposed.amount, "proposed.amount");
  return recent.some((transfer) =>
    transfer.sender === proposed.recipient &&
    transfer.recipient === proposed.sender &&
    transfer.amount === proposed.amount &&
    proposed.occurredAtMs >= transfer.occurredAtMs &&
    proposed.occurredAtMs - transfer.occurredAtMs <= windowMs
  );
}

export function projectLoanState(input: {
  readonly status: "active" | "delinquent" | "defaulted" | "restructured";
  readonly dueAtMs: number;
  readonly asOfMs: number;
  readonly delinquencyGraceDays: number;
  readonly defaultAfterDays: number;
}): "active" | "delinquent" | "defaulted" | "restructured" {
  if (input.status === "restructured" && input.asOfMs <= input.dueAtMs) {
    return "restructured";
  }
  const overdueDays = Math.floor(
    Math.max(0, input.asOfMs - input.dueAtMs) / 86_400_000,
  );
  if (overdueDays > input.defaultAfterDays) return "defaulted";
  if (overdueDays > input.delinquencyGraceDays) return "delinquent";
  return input.status === "restructured" ? "restructured" : "active";
}

function assertPositive(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a positive finite number.`);
  }
}
function assertNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative finite number.`);
  }
}
function assertRange(
  value: number,
  minimum: number,
  maximum: number,
  field: string,
): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${field} must be between ${minimum} and ${maximum}.`);
  }
}
function assertIntegerRange(
  value: number,
  minimum: number,
  maximum: number,
  field: string,
): void {
  assertRange(value, minimum, maximum, field);
  if (!Number.isInteger(value)) throw new Error(`${field} must be an integer.`);
}
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
function money(value: number): number {
  return round(value, 2);
}
function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
