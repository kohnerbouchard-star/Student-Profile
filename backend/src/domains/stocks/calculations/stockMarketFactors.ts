// Pure price, volatility and volume factors. Arithmetic and seeded calls remain ordered.
import type {
  StockMarketAssetInput, StockMarketCompanyFundamentalsInput, StockMarketCountryInput,
  StockMarketEngineInput, StockMarketEngineSettings, StockMarketMacroInput, StockMarketSectorInput,
} from "../contracts/stockMarketEngineContracts.ts";
import { getCountryExposureProfile, type EconovariaCountryExposureProfile } from "./countryExposureProfiles.ts";
import { clampNumber, roundNumber, seededNormalLike } from "./seededRandom.ts";
import type { ResolvedRegime } from "./stockMarketRegime.ts";
import {
  assertFiniteNumber, indexDeviation, normalizeSectorKey, normalizeVolatility,
  percentMagnitudeToPct, percentRateToPct, toUnitScale,
} from "./stockMarketEngineInput.ts";

export function calculateMarketFactor(macro: StockMarketMacroInput): number {
  const factorPct =
    percentRateToPct(macro.gdpGrowthRate) * 0.08 -
    percentRateToPct(macro.inflationRate) * 0.05 -
    percentRateToPct(macro.unemploymentRate) * 0.035 -
    percentRateToPct(macro.interestRate) * 0.05 +
    indexDeviation(macro.consumerConfidenceIndex) * 0.42 +
    indexDeviation(macro.businessConfidenceIndex) * 0.42 +
    indexDeviation(macro.globalDemandIndex) * 0.58 -
    indexDeviation(macro.marketRiskIndex) * 0.72 +
    indexDeviation(macro.politicalStabilityIndex) * 0.36 +
    indexDeviation(macro.infrastructureIndex) * 0.24 +
    indexDeviation(macro.energySecurityIndex) * 0.24;

  return roundNumber(factorPct, 6);
}

export function calculateCountryFactor(
  macro: StockMarketMacroInput,
  country: StockMarketCountryInput | undefined,
  profile: EconovariaCountryExposureProfile | undefined,
  asset: StockMarketAssetInput,
): number {
  const profileFactor = profile
    ? profile.baseBiasPct +
      indexDeviation(macro.globalDemandIndex) *
        profile.globalDemandSensitivity * 0.26 +
      indexDeviation(macro.infrastructureIndex) *
        profile.infrastructureSensitivity * 0.24 +
      indexDeviation(macro.energySecurityIndex) *
        profile.energySensitivity * 0.22 +
      indexDeviation(macro.marketRiskIndex) * profile.riskSensitivity * 0.24 +
      indexDeviation(macro.politicalStabilityIndex) *
        profile.politicalStabilitySensitivity * 0.2
    : 0;
  const countryInputFactor = country
    ? percentRateToPct(country.gdpGrowthRate) * 0.05 -
      percentRateToPct(country.inflationRate) * 0.035 -
      percentRateToPct(country.unemploymentRate) * 0.03 -
      percentRateToPct(country.interestRate) * 0.035 +
      indexDeviation(country.consumerConfidenceIndex) * 0.28 +
      indexDeviation(country.businessConfidenceIndex) * 0.28 +
      indexDeviation(country.tradeBalanceIndex) * 0.22 +
      indexDeviation(country.exportStrengthIndex) * 0.28 -
      indexDeviation(country.marketRiskIndex) * 0.34 +
      indexDeviation(country.politicalStabilityIndex) * 0.24 +
      indexDeviation(country.infrastructureIndex) * 0.24 +
      indexDeviation(country.energySecurityIndex) * 0.18 -
      indexDeviation(country.supplyConstraintIndex) * 0.22 -
      indexDeviation(country.importDependencyIndex) * 0.14
    : 0;
  const crossCountryExposureFactor = calculateExposureOverlay(
    asset.countryExposure,
    (countryCode) => {
      const exposureProfile = getCountryExposureProfile(countryCode);
      return exposureProfile?.baseBiasPct ?? 0;
    },
  );

  return roundNumber(
    profileFactor + countryInputFactor + crossCountryExposureFactor,
    6,
  );
}

export function calculateSectorFactor(
  sectorKey: string,
  sector: StockMarketSectorInput | undefined,
  regime: ResolvedRegime,
  profile: EconovariaCountryExposureProfile | undefined,
  asset: StockMarketAssetInput,
): number {
  const loreSectorBias = profile?.sectorWeights[sectorKey] ?? 0;
  const sectorInputFactor = sector
    ? (sector.driftBias ?? 0) +
      indexDeviation(sector.demandIndex) * 0.34 -
      indexDeviation(sector.supplyConstraintIndex) * 0.24
    : 0;
  const rotationFactor = regime.sectorRotation[sectorKey] ?? 0;
  const crossSectorExposureFactor = calculateExposureOverlay(
    asset.sectorExposure,
    (exposureSectorKey) => profile?.sectorWeights[exposureSectorKey] ?? 0,
  );

  return roundNumber(
    loreSectorBias * 0.18 +
      sectorInputFactor +
      rotationFactor +
      crossSectorExposureFactor * 0.08,
    6,
  );
}

export function calculateFundamentalsFactor(
  fundamentals: StockMarketCompanyFundamentalsInput | undefined,
  macro: StockMarketMacroInput,
): number {
  if (!fundamentals) {
    return 0;
  }

  const debtPressure = clampNumber(toUnitScale(fundamentals.debtLevel), 0, 1) *
    (0.18 + Math.max(0, percentRateToPct(macro.interestRate)) * 0.01);
  const commodityPressure = clampNumber(
    toUnitScale(fundamentals.commodityExposure),
    0,
    1,
  ) * Math.max(0, -indexDeviation(macro.energySecurityIndex)) * 0.22;
  const politicalPressure = clampNumber(
    toUnitScale(fundamentals.politicalExposure),
    0,
    1,
  ) * Math.max(0, indexDeviation(macro.marketRiskIndex)) * 0.24;
  const factorPct =
    percentRateToPct(fundamentals.revenueGrowth) * 0.045 +
    percentRateToPct(fundamentals.profitMargin) * 0.035 +
    (toUnitScale(fundamentals.cashReserves) - 0.5) * 0.22 +
    (toUnitScale(fundamentals.innovationScore) - 0.5) * 0.3 -
    debtPressure -
    (toUnitScale(fundamentals.supplyChainRisk) - 0.5) * 0.22 -
    politicalPressure -
    commodityPressure;

  return roundNumber(factorPct, 6);
}

export function calculateVolatilityNoisePct(
  input: StockMarketEngineInput,
  asset: StockMarketAssetInput,
  regime: ResolvedRegime,
  sector: StockMarketSectorInput | undefined,
  settings: StockMarketEngineSettings,
): number {
  const normal = seededNormalLike([
    input.gameSessionId,
    input.seed,
    String(input.tickIndex),
    asset.ticker,
    "stock-market-engine-v1",
  ]);
  const sectorVolatilityMultiplier = sector?.volatilityMultiplier ?? 1;
  const liquidityDamping = calculateLiquidityDamping(asset, settings);
  const noisePct = normal *
    normalizeVolatility(asset.currentVolatility, settings.defaultLongRunVolatility) *
    100 *
    0.38 *
    regime.volatilityMultiplier *
    sectorVolatilityMultiplier *
    liquidityDamping;

  return roundNumber(
    clampNumber(
      noisePct,
      -settings.maxTickMovePct * 0.65,
      settings.maxTickMovePct * 0.65,
    ),
    6,
  );
}

export function calculateMomentumFactor(
  asset: StockMarketAssetInput,
  settings: StockMarketEngineSettings,
): number {
  const returns = asset.recentReturns ?? [];
  if (returns.length === 0) {
    return 0;
  }

  const usableReturns = returns.slice(-5).map((value) => {
    assertFiniteNumber("recentReturns[]", value);
    return percentMagnitudeToPct(value);
  });
  const average = usableReturns.reduce((sum, value) => sum + value, 0) /
    usableReturns.length;

  return roundNumber(average * settings.momentumStrength, 6);
}

export function calculateMeanReversionFactor(
  asset: StockMarketAssetInput,
  settings: StockMarketEngineSettings,
): number {
  if (!asset.fairValueAnchor || asset.fairValueAnchor <= 0) {
    return 0;
  }

  return roundNumber(
    Math.log(asset.fairValueAnchor / asset.currentPrice) *
      100 *
      settings.meanReversionStrength,
    6,
  );
}

export function calculateNextVolatility(args: {
  readonly currentVolatility: number;
  readonly longRunVolatility: number;
  readonly shockVolatilityImpact: number;
  readonly regime: ResolvedRegime;
  readonly sector?: StockMarketSectorInput;
  readonly settings: StockMarketEngineSettings;
}): number {
  const reverted = args.currentVolatility +
    (args.longRunVolatility - args.currentVolatility) *
      args.settings.volatilityMeanReversionRate;
  const sectorVolatilityMultiplier = args.sector?.volatilityMultiplier ?? 1;

  return roundNumber(
    clampNumber(
      (reverted + args.shockVolatilityImpact) *
        args.regime.volatilityMultiplier *
        sectorVolatilityMultiplier,
      args.settings.minVolatility,
      args.settings.maxVolatility,
    ),
    6,
  );
}

export function calculateVolume(args: {
  readonly changePct: number;
  readonly currentVolatility: number;
  readonly liquidity: number;
  readonly shockVolumeImpact: number;
  readonly regime: ResolvedRegime;
  readonly sector?: StockMarketSectorInput;
  readonly settings: StockMarketEngineSettings;
}): number {
  const movementMultiplier = 1 + Math.min(3, Math.abs(args.changePct) / 5);
  const volatilityMultiplier = 1 + args.currentVolatility * 12;
  const liquidityMultiplier = 0.75 + clampNumber(args.liquidity, 0, 1.5) * 0.5;
  const shockVolumeMultiplier = clampNumber(
    1 + args.shockVolumeImpact,
    0.15,
    4,
  );
  const sectorVolumeMultiplier = args.sector?.volumeMultiplier ?? 1;

  return Math.max(
    1,
    Math.round(
      args.settings.baseVolume *
        movementMultiplier *
        volatilityMultiplier *
        liquidityMultiplier *
        shockVolumeMultiplier *
        args.regime.volumeMultiplier *
        sectorVolumeMultiplier,
    ),
  );
}

function calculateExposureOverlay(
  record: Readonly<Record<string, number>> | undefined,
  lookup: (normalizedKey: string) => number,
): number {
  if (!record) {
    return 0;
  }

  return Object.entries(record).reduce((sum, [key, value]) => {
    const normalizedKey = normalizeSectorKey(key);
    return sum + clampNumber(value, -1, 1) * lookup(normalizedKey);
  }, 0);
}

export function calculateLiquidityDamping(
  asset: StockMarketAssetInput,
  settings: StockMarketEngineSettings,
): number {
  const liquidityScore = clampNumber(asset.liquidity, 0, 1);
  return clampNumber(
    1 - liquidityScore * settings.liquidityDampingStrength,
    0.45,
    1.15,
  );
}
