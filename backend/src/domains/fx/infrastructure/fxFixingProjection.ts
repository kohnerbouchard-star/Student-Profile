import type { FxFixingEngineInput } from "../contracts/fxFixingContracts.ts";
import {
  invalidRpcResult,
  isRecord,
  requiredCountryCode,
  requiredDecimalText,
  requiredInteger,
  requiredLocalDate,
  requiredNationalCurrencyCode,
  requiredNonNegativeInteger,
  requiredSafeId,
  requiredUuid,
  requiredZero,
} from "./fxFixingValidation.ts";

export function mapEngineInput(value: unknown): FxFixingEngineInput {
  if (!isRecord(value)) {
    throw invalidRpcResult("FX fixing engine input must be a JSON object.");
  }

  const currencies = value.currencies;
  const storyShocks = value.storyShocks ?? [];
  if (!Array.isArray(currencies) || !Array.isArray(storyShocks)) {
    throw invalidRpcResult("FX fixing currencies or Story shocks are invalid.");
  }
  return Object.freeze({
    gameSessionId: requiredUuid(value.gameSessionId, "gameSessionId"),
    fixingLocalDate: requiredLocalDate(
      value.fixingLocalDate,
      "fixingLocalDate",
    ),
    policyVersion: requiredSafeId(value.policyVersion, "policyVersion"),
    policy: mapEnginePolicy(value.policy),
    currencies: Object.freeze(
      currencies.map((currency, index) => mapEngineCurrency(currency, index)),
    ),
    storyShocks: Object.freeze(
      storyShocks.map((shock, index) => mapStoryShock(shock, index)),
    ),
  });
}

function mapEnginePolicy(
  value: unknown,
): FxFixingEngineInput["policy"] {
  if (!isRecord(value) || !isRecord(value.parameters)) {
    throw invalidRpcResult("FX fixing policy evidence is invalid.");
  }
  const parameters = value.parameters;
  if (
    !isRecord(parameters.gdp) || !isRecord(parameters.inflation) ||
    !isRecord(parameters.realInterest) || !isRecord(parameters.trade) ||
    !isRecord(parameters.confidenceStability)
  ) {
    throw invalidRpcResult("FX fixing policy parameters are invalid.");
  }
  if (value.fixingLocalTime !== "08:00:00") {
    throw invalidRpcResult("FX fixing policy boundary is invalid.");
  }
  if (parameters.numeraireCurrencyCode !== "ECO") {
    throw invalidRpcResult("FX fixing policy numeraire is invalid.");
  }

  return Object.freeze({
    fixingLocalTime: "08:00:00" as const,
    normalMovementCapBasisPoints: requiredInteger(
      value.normalMovementCapBasisPoints,
      "policy.normalMovementCapBasisPoints",
    ),
    crisisMovementCapBasisPoints: requiredInteger(
      value.crisisMovementCapBasisPoints,
      "policy.crisisMovementCapBasisPoints",
    ),
    parameters: Object.freeze({
      numeraireCurrencyCode: "ECO" as const,
      gdp: Object.freeze({
        capBasisPoints: requiredInteger(
          parameters.gdp.capBasisPoints,
          "policy.parameters.gdp.capBasisPoints",
        ),
        levelWeightBasisPoints: requiredInteger(
          parameters.gdp.levelWeightBasisPoints,
          "policy.parameters.gdp.levelWeightBasisPoints",
        ),
        growthWeightBasisPoints: requiredInteger(
          parameters.gdp.growthWeightBasisPoints,
          "policy.parameters.gdp.growthWeightBasisPoints",
        ),
        levelNormalizer: requiredDecimalText(
          parameters.gdp.levelNormalizer,
          "policy.parameters.gdp.levelNormalizer",
        ),
        growthNormalizer: requiredDecimalText(
          parameters.gdp.growthNormalizer,
          "policy.parameters.gdp.growthNormalizer",
        ),
      }),
      inflation: Object.freeze({
        capBasisPoints: requiredInteger(
          parameters.inflation.capBasisPoints,
          "policy.parameters.inflation.capBasisPoints",
        ),
        normalizer: requiredDecimalText(
          parameters.inflation.normalizer,
          "policy.parameters.inflation.normalizer",
        ),
      }),
      realInterest: Object.freeze({
        capBasisPoints: requiredInteger(
          parameters.realInterest.capBasisPoints,
          "policy.parameters.realInterest.capBasisPoints",
        ),
        normalizer: requiredDecimalText(
          parameters.realInterest.normalizer,
          "policy.parameters.realInterest.normalizer",
        ),
      }),
      trade: Object.freeze({
        capBasisPoints: requiredInteger(
          parameters.trade.capBasisPoints,
          "policy.parameters.trade.capBasisPoints",
        ),
        tradeBalanceWeightBasisPoints: requiredInteger(
          parameters.trade.tradeBalanceWeightBasisPoints,
          "policy.parameters.trade.tradeBalanceWeightBasisPoints",
        ),
        exportStrengthWeightBasisPoints: requiredInteger(
          parameters.trade.exportStrengthWeightBasisPoints,
          "policy.parameters.trade.exportStrengthWeightBasisPoints",
        ),
        inverseImportDependencyWeightBasisPoints: requiredInteger(
          parameters.trade.inverseImportDependencyWeightBasisPoints,
          "policy.parameters.trade.inverseImportDependencyWeightBasisPoints",
        ),
        tradeBalanceNormalizer: requiredDecimalText(
          parameters.trade.tradeBalanceNormalizer,
          "policy.parameters.trade.tradeBalanceNormalizer",
        ),
        exportStrengthNormalizer: requiredDecimalText(
          parameters.trade.exportStrengthNormalizer,
          "policy.parameters.trade.exportStrengthNormalizer",
        ),
        importDependencyNormalizer: requiredDecimalText(
          parameters.trade.importDependencyNormalizer,
          "policy.parameters.trade.importDependencyNormalizer",
        ),
      }),
      confidenceStability: Object.freeze({
        capBasisPoints: requiredInteger(
          parameters.confidenceStability.capBasisPoints,
          "policy.parameters.confidenceStability.capBasisPoints",
        ),
        signalWeightBasisPoints: requiredInteger(
          parameters.confidenceStability.signalWeightBasisPoints,
          "policy.parameters.confidenceStability.signalWeightBasisPoints",
        ),
        confidenceNormalizer: requiredDecimalText(
          parameters.confidenceStability.confidenceNormalizer,
          "policy.parameters.confidenceStability.confidenceNormalizer",
        ),
        indexNormalizer: requiredDecimalText(
          parameters.confidenceStability.indexNormalizer,
          "policy.parameters.confidenceStability.indexNormalizer",
        ),
      }),
      exchangeRateIndexWeightBasisPoints: requiredZero(
        parameters.exchangeRateIndexWeightBasisPoints,
        "policy.parameters.exchangeRateIndexWeightBasisPoints",
      ),
      bilateralTradeExposureWeightBasisPoints: requiredZero(
        parameters.bilateralTradeExposureWeightBasisPoints,
        "policy.parameters.bilateralTradeExposureWeightBasisPoints",
      ),
    }),
  });
}

function mapEngineCurrency(
  value: unknown,
  index: number,
): FxFixingEngineInput["currencies"][number] {
  if (!isRecord(value)) {
    throw invalidRpcResult(`FX fixing currency ${index} is invalid.`);
  }
  return Object.freeze({
    currencyCode: requiredNationalCurrencyCode(
      value.currencyCode,
      `currencies[${index}].currencyCode`,
    ),
    countryCode: requiredCountryCode(
      value.countryCode,
      `currencies[${index}].countryCode`,
    ),
    previousUnitsPerEco: requiredDecimalText(
      value.previousUnitsPerEco,
      `currencies[${index}].previousUnitsPerEco`,
    ),
    snapshotId: requiredUuid(
      value.snapshotId,
      `currencies[${index}].snapshotId`,
    ),
    snapshotSequence: requiredNonNegativeInteger(
      value.snapshotSequence,
      `currencies[${index}].snapshotSequence`,
    ),
    realGdpIndex: requiredDecimalText(
      value.realGdpIndex,
      `currencies[${index}].realGdpIndex`,
    ),
    gdpGrowthRate: requiredDecimalText(
      value.gdpGrowthRate,
      `currencies[${index}].gdpGrowthRate`,
    ),
    inflationRate: requiredDecimalText(
      value.inflationRate,
      `currencies[${index}].inflationRate`,
    ),
    interestRate: requiredDecimalText(
      value.interestRate,
      `currencies[${index}].interestRate`,
    ),
    consumerConfidenceIndex: requiredDecimalText(
      value.consumerConfidenceIndex,
      `currencies[${index}].consumerConfidenceIndex`,
    ),
    businessConfidenceIndex: requiredDecimalText(
      value.businessConfidenceIndex,
      `currencies[${index}].businessConfidenceIndex`,
    ),
    importDependencyIndex: requiredDecimalText(
      value.importDependencyIndex,
      `currencies[${index}].importDependencyIndex`,
    ),
    currencyStabilityIndex: requiredDecimalText(
      value.currencyStabilityIndex,
      `currencies[${index}].currencyStabilityIndex`,
    ),
    tradeBalanceIndex: requiredDecimalText(
      value.tradeBalanceIndex,
      `currencies[${index}].tradeBalanceIndex`,
    ),
    exportStrengthIndex: requiredDecimalText(
      value.exportStrengthIndex,
      `currencies[${index}].exportStrengthIndex`,
    ),
    marketRiskIndex: requiredDecimalText(
      value.marketRiskIndex,
      `currencies[${index}].marketRiskIndex`,
    ),
    politicalStabilityIndex: requiredDecimalText(
      value.politicalStabilityIndex,
      `currencies[${index}].politicalStabilityIndex`,
    ),
  });
}

function mapStoryShock(
  value: unknown,
  index: number,
): NonNullable<FxFixingEngineInput["storyShocks"]>[number] {
  if (!isRecord(value)) {
    throw invalidRpcResult(`FX Story shock ${index} is invalid.`);
  }
  return Object.freeze({
    shockId: requiredSafeId(value.shockId, `storyShocks[${index}].shockId`),
    currencyCode: requiredNationalCurrencyCode(
      value.currencyCode,
      `storyShocks[${index}].currencyCode`,
    ),
    basisPoints: requiredInteger(
      value.basisPoints,
      `storyShocks[${index}].basisPoints`,
    ),
  });
}
