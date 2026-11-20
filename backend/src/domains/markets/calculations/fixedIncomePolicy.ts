// Shared numerical yield bounds for bond analytics and curve resolution.
export interface FixedIncomeYieldPolicy {
  readonly minimumYield: number;
  readonly maximumYield: number;
  readonly negativeYieldsSupported: boolean;
  readonly maximumCreditSpread: number;
  readonly maximumLiquiditySpread: number;
  readonly maximumEventAdjustmentAbsolute: number;
}

export const DEFAULT_FIXED_INCOME_YIELD_POLICY: FixedIncomeYieldPolicy = Object
  .freeze({
    minimumYield: 0,
    maximumYield: 1,
    negativeYieldsSupported: false,
    maximumCreditSpread: 0.5,
    maximumLiquiditySpread: 0.25,
    maximumEventAdjustmentAbsolute: 0.2,
  });

export const NEGATIVE_YIELD_REFERENCE_POLICY: FixedIncomeYieldPolicy = Object
  .freeze({
    minimumYield: -0.1,
    maximumYield: 1,
    negativeYieldsSupported: true,
    maximumCreditSpread: 0.5,
    maximumLiquiditySpread: 0.25,
    maximumEventAdjustmentAbsolute: 0.2,
  });

export function validateYield(
  value: number,
  policy: FixedIncomeYieldPolicy,
): void {
  if (
    !Number.isFinite(value) || value < policy.minimumYield ||
    value > policy.maximumYield
  ) {
    throw new Error("Yield exceeds approved bounds.");
  }
  if (!policy.negativeYieldsSupported && value < 0) {
    throw new Error("Negative yields are disabled by policy.");
  }
  if (1 + value / 4 <= 0) throw new Error("Yield is numerically invalid.");
}

export function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}
