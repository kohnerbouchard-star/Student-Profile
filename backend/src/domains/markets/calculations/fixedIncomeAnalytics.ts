import type {
  FinancialMarketBondDefinition,
} from "../contracts/financialMarketContracts.ts";
import {
  calculateDayCountFraction,
  generateBondCouponSchedule,
} from "./bondMath.ts";
import {
  addMarketDecimals,
  compareMarketDecimals,
  marketDecimalToNumber,
  multiplyMarketDecimals,
} from "./decimalMath.ts";

import {
  DEFAULT_FIXED_INCOME_YIELD_POLICY,
  round,
  validateYield,
} from "./fixedIncomePolicy.ts";
import type { FixedIncomeYieldPolicy } from "./fixedIncomePolicy.ts";

// Preserve the existing public entrypoint with direct bindings, not wrappers.
export {
  DEFAULT_FIXED_INCOME_YIELD_POLICY,
  NEGATIVE_YIELD_REFERENCE_POLICY,
} from "./fixedIncomePolicy.ts";
export type { FixedIncomeYieldPolicy } from "./fixedIncomePolicy.ts";
export {
  DEFAULT_FIXED_INCOME_CURVE_POLICY,
  resolveFixedIncomeYield,
  validateVersionedFixedIncomeCurve,
} from "./fixedIncomeCurves.ts";
export type {
  FixedIncomeCurvePolicy,
  FixedIncomeCurveValidationReport,
  FixedIncomeYieldResolution,
} from "./fixedIncomeCurves.ts";

export interface FixedIncomeAnalyticsInput {
  readonly bond: FinancialMarketBondDefinition;
  readonly settlementDate: string;
  readonly faceQuantity: string;
  readonly annualYield: number;
  readonly cleanPrice?: string;
  readonly yieldPolicy?: FixedIncomeYieldPolicy;
}

export interface FixedIncomeAnalyticsResult {
  readonly cleanPrice: string;
  readonly dirtyPrice: string;
  readonly accruedInterest: string;
  readonly currentYield: number;
  readonly yieldToMaturity: number;
  readonly macaulayDurationYears: number;
  readonly modifiedDurationYears: number;
  readonly convexity: number;
  readonly remainingCashFlowCount: number;
  readonly maturityValue: string;
}

export function calculateFixedIncomeAnalytics(
  input: FixedIncomeAnalyticsInput,
): FixedIncomeAnalyticsResult {
  const policy = input.yieldPolicy ?? DEFAULT_FIXED_INCOME_YIELD_POLICY;
  validateYield(input.annualYield, policy);
  validatePositiveAmount(input.faceQuantity, "faceQuantity");
  const flows = futureBondCashFlows(
    input.bond,
    input.settlementDate,
    input.faceQuantity,
  );
  if (flows.length === 0) throw new Error("Bond has no remaining cash flows.");
  const frequency = frequencyPerYear(input.bond.couponFrequency);
  const dirtyValue = presentValue(flows, input.annualYield, frequency);
  const accruedInterest = accruedInterestForBond(
    input.bond,
    input.settlementDate,
    input.faceQuantity,
  );
  const cleanValue = Math.max(
    0,
    dirtyValue - marketDecimalToNumber(accruedInterest),
  );
  const cleanPrice = input.cleanPrice ?? toDecimal(cleanValue);
  if (input.cleanPrice) validatePositiveAmount(input.cleanPrice, "cleanPrice");
  const marketDirtyPrice = marketDecimalToNumber(cleanPrice) +
    marketDecimalToNumber(accruedInterest);
  const ytm = solveYieldToMaturity(flows, marketDirtyPrice, frequency, policy);
  const duration = durationAndConvexity(
    flows,
    ytm,
    frequency,
    marketDirtyPrice,
  );
  const annualCoupon = input.bond.couponType === "zero_coupon"
    ? 0
    : marketDecimalToNumber(
      multiplyMarketDecimals(
        multiplyMarketDecimals(input.bond.faceValue, input.faceQuantity),
        input.bond.couponRateAnnual,
      ),
    );
  const currentYield = marketDecimalToNumber(cleanPrice) === 0
    ? 0
    : annualCoupon / marketDecimalToNumber(cleanPrice);
  const maturityValue = multiplyMarketDecimals(
    input.bond.faceValue,
    input.faceQuantity,
  );
  return {
    cleanPrice,
    dirtyPrice: toDecimal(marketDirtyPrice),
    accruedInterest,
    currentYield: round(currentYield, 10),
    yieldToMaturity: round(ytm, 10),
    macaulayDurationYears: round(duration.macaulay, 10),
    modifiedDurationYears: round(duration.modified, 10),
    convexity: round(duration.convexity, 10),
    remainingCashFlowCount: flows.length,
    maturityValue,
  };
}

function futureBondCashFlows(
  bond: FinancialMarketBondDefinition,
  settlementDate: string,
  faceQuantity: string,
): readonly {
  readonly paymentDate: string;
  readonly years: number;
  readonly amount: number;
}[] {
  const settlement = parseDate(settlementDate);
  const flows = [];
  for (const entry of generateBondCouponSchedule(bond)) {
    const payment = parseDate(entry.paymentDate);
    if (payment <= settlement) continue;
    const amount = marketDecimalToNumber(multiplyMarketDecimals(
      addMarketDecimals(
        entry.couponAmountPerFaceUnit,
        entry.principalAmountPerFaceUnit,
      ),
      faceQuantity,
    ));
    if (amount <= 0) continue;
    flows.push({
      paymentDate: entry.paymentDate,
      years: calculateDayCountFraction(
        settlementDate,
        entry.paymentDate,
        "actual_365",
      ),
      amount,
    });
  }
  return flows;
}

function accruedInterestForBond(
  bond: FinancialMarketBondDefinition,
  settlementDate: string,
  faceQuantity: string,
): string {
  if (bond.couponType === "zero_coupon") return "0";
  const settlement = parseDate(settlementDate);
  const entry = generateBondCouponSchedule(bond).find((candidate) =>
    settlement > parseDate(candidate.accrualStartDate) &&
    settlement < parseDate(candidate.paymentDate)
  );
  if (!entry) return "0";
  const fraction = calculateDayCountFraction(
    entry.accrualStartDate,
    settlementDate,
    bond.dayCountConvention,
  );
  return multiplyMarketDecimals(
    multiplyMarketDecimals(
      multiplyMarketDecimals(bond.faceValue, faceQuantity),
      bond.couponRateAnnual,
    ),
    fraction,
  );
}

function presentValue(
  flows: readonly { readonly years: number; readonly amount: number }[],
  annualYield: number,
  frequency: number,
): number {
  const periodicRate = annualYield / frequency;
  if (1 + periodicRate <= 0) {
    throw new Error("Yield creates a non-positive discount base.");
  }
  return flows.reduce(
    (total, flow) =>
      total + flow.amount / Math.pow(1 + periodicRate, frequency * flow.years),
    0,
  );
}

function solveYieldToMaturity(
  flows: readonly { readonly years: number; readonly amount: number }[],
  dirtyPrice: number,
  frequency: number,
  policy: FixedIncomeYieldPolicy,
): number {
  if (!Number.isFinite(dirtyPrice) || dirtyPrice <= 0) {
    throw new Error("Dirty price must be positive.");
  }
  let low = policy.minimumYield;
  let high = policy.maximumYield;
  let lowValue = presentValue(flows, low, frequency) - dirtyPrice;
  let highValue = presentValue(flows, high, frequency) - dirtyPrice;
  if (lowValue === 0) return low;
  if (highValue === 0) return high;
  if (lowValue * highValue > 0) {
    throw new Error("Price does not imply a yield inside approved bounds.");
  }
  for (let iteration = 0; iteration < 160; iteration += 1) {
    const middle = (low + high) / 2;
    const middleValue = presentValue(flows, middle, frequency) - dirtyPrice;
    if (Math.abs(middleValue) < 1e-10) return middle;
    if (lowValue * middleValue <= 0) {
      high = middle;
      highValue = middleValue;
    } else {
      low = middle;
      lowValue = middleValue;
    }
  }
  return (low + high) / 2;
}

function durationAndConvexity(
  flows: readonly { readonly years: number; readonly amount: number }[],
  annualYield: number,
  frequency: number,
  price: number,
): {
  readonly macaulay: number;
  readonly modified: number;
  readonly convexity: number;
} {
  const periodicRate = annualYield / frequency;
  let weightedTime = 0;
  let convexityNumerator = 0;
  for (const flow of flows) {
    const periods = frequency * flow.years;
    const discounted = flow.amount / Math.pow(1 + periodicRate, periods);
    weightedTime += flow.years * discounted;
    convexityNumerator += discounted * periods * (periods + 1);
  }
  const macaulay = weightedTime / price;
  const modified = macaulay / (1 + periodicRate);
  const convexity = convexityNumerator /
    (price * frequency * frequency * Math.pow(1 + periodicRate, 2));
  return { macaulay, modified, convexity };
}

function frequencyPerYear(
  frequency: FinancialMarketBondDefinition["couponFrequency"],
): number {
  if (frequency === "annual") return 1;
  if (frequency === "semiannual") return 2;
  if (frequency === "quarterly") return 4;
  throw new Error("Unsupported coupon frequency.");
}

function validatePositiveAmount(value: string, fieldName: string): void {
  if (compareMarketDecimals(value, "0") <= 0) {
    throw new Error(`${fieldName} must be positive.`);
  }
}

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Date must use YYYY-MM-DD.");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Date is invalid.");
  }
  return date;
}

function toDecimal(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("Calculated amount is not finite.");
  }
  return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}
