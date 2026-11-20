import type { FxFixingPolicyInput } from "../contracts/fxFixingContracts.ts";

export function fxPolicyV1Input(): FxFixingPolicyInput {
  return {
    fixingLocalTime: "08:00:00",
    normalMovementCapBasisPoints: 200,
    crisisMovementCapBasisPoints: 1_500,
    parameters: {
      numeraireCurrencyCode: "ECO",
      gdp: {
        capBasisPoints: 50,
        levelWeightBasisPoints: 2_500,
        growthWeightBasisPoints: 7_500,
        levelNormalizer: "25.000000000000000000",
        growthNormalizer: "0.100000000000000000",
      },
      inflation: {
        capBasisPoints: 45,
        normalizer: "0.100000000000000000",
      },
      realInterest: {
        capBasisPoints: 30,
        normalizer: "0.100000000000000000",
      },
      trade: {
        capBasisPoints: 40,
        tradeBalanceWeightBasisPoints: 5_000,
        exportStrengthWeightBasisPoints: 2_500,
        inverseImportDependencyWeightBasisPoints: 2_500,
        tradeBalanceNormalizer: "50.000000000000000000",
        exportStrengthNormalizer: "0.500000000000000000",
        importDependencyNormalizer: "0.500000000000000000",
      },
      confidenceStability: {
        capBasisPoints: 35,
        signalWeightBasisPoints: 2_000,
        confidenceNormalizer: "50.000000000000000000",
        indexNormalizer: "0.500000000000000000",
      },
      exchangeRateIndexWeightBasisPoints: 0,
      bilateralTradeExposureWeightBasisPoints: 0,
    },
  };
}
