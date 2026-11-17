// Tick orchestration and output projection; pure inputs/factors/shocks are separate owners.
import type {
  StockMarketAssetInput, StockMarketChartPoint, StockMarketCountryInput,
  StockMarketEngineInput, StockMarketEngineResult, StockMarketEngineSettings,
  StockMarketRowOutput, StockMarketSectorInput, StockPriceMovementComponentBreakdown,
  StockPriceMovementExplanation, StockPriceTickOutput,
} from "../contracts/stockMarketEngineContracts.ts";
import { clampNumber, roundNumber } from "./seededRandom.ts";
import { getCountryExposureProfile, normalizeCountryCode, type EconovariaCountryExposureProfile } from "./countryExposureProfiles.ts";
import { normalizeSectorKey, normalizeVolatility, resolveStockMarketEngineSettings, validateEngineInput } from "./stockMarketEngineInput.ts";
import { resolveRegime, type ResolvedRegime } from "./stockMarketRegime.ts";
import {
  calculateCountryFactor, calculateFundamentalsFactor, calculateLiquidityDamping,
  calculateMarketFactor, calculateMeanReversionFactor, calculateMomentumFactor,
  calculateNextVolatility, calculateSectorFactor, calculateVolatilityNoisePct, calculateVolume,
} from "./stockMarketFactors.ts";
import { calculateShockEffect } from "./stockMarketShocks.ts";
// Keep the original public API and profile object identities.
export { resolveStockMarketEngineSettings } from "./stockMarketEngineInput.ts";
export { calculateMarketFactor } from "./stockMarketFactors.ts";
export {
  OFFICIAL_ECONOVARIA_COUNTRY_CODES,
  SUPPORTED_STOCK_MARKET_SECTOR_KEYS,
  ECONOVARIA_COUNTRY_EXPOSURE_PROFILES,
  getCountryExposureProfile,
  type OfficialEconovariaCountryCode,
  type EconovariaCountryExposureProfile,
} from "./countryExposureProfiles.ts";

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

function positiveOptional(value: number | undefined): number | undefined {
  return value && value > 0 ? value : undefined;
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
