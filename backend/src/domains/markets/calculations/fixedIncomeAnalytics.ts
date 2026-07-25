import type {
  FinancialMarketBondDefinition,
  FinancialMarketCountryCode,
  FinancialMarketYieldCurveVersion,
} from "../contracts/financialMarketContracts.ts";
import {
  generateBondCouponSchedule,
  calculateDayCountFraction,
} from "./bondMath.ts";
import {
  addMarketDecimals,
  compareMarketDecimals,
  marketDecimalToNumber,
  multiplyMarketDecimals,
} from "./decimalMath.ts";

export interface FixedIncomeYieldPolicy {
  readonly minimumYield: number;
  readonly maximumYield: number;
  readonly negativeYieldsSupported: boolean;
  readonly maximumCreditSpread: number;
  readonly maximumLiquiditySpread: number;
  readonly maximumEventAdjustmentAbsolute: number;
}

export interface FixedIncomeCurvePolicy {
  readonly minimumRate: number;
  readonly maximumRate: number;
  readonly negativeRatesSupported: boolean;
  readonly maximumTenorDays: number;
  readonly maximumExtrapolationSlopePerDay: number;
  readonly maximumEventAdjustmentAbsolute: number;
}

export interface FixedIncomeCurveValidationReport {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly deterministicVersionKey: string;
  readonly invertedSegmentCount: number;
}

export interface FixedIncomeYieldResolution {
  readonly riskFreeRate: number;
  readonly creditSpread: number;
  readonly liquiditySpread: number;
  readonly eventAdjustment: number;
  readonly yieldRate: number;
  readonly curveVersion: number;
  readonly interpolationKind:
    | "exact"
    | "interpolated"
    | "extrapolated_short"
    | "extrapolated_long";
}

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

export const DEFAULT_FIXED_INCOME_YIELD_POLICY: FixedIncomeYieldPolicy =
  Object.freeze({
    minimumYield: 0,
    maximumYield: 1,
    negativeYieldsSupported: false,
    maximumCreditSpread: 0.5,
    maximumLiquiditySpread: 0.25,
    maximumEventAdjustmentAbsolute: 0.2,
  });

export const NEGATIVE_YIELD_REFERENCE_POLICY: FixedIncomeYieldPolicy =
  Object.freeze({
    minimumYield: -0.1,
    maximumYield: 1,
    negativeYieldsSupported: true,
    maximumCreditSpread: 0.5,
    maximumLiquiditySpread: 0.25,
    maximumEventAdjustmentAbsolute: 0.2,
  });

export const DEFAULT_FIXED_INCOME_CURVE_POLICY: FixedIncomeCurvePolicy =
  Object.freeze({
    minimumRate: 0,
    maximumRate: 0.6,
    negativeRatesSupported: false,
    maximumTenorDays: 18_250,
    maximumExtrapolationSlopePerDay: 0.00005,
    maximumEventAdjustmentAbsolute: 0.2,
  });

const COUNTRY_CURRENCY: Readonly<Record<FinancialMarketCountryCode, string>> = {
  NORTHREACH: "NRC",
  YRETHIA: "YRC",
  THALORIS: "THD",
  SOLVEND: "SLV",
  ELDORAN: "ELD",
  VALERION: "VAL",
  LUMENOR: "LUM",
  XALVORIA: "XAL",
  DRAVENLOK: "DRV",
  SYNDALIS: "SYN",
};

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
  const cleanValue = Math.max(0, dirtyValue - marketDecimalToNumber(accruedInterest));
  const cleanPrice = input.cleanPrice ?? toDecimal(cleanValue);
  if (input.cleanPrice) validatePositiveAmount(input.cleanPrice, "cleanPrice");
  const marketDirtyPrice = marketDecimalToNumber(cleanPrice) +
    marketDecimalToNumber(accruedInterest);
  const ytm = solveYieldToMaturity(flows, marketDirtyPrice, frequency, policy);
  const duration = durationAndConvexity(flows, ytm, frequency, marketDirtyPrice);
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

export function validateVersionedFixedIncomeCurve(
  curve: FinancialMarketYieldCurveVersion,
  policy: FixedIncomeCurvePolicy = DEFAULT_FIXED_INCOME_CURVE_POLICY,
): FixedIncomeCurveValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  validateCurvePolicy(policy, errors);
  if (!curve.curvePublicId || !curve.gamePublicId) errors.push("curve_identity_required");
  if (!Number.isInteger(curve.version) || curve.version < 1) errors.push("curve_version_invalid");
  if (!/^[A-Z]{3,16}$/.test(curve.currencyCode)) errors.push("curve_currency_invalid");
  if (COUNTRY_CURRENCY[curve.countryCode] !== curve.currencyCode) {
    errors.push("curve_country_currency_mismatch");
  }
  if (!/^[0-9a-f]{64}$/.test(curve.inputDigestSha256)) errors.push("curve_digest_invalid");
  if (Number.isNaN(Date.parse(curve.observedAt))) errors.push("curve_observed_at_invalid");
  if (!Array.isArray(curve.points) || curve.points.length < 2 || curve.points.length > 128) {
    errors.push("curve_point_count_invalid");
  }
  let priorTenor = 0;
  let priorRate: number | null = null;
  let invertedSegmentCount = 0;
  for (const point of curve.points) {
    if (!Number.isInteger(point.tenorDays) || point.tenorDays <= priorTenor ||
      point.tenorDays > policy.maximumTenorDays) {
      errors.push("curve_tenor_order_invalid");
    }
    if (!Number.isFinite(point.continuouslyCompoundedZeroRate) ||
      point.continuouslyCompoundedZeroRate < policy.minimumRate ||
      point.continuouslyCompoundedZeroRate > policy.maximumRate) {
      errors.push("curve_rate_out_of_bounds");
    }
    if (!policy.negativeRatesSupported && point.continuouslyCompoundedZeroRate < 0) {
      errors.push("negative_curve_rate_disabled");
    }
    if (priorRate !== null && point.continuouslyCompoundedZeroRate < priorRate) {
      invertedSegmentCount += 1;
    }
    priorTenor = point.tenorDays;
    priorRate = point.continuouslyCompoundedZeroRate;
  }
  if (invertedSegmentCount > 0) warnings.push("curve_contains_inverted_segments");
  if (Math.abs(curve.eventAdjustment) > policy.maximumEventAdjustmentAbsolute) {
    errors.push("curve_event_adjustment_out_of_bounds");
  }
  const deterministicVersionKey = [
    curve.curvePublicId,
    curve.gamePublicId,
    curve.countryCode,
    curve.currencyCode,
    curve.version,
    curve.observedAt,
    curve.inputDigestSha256,
  ].join(":");
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)].sort(),
    warnings: [...new Set(warnings)].sort(),
    deterministicVersionKey,
    invertedSegmentCount,
  };
}

export function resolveFixedIncomeYield(input: {
  readonly curve: FinancialMarketYieldCurveVersion;
  readonly tenorDays: number;
  readonly creditSpread: number;
  readonly liquiditySpread: number;
  readonly eventAdjustment: number;
  readonly curvePolicy?: FixedIncomeCurvePolicy;
  readonly yieldPolicy?: FixedIncomeYieldPolicy;
}): FixedIncomeYieldResolution {
  const curvePolicy = input.curvePolicy ?? DEFAULT_FIXED_INCOME_CURVE_POLICY;
  const yieldPolicy = input.yieldPolicy ?? DEFAULT_FIXED_INCOME_YIELD_POLICY;
  const validation = validateVersionedFixedIncomeCurve(input.curve, curvePolicy);
  if (!validation.valid) throw new Error(`Invalid yield curve: ${validation.errors.join(",")}`);
  if (!Number.isInteger(input.tenorDays) || input.tenorDays <= 0 ||
    input.tenorDays > curvePolicy.maximumTenorDays) {
    throw new Error("Requested tenor is invalid.");
  }
  if (!Number.isFinite(input.creditSpread) || input.creditSpread < 0 ||
    input.creditSpread > yieldPolicy.maximumCreditSpread) {
    throw new Error("Credit spread is invalid.");
  }
  if (!Number.isFinite(input.liquiditySpread) || input.liquiditySpread < 0 ||
    input.liquiditySpread > yieldPolicy.maximumLiquiditySpread) {
    throw new Error("Liquidity spread is invalid.");
  }
  if (!Number.isFinite(input.eventAdjustment) ||
    Math.abs(input.eventAdjustment) > yieldPolicy.maximumEventAdjustmentAbsolute) {
    throw new Error("Yield event adjustment is invalid.");
  }
  const interpolated = interpolateCurve(input.curve, input.tenorDays, curvePolicy);
  const yieldRate = interpolated.rate + input.creditSpread +
    input.liquiditySpread + input.eventAdjustment;
  validateYield(yieldRate, yieldPolicy);
  return {
    riskFreeRate: round(interpolated.rate, 10),
    creditSpread: round(input.creditSpread, 10),
    liquiditySpread: round(input.liquiditySpread, 10),
    eventAdjustment: round(input.eventAdjustment, 10),
    yieldRate: round(yieldRate, 10),
    curveVersion: input.curve.version,
    interpolationKind: interpolated.kind,
  };
}

function futureBondCashFlows(
  bond: FinancialMarketBondDefinition,
  settlementDate: string,
  faceQuantity: string,
): readonly { readonly paymentDate: string; readonly years: number; readonly amount: number }[] {
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
      years: calculateDayCountFraction(settlementDate, entry.paymentDate, "actual_365"),
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
  if (1 + periodicRate <= 0) throw new Error("Yield creates a non-positive discount base.");
  return flows.reduce((total, flow) =>
    total + flow.amount / Math.pow(1 + periodicRate, frequency * flow.years), 0);
}

function solveYieldToMaturity(
  flows: readonly { readonly years: number; readonly amount: number }[],
  dirtyPrice: number,
  frequency: number,
  policy: FixedIncomeYieldPolicy,
): number {
  if (!Number.isFinite(dirtyPrice) || dirtyPrice <= 0) throw new Error("Dirty price must be positive.");
  let low = policy.minimumYield;
  let high = policy.maximumYield;
  let lowValue = presentValue(flows, low, frequency) - dirtyPrice;
  let highValue = presentValue(flows, high, frequency) - dirtyPrice;
  if (lowValue === 0) return low;
  if (highValue === 0) return high;
  if (lowValue * highValue > 0) throw new Error("Price does not imply a yield inside approved bounds.");
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
): { readonly macaulay: number; readonly modified: number; readonly convexity: number } {
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

function interpolateCurve(
  curve: FinancialMarketYieldCurveVersion,
  tenorDays: number,
  policy: FixedIncomeCurvePolicy,
): { readonly rate: number; readonly kind: FixedIncomeYieldResolution["interpolationKind"] } {
  const points = curve.points;
  const exact = points.find((point) => point.tenorDays === tenorDays);
  if (exact) return { rate: exact.continuouslyCompoundedZeroRate, kind: "exact" };
  if (tenorDays < points[0].tenorDays) {
    return {
      rate: extrapolate(points[0], points[1], tenorDays, policy),
      kind: "extrapolated_short",
    };
  }
  if (tenorDays > points[points.length - 1].tenorDays) {
    return {
      rate: extrapolate(points[points.length - 2], points[points.length - 1], tenorDays, policy),
      kind: "extrapolated_long",
    };
  }
  for (let index = 1; index < points.length; index += 1) {
    const right = points[index];
    if (right.tenorDays > tenorDays) {
      const left = points[index - 1];
      const weight = (tenorDays - left.tenorDays) /
        (right.tenorDays - left.tenorDays);
      return {
        rate: clamp(
          left.continuouslyCompoundedZeroRate +
            weight * (right.continuouslyCompoundedZeroRate - left.continuouslyCompoundedZeroRate),
          policy.minimumRate,
          policy.maximumRate,
        ),
        kind: "interpolated",
      };
    }
  }
  throw new Error("Curve interpolation failed.");
}

function extrapolate(
  left: FinancialMarketYieldCurveVersion["points"][number],
  right: FinancialMarketYieldCurveVersion["points"][number],
  tenorDays: number,
  policy: FixedIncomeCurvePolicy,
): number {
  const rawSlope = (right.continuouslyCompoundedZeroRate -
    left.continuouslyCompoundedZeroRate) / (right.tenorDays - left.tenorDays);
  const slope = clamp(
    rawSlope,
    -policy.maximumExtrapolationSlopePerDay,
    policy.maximumExtrapolationSlopePerDay,
  );
  const anchor = tenorDays < left.tenorDays ? left : right;
  return clamp(
    anchor.continuouslyCompoundedZeroRate + slope * (tenorDays - anchor.tenorDays),
    policy.minimumRate,
    policy.maximumRate,
  );
}

function validateYield(value: number, policy: FixedIncomeYieldPolicy): void {
  if (!Number.isFinite(value) || value < policy.minimumYield || value > policy.maximumYield) {
    throw new Error("Yield exceeds approved bounds.");
  }
  if (!policy.negativeYieldsSupported && value < 0) {
    throw new Error("Negative yields are disabled by policy.");
  }
  if (1 + value / 4 <= 0) throw new Error("Yield is numerically invalid.");
}

function validateCurvePolicy(policy: FixedIncomeCurvePolicy, errors: string[]): void {
  if (!Number.isFinite(policy.minimumRate) || !Number.isFinite(policy.maximumRate) ||
    policy.maximumRate <= policy.minimumRate ||
    (!policy.negativeRatesSupported && policy.minimumRate < 0) ||
    !Number.isInteger(policy.maximumTenorDays) || policy.maximumTenorDays <= 0 ||
    !Number.isFinite(policy.maximumExtrapolationSlopePerDay) ||
    policy.maximumExtrapolationSlopePerDay < 0 ||
    !Number.isFinite(policy.maximumEventAdjustmentAbsolute) ||
    policy.maximumEventAdjustmentAbsolute < 0) {
    errors.push("curve_policy_invalid");
  }
}

function frequencyPerYear(frequency: FinancialMarketBondDefinition["couponFrequency"]): number {
  if (frequency === "annual") return 1;
  if (frequency === "semiannual") return 2;
  if (frequency === "quarterly") return 4;
  throw new Error("Unsupported coupon frequency.");
}

function validatePositiveAmount(value: string, fieldName: string): void {
  if (compareMarketDecimals(value, "0") <= 0) throw new Error(`${fieldName} must be positive.`);
}

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Date must use YYYY-MM-DD.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Date is invalid.");
  }
  return date;
}

function toDecimal(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Calculated amount is not finite.");
  return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}
