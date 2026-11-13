// Pure database-row interpretation. Scoped I/O and transactional writes stay in the repository.
import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
import type {
  StockMarketAssetInput,
  StockMarketChartPoint,
  StockMarketCompanyFundamentalsInput,
  StockMarketCountryInput,
  StockMarketMacroInput,
  StockMarketRegimeInput,
  StockMarketRegimeKind,
  StockMarketShockInput,
  StockMarketShockScope,
} from "../contracts/stockMarketEngineContracts.ts";
import type {
  CountryEconomicSnapshotRow,
  GameSessionStockAssetRow,
  StockMarketEventRow,
  StockMarketRegimeRow,
} from "./stockMarketRunnerRows.ts";

const FUNDAMENTAL_KEYS = [
  "revenueGrowth",
  "profitMargin",
  "debtLevel",
  "cashReserves",
  "innovationScore",
  "supplyChainRisk",
  "politicalExposure",
  "commodityExposure",
] as const;

export function toStockMarketAssetInput(
  row: GameSessionStockAssetRow,
): StockMarketAssetInput {
  return {
    gameSessionId: row.game_session_id,
    assetId: row.id,
    ticker: row.ticker,
    companyName: row.company_name,
    sector: row.sector_key,
    countryCode: normalizeKey(row.country_code),
    currentPrice: toNumber(row.current_price),
    previousClose: toOptionalNumber(row.previous_close),
    openPrice: toOptionalNumber(row.open_price),
    dayHigh: toOptionalNumber(row.day_high),
    dayLow: toOptionalNumber(row.day_low),
    sharesOutstanding: toOptionalNumber(row.shares_outstanding),
    marketCap: toOptionalNumber(row.market_cap),
    beta: toNumber(row.beta),
    liquidity: toNumber(row.liquidity),
    currentVolatility: toNumber(row.current_volatility),
    longRunVolatility: toNumber(row.long_run_volatility),
    fairValueAnchor: toOptionalNumber(row.fair_value_anchor),
    recentReturns: toNumberArray(row.recent_returns),
    history: toChartHistory(row.chart_history, row.game_session_id),
    fundamentals: toFundamentalsInput(row.fundamentals),
    countryExposure: toNumberRecord(row.country_exposure),
    sectorExposure: toNumberRecord(row.sector_exposure),
    commodityExposure: toNumberRecord(row.commodity_exposure),
  };
}

export function toStockMarketCountryInput(
  snapshot: CountryEconomicSnapshotRow,
  countryCode: string,
): StockMarketCountryInput {
  return {
    gameSessionId: snapshot.game_session_id,
    countryCode,
    gdpGrowthRate: toNumber(snapshot.gdp_growth_rate),
    inflationRate: toNumber(snapshot.inflation_rate),
    unemploymentRate: toNumber(snapshot.unemployment_rate),
    interestRate: toNumber(snapshot.interest_rate),
    consumerConfidenceIndex: toNumber(snapshot.consumer_confidence_index),
    businessConfidenceIndex: toNumber(snapshot.business_confidence_index),
    tradeBalanceIndex: toNumber(snapshot.trade_balance_index),
    exportStrengthIndex: toNumber(snapshot.export_strength_index),
    marketRiskIndex: toNumber(snapshot.market_risk_index),
    politicalStabilityIndex: toNumber(snapshot.political_stability_index),
    infrastructureIndex: toNumber(snapshot.infrastructure_index),
    energySecurityIndex: toNumber(snapshot.energy_security_index),
    supplyConstraintIndex: toNumber(snapshot.supply_constraint_index),
    importDependencyIndex: toNumber(snapshot.import_dependency_index),
  };
}

export function toStockMarketMacroInput(
  gameSessionId: string,
  snapshots: readonly {
    readonly snapshot: CountryEconomicSnapshotRow;
    readonly countryCode: string;
  }[],
): StockMarketMacroInput {
  return {
    gameSessionId,
    gdpGrowthRate: average(
      snapshots,
      ({ snapshot }) => snapshot.gdp_growth_rate,
    ),
    inflationRate: average(
      snapshots,
      ({ snapshot }) => snapshot.inflation_rate,
    ),
    unemploymentRate: average(
      snapshots,
      ({ snapshot }) => snapshot.unemployment_rate,
    ),
    interestRate: average(snapshots, ({ snapshot }) => snapshot.interest_rate),
    consumerConfidenceIndex: average(
      snapshots,
      ({ snapshot }) => snapshot.consumer_confidence_index,
    ),
    businessConfidenceIndex: average(
      snapshots,
      ({ snapshot }) => snapshot.business_confidence_index,
    ),
    marketRiskIndex: average(
      snapshots,
      ({ snapshot }) => snapshot.market_risk_index,
    ),
    politicalStabilityIndex: average(
      snapshots,
      ({ snapshot }) => snapshot.political_stability_index,
    ),
    infrastructureIndex: average(
      snapshots,
      ({ snapshot }) => snapshot.infrastructure_index,
    ),
    energySecurityIndex: average(
      snapshots,
      ({ snapshot }) => snapshot.energy_security_index,
    ),
    globalDemandIndex: averageGlobalDemand(snapshots),
  };
}

export function readLatestCountrySnapshots(
  snapshots: readonly CountryEconomicSnapshotRow[],
  countryCodeByProfileId: ReadonlyMap<string, string>,
): readonly {
  readonly snapshot: CountryEconomicSnapshotRow;
  readonly countryCode: string;
}[] {
  const latestByCountry = new Map<
    string,
    {
      readonly snapshot: CountryEconomicSnapshotRow;
      readonly countryCode: string;
    }
  >();

  for (const snapshot of snapshots) {
    const countryCode = countryCodeByProfileId.get(snapshot.country_profile_id);

    if (!countryCode) {
      continue;
    }

    const existing = latestByCountry.get(countryCode);

    if (!existing || compareSnapshotRecency(snapshot, existing.snapshot) > 0) {
      latestByCountry.set(countryCode, { snapshot, countryCode });
    }
  }

  return [...latestByCountry.values()].sort((left, right) =>
    left.countryCode.localeCompare(right.countryCode)
  );
}

export function toStockMarketShockInput(
  row: StockMarketEventRow,
): StockMarketShockInput {
  return {
    gameSessionId: row.game_session_id,
    shockId: row.shock_id,
    scope: row.scope as StockMarketShockScope,
    targetKey: row.target_key ?? undefined,
    magnitude: toNumber(row.magnitude),
    decay: toNumber(row.decay),
    confidence: toNumber(row.confidence),
    volatilityImpact: toOptionalNumber(row.volatility_impact),
    volumeImpact: toOptionalNumber(row.volume_impact),
    headline: row.headline,
    explanation: row.explanation,
    createdTick: Math.trunc(toNumber(row.created_tick)),
    expiresTick: toOptionalInteger(row.expires_tick),
  };
}

export function toStockMarketRegimeInput(
  row: StockMarketRegimeRow,
): StockMarketRegimeInput {
  return {
    gameSessionId: row.game_session_id,
    regime: row.regime as StockMarketRegimeKind,
    driftBias: toNumber(row.drift_bias),
    volatilityMultiplier: toNumber(row.volatility_multiplier),
    newsSensitivity: toNumber(row.news_sensitivity),
    volumeMultiplier: toNumber(row.volume_multiplier),
    betaMultiplier: toOptionalNumber(row.beta_multiplier),
    sectorRotation: toNumberRecord(row.sector_rotation),
    studentLabel: row.student_label ?? undefined,
  };
}

function toFundamentalsInput(
  value: JsonObject,
): StockMarketCompanyFundamentalsInput | undefined {
  const numericValues = toNumberRecord(value, { normalizeKeys: false });

  for (const key of FUNDAMENTAL_KEYS) {
    if (!Number.isFinite(numericValues[key])) {
      return undefined;
    }
  }

  return {
    revenueGrowth: numericValues.revenueGrowth,
    profitMargin: numericValues.profitMargin,
    debtLevel: numericValues.debtLevel,
    cashReserves: numericValues.cashReserves,
    innovationScore: numericValues.innovationScore,
    supplyChainRisk: numericValues.supplyChainRisk,
    politicalExposure: numericValues.politicalExposure,
    commodityExposure: numericValues.commodityExposure,
  };
}

function toChartHistory(
  value: readonly JsonValue[],
  gameSessionId: string,
): readonly StockMarketChartPoint[] {
  return value.flatMap((item) => {
    if (!isJsonObject(item)) {
      return [];
    }

    const tickIndex = toNumber(item.tickIndex);
    const timestamp = typeof item.timestamp === "string" ? item.timestamp : "";
    const label = typeof item.label === "string" ? item.label : "";
    const price = toNumber(item.price);

    if (
      !Number.isInteger(tickIndex) ||
      tickIndex < 0 ||
      !timestamp ||
      !label ||
      price <= 0
    ) {
      return [];
    }

    return [{
      gameSessionId: typeof item.gameSessionId === "string"
        ? item.gameSessionId
        : gameSessionId,
      tickIndex,
      timestamp,
      label,
      price,
      volume: toOptionalNumber(item.volume),
    }];
  });
}

function toNumberArray(value: readonly JsonValue[]): readonly number[] {
  return value
    .map(toNumber)
    .filter((candidate) => Number.isFinite(candidate));
}

function toNumberRecord(
  value: JsonObject,
  options: { readonly normalizeKeys: boolean } = { normalizeKeys: true },
): Readonly<Record<string, number>> {
  const result: Record<string, number> = {};

  for (const [key, rawValue] of Object.entries(value)) {
    const numericValue =
      typeof rawValue === "number" || typeof rawValue === "string"
        ? Number(rawValue)
        : Number.NaN;

    if (Number.isFinite(numericValue)) {
      result[options.normalizeKeys ? normalizeKey(key) : key] = numericValue;
    }
  }

  return result;
}

export function isTickInWindow(
  startsAt: number | string,
  endsAt: number | string | null | undefined,
  tickIndex: number,
): boolean {
  const startTick = toNumber(startsAt);
  const endTick = toOptionalNumber(endsAt);

  return tickIndex >= startTick &&
    (endTick === undefined || tickIndex <= endTick);
}

function compareSnapshotRecency(
  left: CountryEconomicSnapshotRow,
  right: CountryEconomicSnapshotRow,
): number {
  const sequenceDifference = toNumber(left.snapshot_sequence) -
    toNumber(right.snapshot_sequence);

  if (sequenceDifference !== 0) {
    return sequenceDifference;
  }

  return Date.parse(left.effective_at) - Date.parse(right.effective_at);
}

function average<T>(
  values: readonly T[],
  readValue: (value: T) => number | string,
): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  return round(
    values.reduce((sum, value) => sum + toNumber(readValue(value)), 0) /
      values.length,
  );
}

function averageGlobalDemand(
  values: readonly {
    readonly snapshot: CountryEconomicSnapshotRow;
  }[],
): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const total = values.reduce((sum, { snapshot }) =>
    sum +
    toNumber(snapshot.consumer_confidence_index) +
    toNumber(snapshot.business_confidence_index) +
    toIndexScale(snapshot.export_strength_index), 0);

  return round(total / (values.length * 3));
}

function toIndexScale(
  value: number | string | JsonValue | undefined | null,
): number {
  const numericValue = toNumber(value);

  if (!Number.isFinite(numericValue)) {
    return Number.NaN;
  }

  return Math.abs(numericValue) <= 2 ? numericValue * 100 : numericValue;
}

export function toNumber(
  value: number | string | JsonValue | undefined | null,
): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  return Number.NaN;
}

function toOptionalNumber(
  value: number | string | JsonValue | undefined | null,
): number | undefined {
  const numericValue = toNumber(value);

  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function toOptionalInteger(
  value: number | string | null | undefined,
): number | undefined {
  const numericValue = toOptionalNumber(value);

  return numericValue === undefined ? undefined : Math.trunc(numericValue);
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function normalizeKey(value: string): string {
  return value.trim().toUpperCase();
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

