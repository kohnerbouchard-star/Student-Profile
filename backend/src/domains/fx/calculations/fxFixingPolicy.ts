import {
  FX_NUMERAIRE_CURRENCY_CODE,
  type FxFixingPolicyInput,
} from "../contracts/fxFixingContracts.ts";
import { FX_V1_STORAGE_ENVELOPE, type NormalizedPolicy } from "./fxFixingModel.ts";
import { formatDecimal, parseDecimal } from "./fxFixingMath.ts";

export function normalizePolicy(policy: FxFixingPolicyInput): NormalizedPolicy {
  if (
    policy === null || typeof policy !== "object" ||
    policy.parameters === null || typeof policy.parameters !== "object"
  ) {
    throw new Error("policy must be immutable policy evidence");
  }
  if (policy.fixingLocalTime !== "08:00:00") {
    throw new Error("policy fixingLocalTime must be 08:00:00");
  }

  const normalMovementCapBasisPoints = requireIntegerInRange(
    policy.normalMovementCapBasisPoints,
    1,
    FX_V1_STORAGE_ENVELOPE.normal,
    "normalMovementCapBasisPoints",
  );
  const crisisMovementCapBasisPoints = requireIntegerInRange(
    policy.crisisMovementCapBasisPoints,
    normalMovementCapBasisPoints,
    FX_V1_STORAGE_ENVELOPE.crisis,
    "crisisMovementCapBasisPoints",
  );
  const parameters = policy.parameters;
  if (parameters.numeraireCurrencyCode !== FX_NUMERAIRE_CURRENCY_CODE) {
    throw new Error("policy numeraireCurrencyCode must be ECO");
  }
  if (
    parameters.exchangeRateIndexWeightBasisPoints !== 0 ||
    parameters.bilateralTradeExposureWeightBasisPoints !== 0
  ) {
    throw new Error("non-circular v1 policy weights must remain zero");
  }

  const gdpCap = componentCap(
    parameters.gdp.capBasisPoints,
    "gdp",
    FX_V1_STORAGE_ENVELOPE.gdp,
  );
  const gdpLevelWeight = componentWeight(
    parameters.gdp.levelWeightBasisPoints,
    "gdp.levelWeightBasisPoints",
  );
  const gdpGrowthWeight = componentWeight(
    parameters.gdp.growthWeightBasisPoints,
    "gdp.growthWeightBasisPoints",
  );
  requireWeightTotal(
    [gdpLevelWeight, gdpGrowthWeight],
    "GDP policy weights",
  );

  const inflationCap = componentCap(
    parameters.inflation.capBasisPoints,
    "inflation",
    FX_V1_STORAGE_ENVELOPE.inflation,
  );
  const realInterestCap = componentCap(
    parameters.realInterest.capBasisPoints,
    "realInterest",
    FX_V1_STORAGE_ENVELOPE.realInterest,
  );

  const tradeCap = componentCap(
    parameters.trade.capBasisPoints,
    "trade",
    FX_V1_STORAGE_ENVELOPE.trade,
  );
  const tradeBalanceWeight = componentWeight(
    parameters.trade.tradeBalanceWeightBasisPoints,
    "trade.tradeBalanceWeightBasisPoints",
  );
  const exportStrengthWeight = componentWeight(
    parameters.trade.exportStrengthWeightBasisPoints,
    "trade.exportStrengthWeightBasisPoints",
  );
  const inverseImportDependencyWeight = componentWeight(
    parameters.trade.inverseImportDependencyWeightBasisPoints,
    "trade.inverseImportDependencyWeightBasisPoints",
  );
  requireWeightTotal(
    [tradeBalanceWeight, exportStrengthWeight, inverseImportDependencyWeight],
    "trade policy weights",
  );

  const confidenceCap = componentCap(
    parameters.confidenceStability.capBasisPoints,
    "confidenceStability",
    FX_V1_STORAGE_ENVELOPE.confidenceStability,
  );
  const confidenceSignalWeight = componentWeight(
    parameters.confidenceStability.signalWeightBasisPoints,
    "confidenceStability.signalWeightBasisPoints",
  );
  requireWeightTotal(
    Array(5).fill(confidenceSignalWeight),
    "confidence/stability policy weights",
  );

  if (
    normalMovementCapBasisPoints >
      gdpCap + inflationCap + realInterestCap + tradeCap + confidenceCap
  ) {
    throw new Error("normal movement cap exceeds component capacity");
  }

  return {
    fixingLocalTime: "08:00:00",
    normalMovementCapBasisPoints,
    crisisMovementCapBasisPoints,
    gdp: {
      capBasisPoints: gdpCap,
      levelWeightBasisPoints: gdpLevelWeight,
      growthWeightBasisPoints: gdpGrowthWeight,
      levelNormalizer: positivePolicyDecimal(
        parameters.gdp.levelNormalizer,
        "gdp.levelNormalizer",
      ),
      growthNormalizer: positivePolicyDecimal(
        parameters.gdp.growthNormalizer,
        "gdp.growthNormalizer",
      ),
    },
    inflation: {
      capBasisPoints: inflationCap,
      normalizer: positivePolicyDecimal(
        parameters.inflation.normalizer,
        "inflation.normalizer",
      ),
    },
    realInterest: {
      capBasisPoints: realInterestCap,
      normalizer: positivePolicyDecimal(
        parameters.realInterest.normalizer,
        "realInterest.normalizer",
      ),
    },
    trade: {
      capBasisPoints: tradeCap,
      tradeBalanceWeightBasisPoints: tradeBalanceWeight,
      exportStrengthWeightBasisPoints: exportStrengthWeight,
      inverseImportDependencyWeightBasisPoints: inverseImportDependencyWeight,
      tradeBalanceNormalizer: positivePolicyDecimal(
        parameters.trade.tradeBalanceNormalizer,
        "trade.tradeBalanceNormalizer",
      ),
      exportStrengthNormalizer: positivePolicyDecimal(
        parameters.trade.exportStrengthNormalizer,
        "trade.exportStrengthNormalizer",
      ),
      importDependencyNormalizer: positivePolicyDecimal(
        parameters.trade.importDependencyNormalizer,
        "trade.importDependencyNormalizer",
      ),
    },
    confidenceStability: {
      capBasisPoints: confidenceCap,
      signalWeightBasisPoints: confidenceSignalWeight,
      confidenceNormalizer: positivePolicyDecimal(
        parameters.confidenceStability.confidenceNormalizer,
        "confidenceStability.confidenceNormalizer",
      ),
      indexNormalizer: positivePolicyDecimal(
        parameters.confidenceStability.indexNormalizer,
        "confidenceStability.indexNormalizer",
      ),
    },
    exchangeRateIndexWeightBasisPoints: 0,
    bilateralTradeExposureWeightBasisPoints: 0,
  };
}

export function canonicalPolicy(policy: NormalizedPolicy): FxFixingPolicyInput {
  return {
    fixingLocalTime: policy.fixingLocalTime,
    normalMovementCapBasisPoints: policy.normalMovementCapBasisPoints,
    crisisMovementCapBasisPoints: policy.crisisMovementCapBasisPoints,
    parameters: {
      numeraireCurrencyCode: FX_NUMERAIRE_CURRENCY_CODE,
      gdp: {
        capBasisPoints: policy.gdp.capBasisPoints,
        levelWeightBasisPoints: policy.gdp.levelWeightBasisPoints,
        growthWeightBasisPoints: policy.gdp.growthWeightBasisPoints,
        levelNormalizer: formatDecimal(policy.gdp.levelNormalizer),
        growthNormalizer: formatDecimal(policy.gdp.growthNormalizer),
      },
      inflation: {
        capBasisPoints: policy.inflation.capBasisPoints,
        normalizer: formatDecimal(policy.inflation.normalizer),
      },
      realInterest: {
        capBasisPoints: policy.realInterest.capBasisPoints,
        normalizer: formatDecimal(policy.realInterest.normalizer),
      },
      trade: {
        capBasisPoints: policy.trade.capBasisPoints,
        tradeBalanceWeightBasisPoints:
          policy.trade.tradeBalanceWeightBasisPoints,
        exportStrengthWeightBasisPoints:
          policy.trade.exportStrengthWeightBasisPoints,
        inverseImportDependencyWeightBasisPoints:
          policy.trade.inverseImportDependencyWeightBasisPoints,
        tradeBalanceNormalizer: formatDecimal(
          policy.trade.tradeBalanceNormalizer,
        ),
        exportStrengthNormalizer: formatDecimal(
          policy.trade.exportStrengthNormalizer,
        ),
        importDependencyNormalizer: formatDecimal(
          policy.trade.importDependencyNormalizer,
        ),
      },
      confidenceStability: {
        capBasisPoints: policy.confidenceStability.capBasisPoints,
        signalWeightBasisPoints:
          policy.confidenceStability.signalWeightBasisPoints,
        confidenceNormalizer: formatDecimal(
          policy.confidenceStability.confidenceNormalizer,
        ),
        indexNormalizer: formatDecimal(
          policy.confidenceStability.indexNormalizer,
        ),
      },
      exchangeRateIndexWeightBasisPoints: 0,
      bilateralTradeExposureWeightBasisPoints: 0,
    },
  };
}

function componentCap(
  value: number,
  label: string,
  maximum: number,
): number {
  return requireIntegerInRange(value, 1, maximum, `${label}.capBasisPoints`);
}

function componentWeight(value: number, label: string): number {
  return requireIntegerInRange(value, 0, 10_000, label);
}

function requireWeightTotal(values: readonly number[], label: string): void {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total !== 10_000) {
    throw new Error(`${label} must total 10000 basis points`);
  }
}

function positivePolicyDecimal(value: string, label: string): bigint {
  const parsed = parseDecimal(value, label);
  if (parsed <= 0n) throw new Error(`${label} must be positive`);
  return parsed;
}

function requireIntegerInRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value) || value < minimum || value > maximum
  ) {
    throw new Error(
      `${label} must be an integer from ${minimum} to ${maximum}`,
    );
  }
  return value;
}
