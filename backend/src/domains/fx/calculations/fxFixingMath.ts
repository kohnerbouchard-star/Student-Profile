import {
  FX_NUMERAIRE_CURRENCY_CODE,
  type FxFixingComponentBreakdown,
  type FxFixingCurrencyValue,
  type FxFixingStoryShockInput,
  type FxNationalCurrencyCode,
} from "../contracts/fxFixingContracts.ts";
import {
  DECIMAL_PLACES,
  MAX_NUMERIC_MAGNITUDE,
  SCALE,
  type MacroMedians,
  type NormalizedCurrencyInput,
  type NormalizedPolicy,
} from "./fxFixingModel.ts";

const ZERO_DECIMAL = formatDecimal(0n);
const ONE_DECIMAL = formatDecimal(SCALE);

export function calculateMedians(
  currencies: readonly NormalizedCurrencyInput[],
): MacroMedians {
  return {
    realGdpIndex: median(currencies.map((currency) => currency.realGdpIndex)),
    gdpGrowthRate: median(
      currencies.map((currency) => currency.gdpGrowthRate),
    ),
    inflationRate: median(
      currencies.map((currency) => currency.inflationRate),
    ),
    realInterestRate: median(
      currencies.map((currency) =>
        currency.interestRate - currency.inflationRate
      ),
    ),
    consumerConfidenceIndex: median(
      currencies.map((currency) => currency.consumerConfidenceIndex),
    ),
    businessConfidenceIndex: median(
      currencies.map((currency) => currency.businessConfidenceIndex),
    ),
    importDependencyIndex: median(
      currencies.map((currency) => currency.importDependencyIndex),
    ),
    currencyStabilityIndex: median(
      currencies.map((currency) => currency.currencyStabilityIndex),
    ),
    tradeBalanceIndex: median(
      currencies.map((currency) => currency.tradeBalanceIndex),
    ),
    exportStrengthIndex: median(
      currencies.map((currency) => currency.exportStrengthIndex),
    ),
    marketRiskIndex: median(
      currencies.map((currency) => currency.marketRiskIndex),
    ),
    politicalStabilityIndex: median(
      currencies.map((currency) => currency.politicalStabilityIndex),
    ),
  };
}

export function calculateComponents(
  currency: NormalizedCurrencyInput,
  medians: MacroMedians,
  storyShocks: readonly FxFixingStoryShockInput[],
  policy: NormalizedPolicy,
): FxFixingComponentBreakdown {
  const gdpStrength = weightedAverage([
    [
      normalizedDifference(
        currency.realGdpIndex,
        medians.realGdpIndex,
        policy.gdp.levelNormalizer,
      ),
      policy.gdp.levelWeightBasisPoints,
    ],
    [
      normalizedDifference(
        currency.gdpGrowthRate,
        medians.gdpGrowthRate,
        policy.gdp.growthNormalizer,
      ),
      policy.gdp.growthWeightBasisPoints,
    ],
  ]);
  const gdpBasisPoints = componentBasisPoints(
    -gdpStrength,
    policy.gdp.capBasisPoints,
  );

  const inflationPressure = normalizedDifference(
    currency.inflationRate,
    medians.inflationRate,
    policy.inflation.normalizer,
  );
  const inflationBasisPoints = componentBasisPoints(
    inflationPressure,
    policy.inflation.capBasisPoints,
  );

  const realInterestStrength = normalizedDifference(
    currency.interestRate - currency.inflationRate,
    medians.realInterestRate,
    policy.realInterest.normalizer,
  );
  const realInterestBasisPoints = componentBasisPoints(
    -realInterestStrength,
    policy.realInterest.capBasisPoints,
  );

  const tradeStrength = weightedAverage([
    [
      normalizedDifference(
        currency.tradeBalanceIndex,
        medians.tradeBalanceIndex,
        policy.trade.tradeBalanceNormalizer,
      ),
      policy.trade.tradeBalanceWeightBasisPoints,
    ],
    [
      normalizedDifference(
        currency.exportStrengthIndex,
        medians.exportStrengthIndex,
        policy.trade.exportStrengthNormalizer,
      ),
      policy.trade.exportStrengthWeightBasisPoints,
    ],
    [
      -normalizedDifference(
        currency.importDependencyIndex,
        medians.importDependencyIndex,
        policy.trade.importDependencyNormalizer,
      ),
      policy.trade.inverseImportDependencyWeightBasisPoints,
    ],
  ]);
  const tradeBasisPoints = componentBasisPoints(
    -tradeStrength,
    policy.trade.capBasisPoints,
  );

  const confidenceStabilityStrength = weightedAverage([
    [
      normalizedDifference(
        currency.consumerConfidenceIndex,
        medians.consumerConfidenceIndex,
        policy.confidenceStability.confidenceNormalizer,
      ),
      policy.confidenceStability.signalWeightBasisPoints,
    ],
    [
      normalizedDifference(
        currency.businessConfidenceIndex,
        medians.businessConfidenceIndex,
        policy.confidenceStability.confidenceNormalizer,
      ),
      policy.confidenceStability.signalWeightBasisPoints,
    ],
    [
      normalizedDifference(
        currency.currencyStabilityIndex,
        medians.currencyStabilityIndex,
        policy.confidenceStability.indexNormalizer,
      ),
      policy.confidenceStability.signalWeightBasisPoints,
    ],
    [
      normalizedDifference(
        currency.politicalStabilityIndex,
        medians.politicalStabilityIndex,
        policy.confidenceStability.indexNormalizer,
      ),
      policy.confidenceStability.signalWeightBasisPoints,
    ],
    [
      -normalizedDifference(
        currency.marketRiskIndex,
        medians.marketRiskIndex,
        policy.confidenceStability.indexNormalizer,
      ),
      policy.confidenceStability.signalWeightBasisPoints,
    ],
  ]);
  const confidenceStabilityBasisPoints = componentBasisPoints(
    -confidenceStabilityStrength,
    policy.confidenceStability.capBasisPoints,
  );

  const fundamentalBasisPoints = clampNumber(
    gdpBasisPoints + inflationBasisPoints + realInterestBasisPoints +
      tradeBasisPoints + confidenceStabilityBasisPoints,
    -policy.normalMovementCapBasisPoints,
    policy.normalMovementCapBasisPoints,
  );
  const storyBasisPoints = clampNumber(
    storyShocks.reduce((total, shock) => total + shock.basisPoints, 0),
    -policy.crisisMovementCapBasisPoints,
    policy.crisisMovementCapBasisPoints,
  );
  const finalBasisPoints = storyShocks.length === 0
    ? fundamentalBasisPoints
    : clampNumber(
      fundamentalBasisPoints + storyBasisPoints,
      -policy.crisisMovementCapBasisPoints,
      policy.crisisMovementCapBasisPoints,
    );

  return {
    gdpBasisPoints,
    inflationBasisPoints,
    realInterestBasisPoints,
    tradeBasisPoints,
    confidenceStabilityBasisPoints,
    fundamentalBasisPoints,
    storyBasisPoints,
    finalBasisPoints,
  };
}

export function groupStoryShocks(
  shocks: readonly FxFixingStoryShockInput[],
): ReadonlyMap<FxNationalCurrencyCode, readonly FxFixingStoryShockInput[]> {
  const grouped = new Map<
    FxNationalCurrencyCode,
    FxFixingStoryShockInput[]
  >();
  for (const shock of shocks) {
    const existing = grouped.get(shock.currencyCode) ?? [];
    existing.push(shock);
    grouped.set(shock.currencyCode, existing);
  }
  return grouped;
}

export function numeraireValue(): FxFixingCurrencyValue {
  return {
    currencyCode: FX_NUMERAIRE_CURRENCY_CODE,
    countryCode: null,
    snapshotId: null,
    snapshotSequence: null,
    previousUnitsPerEco: ONE_DECIMAL,
    unitsPerEco: ONE_DECIMAL,
    components: zeroComponents(),
    appliedStoryShockIds: [],
  };
}

function zeroComponents(): FxFixingComponentBreakdown {
  return {
    gdpBasisPoints: 0,
    inflationBasisPoints: 0,
    realInterestBasisPoints: 0,
    tradeBasisPoints: 0,
    confidenceStabilityBasisPoints: 0,
    fundamentalBasisPoints: 0,
    storyBasisPoints: 0,
    finalBasisPoints: 0,
  };
}

function normalizedDifference(
  value: bigint,
  benchmark: bigint,
  normalizer: bigint,
): bigint {
  return clampBigInt(
    roundDivideHalfAwayFromZero((value - benchmark) * SCALE, normalizer),
    -SCALE,
    SCALE,
  );
}

function weightedAverage(
  values: readonly (readonly [value: bigint, weight: number])[],
): bigint {
  const totalWeight = values.reduce((total, [, weight]) => total + weight, 0);
  if (!Number.isSafeInteger(totalWeight) || totalWeight <= 0) {
    throw new Error("component weights must have a positive safe-integer sum");
  }
  const weightedTotal = values.reduce(
    (total, [value, weight]) => total + value * BigInt(weight),
    0n,
  );
  return roundDivideHalfAwayFromZero(weightedTotal, BigInt(totalWeight));
}

function componentBasisPoints(normalized: bigint, cap: number): number {
  const rounded = roundDivideHalfAwayFromZero(
    normalized * BigInt(cap),
    SCALE,
  );
  return Number(clampBigInt(rounded, BigInt(-cap), BigInt(cap)));
}

export function applyBasisPointMovement(
  previousUnitsPerEco: bigint,
  basisPoints: number,
): bigint {
  const multiplierBasisPoints = 10_000 + basisPoints;
  const result = roundDivideHalfAwayFromZero(
    previousUnitsPerEco * BigInt(multiplierBasisPoints),
    10_000n,
  );
  if (result <= 0n) {
    throw new Error("calculated unitsPerEco must be greater than zero");
  }
  if (result > MAX_NUMERIC_MAGNITUDE) {
    throw new Error("calculated unitsPerEco exceeds numeric(38,18)");
  }
  return result;
}

function median(values: readonly bigint[]): bigint {
  if (values.length === 0) {
    throw new Error("median requires at least one value");
  }
  const sorted = [...values].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0
  );
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[midpoint];
  return roundDivideHalfAwayFromZero(
    sorted[midpoint - 1] + sorted[midpoint],
    2n,
  );
}

export function parseDecimal(value: string, label: string): bigint {
  if (typeof value !== "string" || value.length > 128) {
    throw new Error(`${label} must be a bounded decimal string`);
  }
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (match === null || match[2].length > 30) {
    throw new Error(
      `${label} must be a base-10 decimal without exponent notation`,
    );
  }

  const sign = match[1] === "-" ? -1n : 1n;
  const whole = BigInt(match[2]);
  const fraction = match[3] ?? "";
  const retained = fraction.slice(0, DECIMAL_PLACES).padEnd(
    DECIMAL_PLACES,
    "0",
  );
  let magnitude = whole * SCALE + BigInt(retained);
  if (
    fraction.length > DECIMAL_PLACES &&
    fraction[DECIMAL_PLACES] >= "5"
  ) {
    magnitude += 1n;
  }
  if (magnitude > MAX_NUMERIC_MAGNITUDE) {
    throw new Error(`${label} exceeds numeric(38,18)`);
  }
  return sign * magnitude;
}

export function formatDecimal(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const magnitude = value < 0n ? -value : value;
  const whole = magnitude / SCALE;
  const fraction = (magnitude % SCALE).toString().padStart(DECIMAL_PLACES, "0");
  return `${sign}${whole}.${fraction}`;
}

export function decimalConstant(value: string): bigint {
  return parseDecimal(value, "policy decimal");
}

export function roundDivideHalfAwayFromZero(
  numerator: bigint,
  denominator: bigint,
): bigint {
  if (denominator <= 0n) throw new Error("denominator must be positive");
  const sign = numerator < 0n ? -1n : 1n;
  const magnitude = numerator < 0n ? -numerator : numerator;
  const quotient = magnitude / denominator;
  const remainder = magnitude % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return sign * rounded;
}

export function clampBigInt(value: bigint, minimum: bigint, maximum: bigint): bigint {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

export function clampNumber(value: number, minimum: number, maximum: number): number {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export const FX_FIXING_ZERO_DECIMAL = ZERO_DECIMAL;
