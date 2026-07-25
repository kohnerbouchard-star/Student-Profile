import type {
  FinancialMarketYieldCurvePoint,
  FinancialMarketYieldCurveVersion,
} from "../contracts/financialMarketContracts.ts";

export interface YieldCurveInterpolationPolicy {
  readonly minimumRate: number;
  readonly maximumRate: number;
  readonly maximumTenorDays: number;
  readonly maximumExtrapolationSlopePerDay: number;
  readonly negativeRatesSupported: false;
}

export interface IssuerYieldInput {
  readonly curve: FinancialMarketYieldCurveVersion;
  readonly tenorDays: number;
  readonly issuerCreditSpread: number;
  readonly issueLiquiditySpread: number;
  readonly issueEventAdjustment: number;
  readonly policy?: YieldCurveInterpolationPolicy;
}

export interface IssuerYieldResult {
  readonly tenorDays: number;
  readonly riskFreeRate: number;
  readonly issuerCreditSpread: number;
  readonly issueLiquiditySpread: number;
  readonly eventAdjustment: number;
  readonly yieldRate: number;
  readonly curveVersion: number;
  readonly interpolationKind:
    | "exact"
    | "interpolated"
    | "extrapolated_short"
    | "extrapolated_long";
}

export const DEFAULT_YIELD_CURVE_POLICY: YieldCurveInterpolationPolicy =
  Object.freeze({
    minimumRate: 0,
    maximumRate: 0.6,
    maximumTenorDays: 18_250,
    maximumExtrapolationSlopePerDay: 0.00005,
    negativeRatesSupported: false,
  });

export function interpolateYieldCurve(
  curve: FinancialMarketYieldCurveVersion,
  tenorDays: number,
  policy: YieldCurveInterpolationPolicy = DEFAULT_YIELD_CURVE_POLICY,
): Pick<IssuerYieldResult, "riskFreeRate" | "interpolationKind"> {
  validateCurve(curve, policy);
  validateTenor(tenorDays, policy);
  const points = [...curve.points].sort((left, right) =>
    left.tenorDays - right.tenorDays
  );

  const exact = points.find((point) => point.tenorDays === tenorDays);
  if (exact) {
    return {
      riskFreeRate: roundRate(exact.continuouslyCompoundedZeroRate),
      interpolationKind: "exact",
    };
  }

  const first = points[0];
  const last = points[points.length - 1];
  if (tenorDays < first.tenorDays) {
    const second = points[1];
    return {
      riskFreeRate: extrapolateBounded(
        first,
        second,
        tenorDays,
        policy,
      ),
      interpolationKind: "extrapolated_short",
    };
  }
  if (tenorDays > last.tenorDays) {
    const prior = points[points.length - 2];
    return {
      riskFreeRate: extrapolateBounded(
        prior,
        last,
        tenorDays,
        policy,
      ),
      interpolationKind: "extrapolated_long",
    };
  }

  for (let index = 1; index < points.length; index += 1) {
    const right = points[index];
    if (right.tenorDays > tenorDays) {
      const left = points[index - 1];
      const weight = (tenorDays - left.tenorDays) /
        (right.tenorDays - left.tenorDays);
      const rate = left.continuouslyCompoundedZeroRate +
        weight * (
          right.continuouslyCompoundedZeroRate -
          left.continuouslyCompoundedZeroRate
        );
      return {
        riskFreeRate: clampRate(rate, policy),
        interpolationKind: "interpolated",
      };
    }
  }

  throw new Error("Yield curve interpolation could not resolve the tenor.");
}

export function calculateIssuerYield(input: IssuerYieldInput): IssuerYieldResult {
  const policy = input.policy ?? DEFAULT_YIELD_CURVE_POLICY;
  for (const [label, value] of [
    ["issuerCreditSpread", input.issuerCreditSpread],
    ["issueLiquiditySpread", input.issueLiquiditySpread],
    ["issueEventAdjustment", input.issueEventAdjustment],
  ] as const) {
    if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  }
  if (input.issuerCreditSpread < 0 || input.issueLiquiditySpread < 0) {
    throw new Error("Credit and liquidity spreads must be non-negative.");
  }

  const interpolated = interpolateYieldCurve(input.curve, input.tenorDays, policy);
  const yieldRate = clampRate(
    interpolated.riskFreeRate +
      input.issuerCreditSpread +
      input.issueLiquiditySpread +
      input.issueEventAdjustment,
    policy,
  );
  return {
    tenorDays: input.tenorDays,
    riskFreeRate: interpolated.riskFreeRate,
    issuerCreditSpread: roundRate(input.issuerCreditSpread),
    issueLiquiditySpread: roundRate(input.issueLiquiditySpread),
    eventAdjustment: roundRate(input.issueEventAdjustment),
    yieldRate,
    curveVersion: input.curve.version,
    interpolationKind: interpolated.interpolationKind,
  };
}

export function validateYieldCurve(
  curve: FinancialMarketYieldCurveVersion,
  policy: YieldCurveInterpolationPolicy = DEFAULT_YIELD_CURVE_POLICY,
): readonly string[] {
  const errors: string[] = [];
  try {
    validateCurve(curve, policy);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return errors;
}

function validateCurve(
  curve: FinancialMarketYieldCurveVersion,
  policy: YieldCurveInterpolationPolicy,
): void {
  validatePolicy(policy);
  if (!curve.curvePublicId || !curve.gamePublicId) {
    throw new Error("Yield curve public identities are required.");
  }
  if (!Number.isInteger(curve.version) || curve.version < 1) {
    throw new Error("Yield curve version must be a positive integer.");
  }
  if (!Array.isArray(curve.points) || curve.points.length < 2) {
    throw new Error("Yield curve requires at least two tenor points.");
  }

  let priorTenor = -1;
  for (const point of [...curve.points].sort((left, right) =>
    left.tenorDays - right.tenorDays
  )) {
    if (!Number.isInteger(point.tenorDays) || point.tenorDays <= 0) {
      throw new Error("Yield curve tenor days must be positive integers.");
    }
    if (point.tenorDays <= priorTenor) {
      throw new Error("Yield curve tenors must be unique and increasing.");
    }
    if (!Number.isFinite(point.continuouslyCompoundedZeroRate)) {
      throw new Error("Yield curve rates must be finite.");
    }
    if (!policy.negativeRatesSupported &&
      point.continuouslyCompoundedZeroRate < 0) {
      throw new Error("Negative yield-curve rates are not supported.");
    }
    if (point.continuouslyCompoundedZeroRate < policy.minimumRate ||
      point.continuouslyCompoundedZeroRate > policy.maximumRate) {
      throw new Error("Yield curve rate exceeds approved bounds.");
    }
    priorTenor = point.tenorDays;
  }
}

function validatePolicy(policy: YieldCurveInterpolationPolicy): void {
  if (policy.negativeRatesSupported !== false) {
    throw new Error("Negative rates remain disabled.");
  }
  if (!Number.isFinite(policy.minimumRate) ||
    !Number.isFinite(policy.maximumRate) ||
    policy.minimumRate < 0 ||
    policy.maximumRate <= policy.minimumRate ||
    !Number.isInteger(policy.maximumTenorDays) ||
    policy.maximumTenorDays <= 0 ||
    !Number.isFinite(policy.maximumExtrapolationSlopePerDay) ||
    policy.maximumExtrapolationSlopePerDay < 0) {
    throw new Error("Yield curve interpolation policy is invalid.");
  }
}

function validateTenor(
  tenorDays: number,
  policy: YieldCurveInterpolationPolicy,
): void {
  if (!Number.isInteger(tenorDays) || tenorDays <= 0) {
    throw new Error("Requested tenor must be a positive integer number of days.");
  }
  if (tenorDays > policy.maximumTenorDays) {
    throw new Error("Requested tenor exceeds the approved extrapolation bound.");
  }
}

function extrapolateBounded(
  left: FinancialMarketYieldCurvePoint,
  right: FinancialMarketYieldCurvePoint,
  tenorDays: number,
  policy: YieldCurveInterpolationPolicy,
): number {
  const rawSlope = (
    right.continuouslyCompoundedZeroRate -
    left.continuouslyCompoundedZeroRate
  ) / (right.tenorDays - left.tenorDays);
  const slope = Math.max(
    -policy.maximumExtrapolationSlopePerDay,
    Math.min(policy.maximumExtrapolationSlopePerDay, rawSlope),
  );
  const anchor = tenorDays < left.tenorDays ? left : right;
  return clampRate(
    anchor.continuouslyCompoundedZeroRate +
      slope * (tenorDays - anchor.tenorDays),
    policy,
  );
}

function clampRate(
  value: number,
  policy: YieldCurveInterpolationPolicy,
): number {
  return roundRate(Math.max(policy.minimumRate, Math.min(policy.maximumRate, value)));
}

function roundRate(value: number): number {
  return Number(value.toFixed(8));
}
