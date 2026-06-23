import type {
  StockMarketAssetInput,
  StockMarketChartPoint,
  StockMarketCompanyFundamentalsInput,
  StockMarketCountryInput,
  StockMarketEngineInput,
  StockMarketEngineResult,
  StockMarketEngineSettings,
  StockMarketMacroInput,
  StockMarketRegimeInput,
  StockMarketRegimeKind,
  StockMarketRowOutput,
  StockMarketSectorInput,
  StockMarketShockInput,
  StockPriceMovementComponentBreakdown,
  StockPriceMovementExplanation,
  StockPriceTickOutput,
} from "../contracts/stockMarketEngineContracts.ts";
import {
  clampNumber,
  roundNumber,
  seededNormalLike,
} from "./seededRandom.ts";

export const OFFICIAL_ECONOVARIA_COUNTRY_CODES = [
  "NORTHREACH",
  "YRETHIA",
  "THALORIS",
  "SOLVEND",
  "ELDORAN",
  "VALERION",
  "LUMENOR",
  "SYNDALIS",
  "XALVORIA",
  "DRAVENLOK",
] as const;

export type OfficialEconovariaCountryCode =
  typeof OFFICIAL_ECONOVARIA_COUNTRY_CODES[number];

export const SUPPORTED_STOCK_MARKET_SECTOR_KEYS = [
  "ENERGY",
  "RARE_MINERALS",
  "SHIPPING_LOGISTICS",
  "TECHNOLOGY",
  "AI_AEROSPACE",
  "AGRICULTURE_COMMODITIES",
  "FOOD_SECURITY",
  "FINANCE_INSURANCE",
  "DEFENSE_SECURITY",
  "CONSUMER_GOODS",
  "CLEAN_ENERGY",
  "INFRASTRUCTURE",
  "REPAIR_SALVAGE_RE_EXPORT_TRADE",
  "EDUCATION_MEDIA_DIPLOMACY",
  "CYBERSECURITY_FINTECH_DATA",
  "HEAVY_INDUSTRY_MANUFACTURING",
  "LUXURY_PREMIUM_SERVICES",
] as const;

export interface EconovariaCountryExposureProfile {
  readonly countryCode: OfficialEconovariaCountryCode;
  readonly countryName: string;
  readonly capitalMarket: string;
  readonly bloc: string;
  readonly focusAreas: readonly string[];
  readonly sectorWeights: Readonly<Record<string, number>>;
  readonly globalDemandSensitivity: number;
  readonly infrastructureSensitivity: number;
  readonly energySensitivity: number;
  readonly riskSensitivity: number;
  readonly politicalStabilitySensitivity: number;
  readonly baseBiasPct: number;
}

export const ECONOVARIA_COUNTRY_EXPOSURE_PROFILES: Readonly<
  Record<OfficialEconovariaCountryCode, EconovariaCountryExposureProfile>
> = {
  NORTHREACH: {
    countryCode: "NORTHREACH",
    countryName: "Northreach",
    capitalMarket: "Frostgate",
    bloc: "Northern Resource Bloc",
    focusAreas: ["rare minerals", "energy", "defense", "arctic logistics"],
    sectorWeights: {
      RARE_MINERALS: 0.34,
      MATERIALS: 0.32,
      ENERGY: 0.28,
      DEFENSE_SECURITY: 0.18,
      DEFENSE: 0.16,
      ARCTIC_LOGISTICS: 0.14,
      SHIPPING_LOGISTICS: 0.14,
      LOGISTICS: 0.14,
      INDUSTRIALS: 0.1,
    },
    globalDemandSensitivity: 0.58,
    infrastructureSensitivity: 0.24,
    energySensitivity: 0.72,
    riskSensitivity: -0.34,
    politicalStabilitySensitivity: 0.2,
    baseBiasPct: 0.03,
  },
  YRETHIA: {
    countryCode: "YRETHIA",
    countryName: "Yrethia",
    capitalMarket: "Sableport",
    bloc: "Western Maritime Corridor",
    focusAreas: ["shipping", "insurance", "freight finance", "regulated trade"],
    sectorWeights: {
      SHIPPING_LOGISTICS: 0.32,
      SHIPPING: 0.3,
      LOGISTICS: 0.24,
      FINANCE_INSURANCE: 0.24,
      FINANCE: 0.22,
      INSURANCE: 0.2,
      FREIGHT_FINANCE: 0.18,
      REGULATED_TRADE: 0.16,
      TRADE: 0.16,
      SERVICES: 0.08,
    },
    globalDemandSensitivity: 0.66,
    infrastructureSensitivity: 0.38,
    energySensitivity: 0.18,
    riskSensitivity: -0.22,
    politicalStabilitySensitivity: 0.26,
    baseBiasPct: 0.02,
  },
  THALORIS: {
    countryCode: "THALORIS",
    countryName: "Thaloris",
    capitalMarket: "Dusk Harbor",
    bloc: "Western Maritime Corridor",
    focusAreas: ["re-export trade", "salvage", "high-risk logistics"],
    sectorWeights: {
      REPAIR_SALVAGE_RE_EXPORT_TRADE: 0.34,
      RE_EXPORT_TRADE: 0.32,
      TRADE: 0.3,
      LOGISTICS: 0.28,
      SALVAGE: 0.22,
      REPAIR: 0.16,
      SHIPPING_LOGISTICS: 0.22,
      SHIPPING: 0.2,
      MATERIALS: 0.12,
      SERVICES: 0.1,
    },
    globalDemandSensitivity: 0.62,
    infrastructureSensitivity: 0.2,
    energySensitivity: 0.2,
    riskSensitivity: -0.48,
    politicalStabilitySensitivity: 0.12,
    baseBiasPct: -0.01,
  },
  SOLVEND: {
    countryCode: "SOLVEND",
    countryName: "Solvend",
    capitalMarket: "Aurora Spire",
    bloc: "Northern Resource Bloc",
    focusAreas: ["AI", "aerospace", "research", "precision engineering"],
    sectorWeights: {
      AI_AEROSPACE: 0.36,
      AI: 0.36,
      TECHNOLOGY: 0.34,
      AEROSPACE: 0.24,
      RESEARCH: 0.18,
      PRECISION_ENGINEERING: 0.16,
      INDUSTRIALS: 0.14,
      EDUCATION: 0.1,
    },
    globalDemandSensitivity: 0.34,
    infrastructureSensitivity: 0.32,
    energySensitivity: 0.16,
    riskSensitivity: -0.18,
    politicalStabilitySensitivity: 0.22,
    baseBiasPct: 0.04,
  },
  ELDORAN: {
    countryCode: "ELDORAN",
    countryName: "Eldoran",
    capitalMarket: "Crescent Bay",
    bloc: "Central Stability Zone",
    focusAreas: ["agriculture", "commodities", "food security", "internal logistics"],
    sectorWeights: {
      AGRICULTURE_COMMODITIES: 0.36,
      AGRICULTURE: 0.34,
      COMMODITIES: 0.22,
      FOOD_SECURITY: 0.2,
      FOOD: 0.18,
      INTERNAL_LOGISTICS: 0.14,
      SHIPPING_LOGISTICS: 0.14,
      LOGISTICS: 0.14,
      CONSUMER_GOODS: 0.12,
      CONSUMER: 0.12,
    },
    globalDemandSensitivity: 0.32,
    infrastructureSensitivity: 0.34,
    energySensitivity: 0.22,
    riskSensitivity: -0.16,
    politicalStabilitySensitivity: 0.28,
    baseBiasPct: 0.02,
  },
  VALERION: {
    countryCode: "VALERION",
    countryName: "Valerion",
    capitalMarket: "Glassfall",
    bloc: "Central Stability Zone",
    focusAreas: ["clean energy", "water infrastructure", "premium services", "finance"],
    sectorWeights: {
      CLEAN_ENERGY: 0.24,
      ENERGY: 0.22,
      WATER_INFRASTRUCTURE: 0.22,
      UTILITIES: 0.2,
      INFRASTRUCTURE: 0.2,
      LUXURY_PREMIUM_SERVICES: 0.18,
      PREMIUM_SERVICES: 0.18,
      SERVICES: 0.18,
      FINANCE_INSURANCE: 0.2,
      FINANCE: 0.2,
    },
    globalDemandSensitivity: 0.28,
    infrastructureSensitivity: 0.5,
    energySensitivity: 0.46,
    riskSensitivity: -0.14,
    politicalStabilitySensitivity: 0.34,
    baseBiasPct: 0.03,
  },
  LUMENOR: {
    countryCode: "LUMENOR",
    countryName: "Lumenor",
    capitalMarket: "Starfall",
    bloc: "Central Stability Zone",
    focusAreas: ["education", "media", "diplomacy", "public services"],
    sectorWeights: {
      EDUCATION_MEDIA_DIPLOMACY: 0.32,
      EDUCATION: 0.28,
      MEDIA: 0.22,
      DIPLOMACY: 0.22,
      PUBLIC_SERVICES: 0.2,
      SERVICES: 0.2,
      CIVIC_LEGITIMACY: 0.16,
      HEALTHCARE: 0.14,
      TECHNOLOGY: 0.16,
    },
    globalDemandSensitivity: 0.2,
    infrastructureSensitivity: 0.24,
    energySensitivity: 0.12,
    riskSensitivity: -0.12,
    politicalStabilitySensitivity: 0.44,
    baseBiasPct: 0.01,
  },
  SYNDALIS: {
    countryCode: "SYNDALIS",
    countryName: "Syndalis",
    capitalMarket: "Blacklight",
    bloc: "Eastern Pressure Zone",
    focusAreas: ["cybersecurity", "fintech", "data centers", "covert market influence"],
    sectorWeights: {
      CYBERSECURITY_FINTECH_DATA: 0.36,
      CYBERSECURITY: 0.32,
      FINTECH: 0.24,
      TECHNOLOGY: 0.22,
      DATA_CENTERS: 0.18,
      DATA: 0.18,
      FINANCE_INSURANCE: 0.12,
      FINANCE: 0.12,
      INFRASTRUCTURE: 0.1,
    },
    globalDemandSensitivity: 0.34,
    infrastructureSensitivity: 0.34,
    energySensitivity: 0.32,
    riskSensitivity: -0.4,
    politicalStabilitySensitivity: 0.12,
    baseBiasPct: 0,
  },
  XALVORIA: {
    countryCode: "XALVORIA",
    countryName: "Xalvoria",
    capitalMarket: "Emberhall",
    bloc: "Eastern Pressure Zone",
    focusAreas: ["banking", "infrastructure finance", "luxury industry", "capital influence"],
    sectorWeights: {
      BANKING: 0.32,
      FINANCE_INSURANCE: 0.3,
      FINANCE: 0.28,
      INFRASTRUCTURE_FINANCE: 0.2,
      INFRASTRUCTURE: 0.18,
      LUXURY_PREMIUM_SERVICES: 0.14,
      LUXURY: 0.12,
      SERVICES: 0.1,
      CAPITAL_INFLUENCE: 0.1,
    },
    globalDemandSensitivity: 0.3,
    infrastructureSensitivity: 0.4,
    energySensitivity: 0.12,
    riskSensitivity: -0.38,
    politicalStabilitySensitivity: 0.16,
    baseBiasPct: 0.01,
  },
  DRAVENLOK: {
    countryCode: "DRAVENLOK",
    countryName: "Dravenlok",
    capitalMarket: "Ironhold",
    bloc: "Eastern Pressure Zone",
    focusAreas: ["steel", "machinery", "defense manufacturing", "heavy logistics"],
    sectorWeights: {
      HEAVY_INDUSTRY_MANUFACTURING: 0.32,
      STEEL: 0.26,
      INDUSTRIALS: 0.24,
      DEFENSE_SECURITY: 0.22,
      DEFENSE_MANUFACTURING: 0.22,
      DEFENSE: 0.2,
      MACHINERY: 0.18,
      SHIPPING_LOGISTICS: 0.12,
      HEAVY_LOGISTICS: 0.12,
      LOGISTICS: 0.12,
    },
    globalDemandSensitivity: 0.48,
    infrastructureSensitivity: 0.34,
    energySensitivity: 0.34,
    riskSensitivity: -0.36,
    politicalStabilitySensitivity: 0.1,
    baseBiasPct: -0.01,
  },
};

const OFFICIAL_COUNTRY_CODE_SET = new Set<string>(
  OFFICIAL_ECONOVARIA_COUNTRY_CODES,
);

const DEFAULT_STOCK_MARKET_ENGINE_SETTINGS_WITHOUT_SESSION: Omit<
  StockMarketEngineSettings,
  "gameSessionId"
> = {
  minPrice: 0.01,
  maxTickMovePct: 12,
  volatilityMeanReversionRate: 0.18,
  minVolatility: 0.002,
  maxVolatility: 0.18,
  defaultLongRunVolatility: 0.025,
  liquidityDampingStrength: 0.35,
  momentumStrength: 0.18,
  meanReversionStrength: 0.08,
  baseVolume: 10000,
  maxHistoryPoints: 30,
};

interface ResolvedRegime {
  readonly regime: StockMarketRegimeKind;
  readonly driftBias: number;
  readonly volatilityMultiplier: number;
  readonly newsSensitivity: number;
  readonly volumeMultiplier: number;
  readonly betaMultiplier: number;
  readonly sectorRotation: Readonly<Record<string, number>>;
  readonly studentLabel: string;
}

interface ShockEffect {
  readonly shockFactorPct: number;
  readonly volatilityImpact: number;
  readonly volumeImpact: number;
  readonly appliedShockIds: readonly string[];
  readonly headlines: readonly string[];
}

export function calculateNextStockMarketTick(
  input: StockMarketEngineInput,
): StockMarketEngineResult {
  validateEngineInput(input);

  const settings = resolveStockMarketEngineSettings(
    input.gameSessionId,
    input.settings,
  );
  const countryByCode = indexCountries(input.countries ?? []);
  const sectorByKey = indexSectors(input.sectors ?? []);
  const regime = resolveRegime(input.regime);
  const generatedAt = deterministicTickTimestamp(input.tickIndex);
  const rows: StockMarketRowOutput[] = [];
  const ticks: StockPriceTickOutput[] = [];
  const explanations: StockPriceMovementExplanation[] = [];

  for (const asset of input.assets) {
    const calculated = calculateAssetTick({
      input,
      asset,
      settings,
      countryByCode,
      sectorByKey,
      regime,
      generatedAt,
    });

    rows.push(calculated.row);
    ticks.push(calculated.tick);
    explanations.push(calculated.explanation);
  }

  return {
    gameSessionId: input.gameSessionId,
    seed: input.seed,
    tickIndex: input.tickIndex,
    rows,
    ticks,
    explanations,
    generatedAt,
  };
}

export function resolveStockMarketEngineSettings(
  gameSessionId: string,
  settings?: StockMarketEngineSettings,
): StockMarketEngineSettings {
  if (settings) {
    assertGameSessionId(
      "settings",
      settings.gameSessionId,
      gameSessionId,
    );
  }

  const merged = {
    gameSessionId,
    ...DEFAULT_STOCK_MARKET_ENGINE_SETTINGS_WITHOUT_SESSION,
    ...(settings ?? {}),
  };

  validateSettings(merged);

  return {
    ...merged,
    gameSessionId,
  };
}

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

export function getCountryExposureProfile(
  countryCode: string,
): EconovariaCountryExposureProfile | undefined {
  return ECONOVARIA_COUNTRY_EXPOSURE_PROFILES[
    normalizeCountryCode(countryCode) as OfficialEconovariaCountryCode
  ];
}

function calculateAssetTick(args: {
  readonly input: StockMarketEngineInput;
  readonly asset: StockMarketAssetInput;
  readonly settings: StockMarketEngineSettings;
  readonly countryByCode: ReadonlyMap<string, StockMarketCountryInput>;
  readonly sectorByKey: ReadonlyMap<string, StockMarketSectorInput>;
  readonly regime: ResolvedRegime;
  readonly generatedAt: string;
}): {
  readonly row: StockMarketRowOutput;
  readonly tick: StockPriceTickOutput;
  readonly explanation: StockPriceMovementExplanation;
} {
  const {
    input,
    asset,
    settings,
    countryByCode,
    sectorByKey,
    regime,
    generatedAt,
  } = args;
  const countryCode = normalizeCountryCode(asset.countryCode);
  const sectorKey = normalizeSectorKey(asset.sector);
  const countryProfile = getCountryExposureProfile(countryCode);
  const country = countryByCode.get(countryCode);
  const sector = sectorByKey.get(sectorKey);
  const marketFactorPct = roundNumber(
    calculateMarketFactor(input.macro) * asset.beta * regime.betaMultiplier,
    6,
  );
  const countryFactorPct = calculateCountryFactor(
    input.macro,
    country,
    countryProfile,
    asset,
  );
  const sectorFactorPct = calculateSectorFactor(
    sectorKey,
    sector,
    regime,
    countryProfile,
    asset,
  );
  const fundamentalsFactorPct = calculateFundamentalsFactor(
    asset.fundamentals,
    input.macro,
  );
  const regimeFactorPct = roundNumber(regime.driftBias, 6);
  const shockEffect = calculateShockEffect({
    input,
    asset,
    sectorKey,
    countryCode,
    regime,
    sector,
  });
  const volatilityNoisePct = calculateVolatilityNoisePct(
    input,
    asset,
    regime,
    sector,
    settings,
  );
  const momentumFactorPct = calculateMomentumFactor(asset, settings);
  const meanReversionFactorPct = calculateMeanReversionFactor(asset, settings);
  const rawReturnPct =
    marketFactorPct +
    countryFactorPct +
    sectorFactorPct +
    fundamentalsFactorPct +
    regimeFactorPct +
    shockEffect.shockFactorPct +
    volatilityNoisePct +
    momentumFactorPct +
    meanReversionFactorPct;
  const dampedReturnPct = rawReturnPct *
    calculateLiquidityDamping(asset, settings);
  const maxPositiveLogReturn = Math.log(1 + settings.maxTickMovePct / 100);
  const maxNegativeLogReturn = Math.log(
    Math.max(0.0001, 1 - settings.maxTickMovePct / 100),
  );
  const boundedLogReturn = clampNumber(
    dampedReturnPct / 100,
    maxNegativeLogReturn,
    maxPositiveLogReturn,
  );
  const previousPrice = asset.currentPrice;
  const nextPrice = roundNumber(
    Math.max(settings.minPrice, previousPrice * Math.exp(boundedLogReturn)),
    2,
  );
  const changePct = roundNumber(
    ((nextPrice - previousPrice) / previousPrice) * 100,
    4,
  );
  const longRunVolatility = normalizeVolatility(
    asset.longRunVolatility,
    settings.defaultLongRunVolatility,
  );
  const currentVolatility = normalizeVolatility(
    asset.currentVolatility,
    longRunVolatility,
  );
  const nextVolatility = calculateNextVolatility({
    currentVolatility,
    longRunVolatility,
    shockVolatilityImpact: shockEffect.volatilityImpact,
    regime,
    sector,
    settings,
  });
  const volume = calculateVolume({
    changePct,
    currentVolatility: nextVolatility,
    liquidity: asset.liquidity,
    shockVolumeImpact: shockEffect.volumeImpact,
    regime,
    sector,
    settings,
  });
  const previousClose = positiveOptional(asset.previousClose) ?? previousPrice;
  const openPrice = positiveOptional(asset.openPrice) ?? previousClose;
  const dayHigh = roundNumber(
    Math.max(
      positiveOptional(asset.dayHigh) ?? openPrice,
      openPrice,
      previousClose,
      previousPrice,
      nextPrice,
    ),
    2,
  );
  const dayLow = roundNumber(
    Math.max(
      settings.minPrice,
      Math.min(
        positiveOptional(asset.dayLow) ?? openPrice,
        openPrice,
        previousClose,
        previousPrice,
        nextPrice,
      ),
    ),
    2,
  );
  const history = appendHistoryPoint({
    existingHistory: asset.history ?? [],
    gameSessionId: input.gameSessionId,
    tickIndex: input.tickIndex,
    price: nextPrice,
    volume,
    maxHistoryPoints: settings.maxHistoryPoints,
  });
  const components: StockPriceMovementComponentBreakdown = {
    marketFactorPct,
    countryFactorPct,
    sectorFactorPct,
    fundamentalsFactorPct,
    regimeFactorPct,
    shockFactorPct: shockEffect.shockFactorPct,
    volatilityNoisePct,
    momentumFactorPct,
    meanReversionFactorPct,
    finalReturnPct: changePct,
  };
  const explanation = buildExplanation({
    input,
    asset,
    countryProfile,
    regime,
    components,
    appliedShockIds: shockEffect.appliedShockIds,
    shockHeadlines: shockEffect.headlines,
    nextPrice,
    changePct,
  });
  const row: StockMarketRowOutput = {
    gameSessionId: input.gameSessionId,
    ticker: asset.ticker,
    companyName: asset.companyName,
    sector: asset.sector,
    currentPrice: nextPrice,
    changePct: formatChangePct(changePct),
    previousClose: roundNumber(previousClose, 2),
    openPrice: roundNumber(openPrice, 2),
    dayHigh,
    dayLow,
    volume,
    marketCap: calculateMarketCap(asset, nextPrice, previousPrice),
    beta: roundNumber(asset.beta, 4),
    history,
    lastUpdated: generatedAt,
    trend: changePct > 0 ? "up" : changePct < 0 ? "down" : "flat",
    assetType: "Stock",
    description: countryProfile
      ? `${countryProfile.countryName} exposure: ${
        countryProfile.focusAreas.join(", ")
      }.`
      : undefined,
    notes: explanation.headline,
  };
  const tick: StockPriceTickOutput = {
    gameSessionId: input.gameSessionId,
    tickIndex: input.tickIndex,
    assetId: asset.assetId,
    ticker: asset.ticker,
    price: nextPrice,
    previousPrice: roundNumber(previousPrice, 2),
    logReturn: roundNumber(Math.log(nextPrice / previousPrice), 8),
    changePct,
    volume,
    currentVolatility: nextVolatility,
    longRunVolatility,
    createdAt: generatedAt,
    explanation,
  };

  return { row, tick, explanation };
}

function calculateCountryFactor(
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

function calculateSectorFactor(
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

function calculateFundamentalsFactor(
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

function calculateShockEffect(args: {
  readonly input: StockMarketEngineInput;
  readonly asset: StockMarketAssetInput;
  readonly sectorKey: string;
  readonly countryCode: string;
  readonly regime: ResolvedRegime;
  readonly sector?: StockMarketSectorInput;
}): ShockEffect {
  const appliedShockIds: string[] = [];
  const headlines: string[] = [];
  let shockFactorPct = 0;
  let volatilityImpact = 0;
  let volumeImpact = 0;

  for (const shock of args.input.shocks ?? []) {
    if (!isShockActive(shock, args.input.tickIndex)) {
      continue;
    }

    const exposureWeight = getShockExposureWeight(shock, args);
    if (exposureWeight <= 0) {
      continue;
    }

    const elapsed = Math.max(0, args.input.tickIndex - shock.createdTick);
    const decay = clampNumber(shock.decay, 0, 1);
    const decayWeight = decay === 1
      ? elapsed === 0 ? 1 : 0
      : Math.pow(1 - decay, elapsed);
    const confidence = clampNumber(shock.confidence, 0, 1);
    const sectorNewsSensitivity = args.sector?.newsSensitivity ?? 1;
    const sensitivity = args.regime.newsSensitivity * sectorNewsSensitivity;
    const weight = exposureWeight * decayWeight * confidence * sensitivity;

    shockFactorPct += percentMagnitudeToPct(shock.magnitude) * weight;
    volatilityImpact += normalizeVolatilityImpact(shock.volatilityImpact) *
      weight;
    volumeImpact += normalizeVolumeImpact(shock.volumeImpact) * weight;
    appliedShockIds.push(shock.shockId);
    headlines.push(shock.headline);
  }

  return {
    shockFactorPct: roundNumber(shockFactorPct, 6),
    volatilityImpact: roundNumber(volatilityImpact, 6),
    volumeImpact: roundNumber(volumeImpact, 6),
    appliedShockIds,
    headlines,
  };
}

function calculateVolatilityNoisePct(
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

function calculateMomentumFactor(
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

function calculateMeanReversionFactor(
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

function calculateNextVolatility(args: {
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

function calculateVolume(args: {
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

function calculateMarketCap(
  asset: StockMarketAssetInput,
  nextPrice: number,
  previousPrice: number,
): number {
  if (asset.marketCap && asset.marketCap > 0) {
    return roundNumber(asset.marketCap * (nextPrice / previousPrice), 2);
  }

  if (asset.sharesOutstanding && asset.sharesOutstanding > 0) {
    return roundNumber(asset.sharesOutstanding * nextPrice, 2);
  }

  return roundNumber(nextPrice * 1_000_000, 2);
}

function appendHistoryPoint(args: {
  readonly existingHistory: readonly StockMarketChartPoint[];
  readonly gameSessionId: string;
  readonly tickIndex: number;
  readonly price: number;
  readonly volume: number;
  readonly maxHistoryPoints: number;
}): readonly StockMarketChartPoint[] {
  const nextPoint: StockMarketChartPoint = {
    gameSessionId: args.gameSessionId,
    tickIndex: args.tickIndex,
    timestamp: deterministicTickTimestamp(args.tickIndex),
    label: `Tick ${args.tickIndex}`,
    price: args.price,
    volume: args.volume,
  };
  const merged = [...args.existingHistory, nextPoint]
    .filter((point) => Number.isInteger(point.tickIndex))
    .sort((left, right) => left.tickIndex - right.tickIndex);

  return merged.slice(Math.max(0, merged.length - args.maxHistoryPoints));
}

function buildExplanation(args: {
  readonly input: StockMarketEngineInput;
  readonly asset: StockMarketAssetInput;
  readonly countryProfile: EconovariaCountryExposureProfile | undefined;
  readonly regime: ResolvedRegime;
  readonly components: StockPriceMovementComponentBreakdown;
  readonly appliedShockIds: readonly string[];
  readonly shockHeadlines: readonly string[];
  readonly nextPrice: number;
  readonly changePct: number;
}): StockPriceMovementExplanation {
  const leadingComponent = getLeadingComponent(args.components);
  const countryText = args.countryProfile
    ? `${args.countryProfile.countryName}'s ${args.countryProfile.capitalMarket} market`
    : "its home market";
  const direction = args.changePct > 0
    ? "rose"
    : args.changePct < 0
    ? "fell"
    : "held steady";
  const headline = args.shockHeadlines[0] ??
    `${args.asset.ticker} ${direction} on ${leadingComponent.label}`;
  const summary =
    `${args.asset.companyName} ${direction} ${formatChangePct(args.changePct)} to ${
      formatCurrency(args.nextPrice)
    } as ${leadingComponent.label} contributed ${formatChangePct(leadingComponent.value)}.`;
  const studentText =
    `${args.asset.ticker} is tied to ${countryText} and the ${args.asset.sector} sector. The ${args.regime.studentLabel} regime, company fundamentals, shocks, and deterministic volatility were combined into one bounded price move.`;

  return {
    gameSessionId: args.input.gameSessionId,
    tickIndex: args.input.tickIndex,
    ticker: args.asset.ticker,
    headline,
    summary,
    studentText,
    components: args.components,
    appliedShockIds: args.appliedShockIds,
    regime: args.regime.regime,
  };
}

function getLeadingComponent(
  components: StockPriceMovementComponentBreakdown,
): { readonly label: string; readonly value: number } {
  const candidates = [
    { label: "market pressure", value: components.marketFactorPct },
    { label: "country exposure", value: components.countryFactorPct },
    { label: "sector exposure", value: components.sectorFactorPct },
    { label: "company fundamentals", value: components.fundamentalsFactorPct },
    { label: "market regime", value: components.regimeFactorPct },
    { label: "news shock impact", value: components.shockFactorPct },
    { label: "deterministic volatility", value: components.volatilityNoisePct },
    { label: "momentum", value: components.momentumFactorPct },
    { label: "fair-value pressure", value: components.meanReversionFactorPct },
  ];

  return candidates.reduce((strongest, candidate) =>
    Math.abs(candidate.value) > Math.abs(strongest.value)
      ? candidate
      : strongest
  );
}

function resolveRegime(regime?: StockMarketRegimeInput): ResolvedRegime {
  const defaults = getRegimeDefaults(regime?.regime ?? "sideways");

  if (!regime) {
    return defaults;
  }

  return {
    regime: regime.regime,
    driftBias: regime.driftBias,
    volatilityMultiplier: regime.volatilityMultiplier,
    newsSensitivity: regime.newsSensitivity,
    volumeMultiplier: regime.volumeMultiplier,
    betaMultiplier: regime.betaMultiplier ?? defaults.betaMultiplier,
    sectorRotation: normalizeRecordKeys(regime.sectorRotation ?? {}),
    studentLabel: regime.studentLabel ?? defaults.studentLabel,
  };
}

function getRegimeDefaults(regime: StockMarketRegimeKind): ResolvedRegime {
  switch (regime) {
    case "bull":
      return {
        regime,
        driftBias: 0.4,
        volatilityMultiplier: 0.95,
        newsSensitivity: 1.05,
        volumeMultiplier: 1.1,
        betaMultiplier: 1.1,
        sectorRotation: {},
        studentLabel: "bull market",
      };
    case "bear":
      return {
        regime,
        driftBias: -0.5,
        volatilityMultiplier: 1.25,
        newsSensitivity: 1.25,
        volumeMultiplier: 1.2,
        betaMultiplier: 1.1,
        sectorRotation: {},
        studentLabel: "bear market",
      };
    case "crisis":
      return {
        regime,
        driftBias: -1.2,
        volatilityMultiplier: 2,
        newsSensitivity: 1.6,
        volumeMultiplier: 2,
        betaMultiplier: 1.3,
        sectorRotation: {},
        studentLabel: "crisis market",
      };
    case "recovery":
      return {
        regime,
        driftBias: 0.7,
        volatilityMultiplier: 1.2,
        newsSensitivity: 1.2,
        volumeMultiplier: 1.3,
        betaMultiplier: 1.1,
        sectorRotation: {},
        studentLabel: "recovery market",
      };
    case "sector_rotation":
      return {
        regime,
        driftBias: 0.1,
        volatilityMultiplier: 1.1,
        newsSensitivity: 1.25,
        volumeMultiplier: 1.2,
        betaMultiplier: 1,
        sectorRotation: {},
        studentLabel: "sector rotation market",
      };
    case "sideways":
      return {
        regime,
        driftBias: 0,
        volatilityMultiplier: 0.85,
        newsSensitivity: 1,
        volumeMultiplier: 0.9,
        betaMultiplier: 1,
        sectorRotation: {},
        studentLabel: "sideways market",
      };
  }
}

function indexCountries(
  countries: readonly StockMarketCountryInput[],
): ReadonlyMap<string, StockMarketCountryInput> {
  return new Map(
    countries.map((country) => [normalizeCountryCode(country.countryCode), country]),
  );
}

function indexSectors(
  sectors: readonly StockMarketSectorInput[],
): ReadonlyMap<string, StockMarketSectorInput> {
  return new Map(
    sectors.map((sector) => [normalizeSectorKey(sector.sectorKey), sector]),
  );
}

function validateEngineInput(input: StockMarketEngineInput): void {
  assertNonEmptyString("gameSessionId", input.gameSessionId);
  assertNonEmptyString("seed", input.seed);
  assertIntegerAtLeast("tickIndex", input.tickIndex, 0);

  if (!Array.isArray(input.assets) || input.assets.length === 0) {
    throw new Error("Stock market engine requires at least one asset.");
  }

  assertGameSessionId("macro", input.macro.gameSessionId, input.gameSessionId);
  validateMacroInput(input.macro);

  for (const asset of input.assets) {
    validateAssetInput(asset, input.gameSessionId);
  }

  for (const country of input.countries ?? []) {
    assertGameSessionId("country", country.gameSessionId, input.gameSessionId);
    validateOfficialCountryCode(country.countryCode, "country.countryCode");
    validateCountryInput(country);
  }

  for (const sector of input.sectors ?? []) {
    assertGameSessionId("sector", sector.gameSessionId, input.gameSessionId);
    assertNonEmptyString("sector.sectorKey", sector.sectorKey);
    validateOptionalFinite("sector.driftBias", sector.driftBias);
    validateOptionalPositive("sector.volatilityMultiplier", sector.volatilityMultiplier);
    validateOptionalPositive("sector.volumeMultiplier", sector.volumeMultiplier);
    validateOptionalPositive("sector.newsSensitivity", sector.newsSensitivity);
    validateOptionalFinite("sector.demandIndex", sector.demandIndex);
    validateOptionalFinite("sector.supplyConstraintIndex", sector.supplyConstraintIndex);
  }

  for (const shock of input.shocks ?? []) {
    validateShockInput(shock, input.gameSessionId);
  }

  if (input.regime) {
    validateRegimeInput(input.regime, input.gameSessionId);
  }

  if (input.settings) {
    assertGameSessionId(
      "settings",
      input.settings.gameSessionId,
      input.gameSessionId,
    );
    validateSettings(input.settings);
  }
}

function validateAssetInput(
  asset: StockMarketAssetInput,
  expectedGameSessionId: string,
): void {
  assertGameSessionId("asset", asset.gameSessionId, expectedGameSessionId);
  assertNonEmptyString("asset.assetId", asset.assetId);
  assertNonEmptyString("asset.ticker", asset.ticker);
  assertNonEmptyString("asset.companyName", asset.companyName);
  assertNonEmptyString("asset.sector", asset.sector);
  validateOfficialCountryCode(asset.countryCode, "asset.countryCode");
  assertPositiveFiniteNumber("asset.currentPrice", asset.currentPrice);
  validateOptionalPositive("asset.previousClose", asset.previousClose);
  validateOptionalPositive("asset.openPrice", asset.openPrice);
  validateOptionalPositive("asset.dayHigh", asset.dayHigh);
  validateOptionalPositive("asset.dayLow", asset.dayLow);
  validateOptionalPositive("asset.sharesOutstanding", asset.sharesOutstanding);
  validateOptionalPositive("asset.marketCap", asset.marketCap);
  assertFiniteNumber("asset.beta", asset.beta);
  if (asset.beta < 0) {
    throw new Error("asset.beta must be greater than or equal to 0.");
  }
  assertFiniteNumber("asset.liquidity", asset.liquidity);
  assertPositiveFiniteNumber("asset.currentVolatility", asset.currentVolatility);
  assertPositiveFiniteNumber("asset.longRunVolatility", asset.longRunVolatility);
  validateOptionalPositive("asset.fairValueAnchor", asset.fairValueAnchor);

  for (const value of asset.recentReturns ?? []) {
    assertFiniteNumber("asset.recentReturns[]", value);
  }

  for (const point of asset.history ?? []) {
    assertIntegerAtLeast("asset.history[].tickIndex", point.tickIndex, 0);
    assertNonEmptyString("asset.history[].timestamp", point.timestamp);
    assertNonEmptyString("asset.history[].label", point.label);
    assertPositiveFiniteNumber("asset.history[].price", point.price);
    validateOptionalPositive("asset.history[].volume", point.volume);
    if (point.gameSessionId) {
      assertGameSessionId(
        "asset.history[]",
        point.gameSessionId,
        expectedGameSessionId,
      );
    }
  }

  validateFundamentals(asset.fundamentals);
  validateExposureRecord(asset.countryExposure, "asset.countryExposure");
  validateExposureRecord(asset.sectorExposure, "asset.sectorExposure");
  validateExposureRecord(asset.commodityExposure, "asset.commodityExposure");
}

function validateFundamentals(
  fundamentals: StockMarketCompanyFundamentalsInput | undefined,
): void {
  if (!fundamentals) {
    return;
  }

  assertFiniteNumber("fundamentals.revenueGrowth", fundamentals.revenueGrowth);
  assertFiniteNumber("fundamentals.profitMargin", fundamentals.profitMargin);
  assertFiniteNumber("fundamentals.debtLevel", fundamentals.debtLevel);
  assertFiniteNumber("fundamentals.cashReserves", fundamentals.cashReserves);
  assertFiniteNumber("fundamentals.innovationScore", fundamentals.innovationScore);
  assertFiniteNumber("fundamentals.supplyChainRisk", fundamentals.supplyChainRisk);
  assertFiniteNumber("fundamentals.politicalExposure", fundamentals.politicalExposure);
  assertFiniteNumber("fundamentals.commodityExposure", fundamentals.commodityExposure);
}

function validateMacroInput(macro: StockMarketMacroInput): void {
  validateOptionalFinite("macro.gdpGrowthRate", macro.gdpGrowthRate);
  validateOptionalFinite("macro.inflationRate", macro.inflationRate);
  validateOptionalFinite("macro.unemploymentRate", macro.unemploymentRate);
  validateOptionalFinite("macro.interestRate", macro.interestRate);
  validateOptionalFinite("macro.consumerConfidenceIndex", macro.consumerConfidenceIndex);
  validateOptionalFinite("macro.businessConfidenceIndex", macro.businessConfidenceIndex);
  validateOptionalFinite("macro.marketRiskIndex", macro.marketRiskIndex);
  validateOptionalFinite("macro.politicalStabilityIndex", macro.politicalStabilityIndex);
  validateOptionalFinite("macro.infrastructureIndex", macro.infrastructureIndex);
  validateOptionalFinite("macro.energySecurityIndex", macro.energySecurityIndex);
  validateOptionalFinite("macro.globalDemandIndex", macro.globalDemandIndex);
}

function validateCountryInput(country: StockMarketCountryInput): void {
  validateOptionalFinite("country.gdpGrowthRate", country.gdpGrowthRate);
  validateOptionalFinite("country.inflationRate", country.inflationRate);
  validateOptionalFinite("country.unemploymentRate", country.unemploymentRate);
  validateOptionalFinite("country.interestRate", country.interestRate);
  validateOptionalFinite("country.consumerConfidenceIndex", country.consumerConfidenceIndex);
  validateOptionalFinite("country.businessConfidenceIndex", country.businessConfidenceIndex);
  validateOptionalFinite("country.tradeBalanceIndex", country.tradeBalanceIndex);
  validateOptionalFinite("country.exportStrengthIndex", country.exportStrengthIndex);
  validateOptionalFinite("country.marketRiskIndex", country.marketRiskIndex);
  validateOptionalFinite("country.politicalStabilityIndex", country.politicalStabilityIndex);
  validateOptionalFinite("country.infrastructureIndex", country.infrastructureIndex);
  validateOptionalFinite("country.energySecurityIndex", country.energySecurityIndex);
  validateOptionalFinite("country.supplyConstraintIndex", country.supplyConstraintIndex);
  validateOptionalFinite("country.importDependencyIndex", country.importDependencyIndex);
}

function validateShockInput(
  shock: StockMarketShockInput,
  expectedGameSessionId: string,
): void {
  assertGameSessionId("shock", shock.gameSessionId, expectedGameSessionId);
  assertNonEmptyString("shock.shockId", shock.shockId);
  assertNonEmptyString("shock.headline", shock.headline);
  assertNonEmptyString("shock.explanation", shock.explanation);
  assertFiniteNumber("shock.magnitude", shock.magnitude);
  assertFiniteNumber("shock.decay", shock.decay);
  assertFiniteNumber("shock.confidence", shock.confidence);
  validateOptionalFinite("shock.volatilityImpact", shock.volatilityImpact);
  validateOptionalFinite("shock.volumeImpact", shock.volumeImpact);
  assertIntegerAtLeast("shock.createdTick", shock.createdTick, 0);
  validateOptionalIntegerAtLeast("shock.expiresTick", shock.expiresTick, shock.createdTick);

  if (
    shock.scope === "country" &&
    shock.targetKey !== undefined &&
    shock.targetKey.trim() !== ""
  ) {
    validateOfficialCountryCode(shock.targetKey, "shock.targetKey");
  }
}

function validateRegimeInput(
  regime: StockMarketRegimeInput,
  expectedGameSessionId: string,
): void {
  assertGameSessionId("regime", regime.gameSessionId, expectedGameSessionId);
  assertFiniteNumber("regime.driftBias", regime.driftBias);
  assertPositiveFiniteNumber("regime.volatilityMultiplier", regime.volatilityMultiplier);
  assertPositiveFiniteNumber("regime.newsSensitivity", regime.newsSensitivity);
  assertPositiveFiniteNumber("regime.volumeMultiplier", regime.volumeMultiplier);
  validateOptionalPositive("regime.betaMultiplier", regime.betaMultiplier);
  validateExposureRecord(regime.sectorRotation, "regime.sectorRotation");
}

function validateSettings(settings: StockMarketEngineSettings): void {
  assertPositiveFiniteNumber("settings.minPrice", settings.minPrice);
  assertPositiveFiniteNumber("settings.maxTickMovePct", settings.maxTickMovePct);
  assertPositiveFiniteNumber(
    "settings.volatilityMeanReversionRate",
    settings.volatilityMeanReversionRate,
  );
  assertPositiveFiniteNumber("settings.minVolatility", settings.minVolatility);
  assertPositiveFiniteNumber("settings.maxVolatility", settings.maxVolatility);
  assertPositiveFiniteNumber(
    "settings.defaultLongRunVolatility",
    settings.defaultLongRunVolatility,
  );
  assertFiniteNumber(
    "settings.liquidityDampingStrength",
    settings.liquidityDampingStrength,
  );
  assertFiniteNumber("settings.momentumStrength", settings.momentumStrength);
  assertFiniteNumber(
    "settings.meanReversionStrength",
    settings.meanReversionStrength,
  );
  assertPositiveFiniteNumber("settings.baseVolume", settings.baseVolume);
  assertIntegerAtLeast("settings.maxHistoryPoints", settings.maxHistoryPoints, 1);

  if (settings.minVolatility > settings.maxVolatility) {
    throw new Error("settings.minVolatility must be less than or equal to settings.maxVolatility.");
  }
}

function validateExposureRecord(
  record: Readonly<Record<string, number>> | undefined,
  label: string,
): void {
  if (!record) {
    return;
  }

  for (const [key, value] of Object.entries(record)) {
    assertNonEmptyString(`${label} key`, key);
    assertFiniteNumber(`${label}.${key}`, value);
  }
}

function isShockActive(
  shock: StockMarketShockInput,
  tickIndex: number,
): boolean {
  return tickIndex >= shock.createdTick &&
    (shock.expiresTick === undefined || tickIndex <= shock.expiresTick);
}

function getShockExposureWeight(
  shock: StockMarketShockInput,
  args: {
    readonly asset: StockMarketAssetInput;
    readonly sectorKey: string;
    readonly countryCode: string;
  },
): number {
  switch (shock.scope) {
    case "global":
      return 1;
    case "ticker":
      return normalizeTicker(shock.targetKey ?? "") ===
          normalizeTicker(args.asset.ticker)
        ? 1
        : 0;
    case "country": {
      const targetCountryCode = normalizeCountryCode(shock.targetKey ?? "");
      if (targetCountryCode === args.countryCode) {
        return 1;
      }
      return getRecordExposureWeight(
        args.asset.countryExposure,
        targetCountryCode,
        normalizeCountryCode,
      );
    }
    case "sector": {
      const targetSectorKey = normalizeSectorKey(shock.targetKey ?? "");
      if (targetSectorKey === args.sectorKey) {
        return 1;
      }
      return getRecordExposureWeight(
        args.asset.sectorExposure,
        targetSectorKey,
        normalizeSectorKey,
      );
    }
  }
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

function getRecordExposureWeight(
  record: Readonly<Record<string, number>> | undefined,
  targetKey: string,
  normalize: (value: string) => string,
): number {
  if (!record || !targetKey) {
    return 0;
  }

  for (const [key, value] of Object.entries(record)) {
    if (normalize(key) === targetKey) {
      return clampNumber(Math.abs(value), 0, 1);
    }
  }

  return 0;
}

function calculateLiquidityDamping(
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

function normalizeRecordKeys(
  record: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [normalizeSectorKey(key), value]),
  );
}

function normalizeCountryCode(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeSectorKey(value: string): string {
  return value.trim().toUpperCase().replaceAll(/[^A-Z0-9]+/g, "_").replaceAll(
    /^_+|_+$/g,
    "",
  );
}

function normalizeTicker(value: string): string {
  return value.trim().toUpperCase();
}

function validateOfficialCountryCode(value: string, label: string): void {
  const countryCode = normalizeCountryCode(value);
  if (!OFFICIAL_COUNTRY_CODE_SET.has(countryCode)) {
    throw new Error(
      `${label} must be one of the official Econovaria countries: ${
        OFFICIAL_ECONOVARIA_COUNTRY_CODES.join(", ")
      }.`,
    );
  }
}

function assertGameSessionId(
  label: string,
  actual: string,
  expected: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `gameSessionId mismatch: ${label} has ${actual}, expected ${expected}.`,
    );
  }
}

function assertNonEmptyString(label: string, value: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertFiniteNumber(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
}

function assertPositiveFiniteNumber(label: string, value: number): void {
  assertFiniteNumber(label, value);
  if (value <= 0) {
    throw new Error(`${label} must be greater than 0.`);
  }
}

function assertIntegerAtLeast(
  label: string,
  value: number,
  min: number,
): void {
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${label} must be an integer greater than or equal to ${min}.`);
  }
}

function validateOptionalFinite(label: string, value: number | undefined): void {
  if (value !== undefined) {
    assertFiniteNumber(label, value);
  }
}

function validateOptionalPositive(label: string, value: number | undefined): void {
  if (value !== undefined) {
    assertPositiveFiniteNumber(label, value);
  }
}

function validateOptionalIntegerAtLeast(
  label: string,
  value: number | undefined,
  min: number,
): void {
  if (value !== undefined) {
    assertIntegerAtLeast(label, value, min);
  }
}

function positiveOptional(value: number | undefined): number | undefined {
  return value && value > 0 ? value : undefined;
}

function percentRateToPct(value: number | undefined): number {
  if (value === undefined) {
    return 0;
  }

  return Math.abs(value) <= 1 ? value * 100 : value;
}

function percentMagnitudeToPct(value: number): number {
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function indexDeviation(value: number | undefined): number {
  if (value === undefined) {
    return 0;
  }

  if (Math.abs(value) <= 1) {
    return clampNumber(value - 0.5, -1, 1);
  }

  return clampNumber((value - 50) / 50, -1, 1);
}

function toUnitScale(value: number): number {
  return Math.abs(value) <= 1 ? value : value / 100;
}

function normalizeVolatility(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return value > 1 ? value / 100 : value;
}

function normalizeVolatilityImpact(value: number | undefined): number {
  if (value === undefined) {
    return 0;
  }

  return Math.abs(value) > 1 ? value / 100 : value;
}

function normalizeVolumeImpact(value: number | undefined): number {
  if (value === undefined) {
    return 0;
  }

  return Math.abs(value) > 3 ? value / 100 : value;
}

function deterministicTickTimestamp(tickIndex: number): string {
  return `tick-${tickIndex}`;
}

function formatChangePct(value: number): string {
  const rounded = roundNumber(value, 2).toFixed(2);
  return value > 0 ? `+${rounded}%` : `${rounded}%`;
}

function formatCurrency(value: number): string {
  return `$${roundNumber(value, 2).toFixed(2)}`;
}
