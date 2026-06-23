import type {
  ApplyStockMarketRunnerTickRpcRow,
  JsonObject,
  JsonValue,
} from "../../../supabase/tableTypes.ts";
import type {
  StockMarketAssetInput,
  StockMarketChartPoint,
  StockMarketCompanyFundamentalsInput,
  StockMarketCountryInput,
  StockMarketMacroInput,
  StockMarketRegimeInput,
  StockMarketRegimeKind,
  StockMarketSectorInput,
  StockMarketShockInput,
  StockMarketShockScope,
} from "../contracts/stockMarketEngineContracts.ts";
import {
  StockMarketRunnerError,
  type StockMarketRunnerApplyResult,
  type StockMarketRunnerLoadedState,
  type StockMarketRunnerLoadInput,
  type StockMarketRunnerPersistencePayload,
  type StockMarketRunnerRepository,
} from "../contracts/stockMarketRunnerContracts.ts";

interface SupabaseRunnerQueryError {
  readonly message: string;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

interface SupabaseRunnerQueryResponse<T = unknown> {
  readonly data: T | null;
  readonly error: SupabaseRunnerQueryError | null;
  readonly count?: number | null;
  readonly status?: number;
  readonly statusText?: string;
}

type RunnerTableName =
  | "game_sessions"
  | "game_session_stock_assets"
  | "stock_price_ticks"
  | "stock_market_events"
  | "stock_market_regimes"
  | "country_profiles"
  | "country_economic_snapshots";

interface SupabaseStockMarketRunnerClient {
  from(tableName: RunnerTableName): SupabaseStockMarketRunnerQueryBuilder;
  rpc<Data = unknown>(
    functionName: string,
    args?: unknown,
  ): PromiseLike<SupabaseRunnerQueryResponse<Data>>;
}

interface SupabaseStockMarketRunnerQueryBuilder {
  select(columns: string): SupabaseStockMarketRunnerFilterBuilder;
}

interface SupabaseStockMarketRunnerFilterBuilder
  extends PromiseLike<SupabaseRunnerQueryResponse<unknown[]>> {
  eq(column: string, value: unknown): SupabaseStockMarketRunnerFilterBuilder;
  in(
    column: string,
    values: readonly unknown[],
  ): SupabaseStockMarketRunnerFilterBuilder;
  order(
    column: string,
    options?: { readonly ascending?: boolean },
  ): SupabaseStockMarketRunnerFilterBuilder;
  limit(count: number): SupabaseStockMarketRunnerFilterBuilder;
  maybeSingle(): PromiseLike<SupabaseRunnerQueryResponse<unknown>>;
}

interface GameSessionRow {
  readonly id: string;
}

interface GameSessionStockAssetRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly ticker: string;
  readonly company_name: string;
  readonly sector_key: string;
  readonly country_code: string;
  readonly current_price: number | string;
  readonly previous_close: number | string;
  readonly open_price: number | string;
  readonly day_high: number | string;
  readonly day_low: number | string;
  readonly market_cap?: number | string | null;
  readonly shares_outstanding?: number | string | null;
  readonly beta: number | string;
  readonly liquidity: number | string;
  readonly current_volatility: number | string;
  readonly long_run_volatility: number | string;
  readonly fair_value_anchor?: number | string | null;
  readonly recent_returns: readonly JsonValue[];
  readonly chart_history: readonly JsonValue[];
  readonly fundamentals: JsonObject;
  readonly country_exposure: JsonObject;
  readonly sector_exposure: JsonObject;
  readonly commodity_exposure: JsonObject;
}

interface StockPriceTickIndexRow {
  readonly tick_index: number | string;
}

interface StockMarketEventRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly shock_id: string;
  readonly scope: StockMarketShockScope | string;
  readonly target_key?: string | null;
  readonly magnitude: number | string;
  readonly decay: number | string;
  readonly confidence: number | string;
  readonly volatility_impact?: number | string | null;
  readonly volume_impact?: number | string | null;
  readonly headline: string;
  readonly explanation: string;
  readonly created_tick: number | string;
  readonly expires_tick?: number | string | null;
}

interface StockMarketRegimeRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly regime: StockMarketRegimeKind | string;
  readonly starts_tick: number | string;
  readonly ends_tick?: number | string | null;
  readonly drift_bias: number | string;
  readonly volatility_multiplier: number | string;
  readonly news_sensitivity: number | string;
  readonly volume_multiplier: number | string;
  readonly beta_multiplier?: number | string | null;
  readonly sector_rotation: JsonObject;
  readonly student_label?: string | null;
}

interface CountryProfileRow {
  readonly id: string;
  readonly country_code: string;
}

interface CountryEconomicSnapshotRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly country_profile_id: string;
  readonly snapshot_sequence: number | string;
  readonly effective_at: string;
  readonly gdp_growth_rate: number | string;
  readonly inflation_rate: number | string;
  readonly unemployment_rate: number | string;
  readonly interest_rate: number | string;
  readonly consumer_confidence_index: number | string;
  readonly business_confidence_index: number | string;
  readonly trade_balance_index: number | string;
  readonly export_strength_index: number | string;
  readonly market_risk_index: number | string;
  readonly political_stability_index: number | string;
  readonly infrastructure_index: number | string;
  readonly energy_security_index: number | string;
  readonly supply_constraint_index: number | string;
  readonly import_dependency_index: number | string;
}

const STOCK_ASSET_SELECT = [
  "id",
  "game_session_id",
  "ticker",
  "company_name",
  "sector_key",
  "country_code",
  "current_price",
  "previous_close",
  "open_price",
  "day_high",
  "day_low",
  "market_cap",
  "shares_outstanding",
  "beta",
  "liquidity",
  "current_volatility",
  "long_run_volatility",
  "fair_value_anchor",
  "recent_returns",
  "chart_history",
  "fundamentals",
  "country_exposure",
  "sector_exposure",
  "commodity_exposure",
].join(",");

const STOCK_EVENT_SELECT = [
  "id",
  "game_session_id",
  "shock_id",
  "scope",
  "target_key",
  "magnitude",
  "decay",
  "confidence",
  "volatility_impact",
  "volume_impact",
  "headline",
  "explanation",
  "created_tick",
  "expires_tick",
].join(",");

const STOCK_REGIME_SELECT = [
  "id",
  "game_session_id",
  "regime",
  "starts_tick",
  "ends_tick",
  "drift_bias",
  "volatility_multiplier",
  "news_sensitivity",
  "volume_multiplier",
  "beta_multiplier",
  "sector_rotation",
  "student_label",
].join(",");

const COUNTRY_SNAPSHOT_SELECT = [
  "id",
  "game_session_id",
  "country_profile_id",
  "snapshot_sequence",
  "effective_at",
  "gdp_growth_rate",
  "inflation_rate",
  "unemployment_rate",
  "interest_rate",
  "consumer_confidence_index",
  "business_confidence_index",
  "trade_balance_index",
  "export_strength_index",
  "market_risk_index",
  "political_stability_index",
  "infrastructure_index",
  "energy_security_index",
  "supply_constraint_index",
  "import_dependency_index",
].join(",");

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

export class SupabaseStockMarketRunnerRepository
  implements StockMarketRunnerRepository {
  constructor(private readonly client: SupabaseStockMarketRunnerClient) {}

  async load(
    input: StockMarketRunnerLoadInput,
  ): Promise<StockMarketRunnerLoadedState> {
    await this.assertGameSessionExists(input.gameSessionId);

    const tickIndex = input.tickIndex ??
      await this.readNextTickIndex(input.gameSessionId);

    await this.assertTickDoesNotExist(input.gameSessionId, tickIndex);

    const assetRows = await this.readActiveAssets(input.gameSessionId);

    if (assetRows.length === 0) {
      throw new StockMarketRunnerError(
        "no_active_stock_assets",
        "No active stock assets exist for this game session.",
        409,
      );
    }

    const assets = assetRows.map(toStockMarketAssetInput);
    const countryInputs = await this.readCountryInputs(
      input.gameSessionId,
      assets.map((asset) => asset.countryCode),
    );

    return {
      gameSessionId: input.gameSessionId,
      tickIndex,
      assets,
      macro: countryInputs.macro,
      countries: countryInputs.countries,
      sectors: [],
      shocks: await this.readActiveShocks(input.gameSessionId, tickIndex),
      regime: await this.readActiveRegime(input.gameSessionId, tickIndex),
    };
  }

  async apply(
    payload: StockMarketRunnerPersistencePayload,
  ): Promise<StockMarketRunnerApplyResult> {
    const response = await this.client.rpc<
      readonly ApplyStockMarketRunnerTickRpcRow[]
    >("apply_stock_market_runner_tick", {
      p_game_session_id: payload.gameSessionId,
      p_tick_index: payload.tickIndex,
      p_asset_updates: payload.assetUpdates,
      p_tick_rows: payload.tickRows,
    });

    if (response.error) {
      throw mapPersistenceError(response.error, "stock_market_tick_apply_failed");
    }

    const row = response.data?.[0];

    if (!row) {
      throw new StockMarketRunnerError(
        "stock_market_tick_apply_failed",
        "Stock market tick persistence returned no result.",
        500,
      );
    }

    return {
      assetsUpdated: Number(row.assets_updated),
      ticksInserted: Number(row.ticks_inserted),
    };
  }

  private async assertGameSessionExists(gameSessionId: string): Promise<void> {
    const response = await this.client
      .from("game_sessions")
      .select("id")
      .eq("id", gameSessionId)
      .maybeSingle();

    if (response.error) {
      throw mapPersistenceError(response.error, "stock_market_state_load_failed");
    }

    const row = response.data as GameSessionRow | null;

    if (!row?.id) {
      throw new StockMarketRunnerError(
        "game_session_not_found",
        "Game session could not be found.",
        404,
      );
    }
  }

  private async readNextTickIndex(gameSessionId: string): Promise<number> {
    const response = await this.client
      .from("stock_price_ticks")
      .select("tick_index")
      .eq("game_session_id", gameSessionId)
      .order("tick_index", { ascending: false })
      .limit(1);

    if (response.error) {
      throw mapPersistenceError(response.error, "stock_market_state_load_failed");
    }

    const rows = (response.data ?? []) as StockPriceTickIndexRow[];
    const latestTickIndex = rows.length > 0 ? toNumber(rows[0].tick_index) : 0;

    return Math.max(0, Math.trunc(latestTickIndex)) + 1;
  }

  private async assertTickDoesNotExist(
    gameSessionId: string,
    tickIndex: number,
  ): Promise<void> {
    const response = await this.client
      .from("stock_price_ticks")
      .select("tick_index")
      .eq("game_session_id", gameSessionId)
      .eq("tick_index", tickIndex)
      .limit(1)
      .maybeSingle();

    if (response.error) {
      throw mapPersistenceError(response.error, "stock_market_state_load_failed");
    }

    if (response.data) {
      throw new StockMarketRunnerError(
        "stock_tick_already_exists",
        "A stock price tick already exists for this game session and tick index.",
        409,
      );
    }
  }

  private async readActiveAssets(
    gameSessionId: string,
  ): Promise<readonly GameSessionStockAssetRow[]> {
    const response = await this.client
      .from("game_session_stock_assets")
      .select(STOCK_ASSET_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("is_active", true)
      .order("ticker", { ascending: true });

    if (response.error) {
      throw mapPersistenceError(response.error, "stock_market_state_load_failed");
    }

    return (response.data ?? []) as GameSessionStockAssetRow[];
  }

  private async readActiveShocks(
    gameSessionId: string,
    tickIndex: number,
  ): Promise<readonly StockMarketShockInput[]> {
    const response = await this.client
      .from("stock_market_events")
      .select(STOCK_EVENT_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("is_active", true)
      .order("created_tick", { ascending: true });

    if (response.error) {
      throw mapPersistenceError(response.error, "stock_market_state_load_failed");
    }

    return ((response.data ?? []) as StockMarketEventRow[])
      .filter((row) => isTickInWindow(row.created_tick, row.expires_tick, tickIndex))
      .map(toStockMarketShockInput);
  }

  private async readActiveRegime(
    gameSessionId: string,
    tickIndex: number,
  ): Promise<StockMarketRegimeInput | undefined> {
    const response = await this.client
      .from("stock_market_regimes")
      .select(STOCK_REGIME_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("is_active", true)
      .order("starts_tick", { ascending: false });

    if (response.error) {
      throw mapPersistenceError(response.error, "stock_market_state_load_failed");
    }

    const row = ((response.data ?? []) as StockMarketRegimeRow[])
      .filter((candidate) =>
        isTickInWindow(candidate.starts_tick, candidate.ends_tick, tickIndex)
      )
      .sort((left, right) => toNumber(right.starts_tick) - toNumber(left.starts_tick))[0];

    return row ? toStockMarketRegimeInput(row) : undefined;
  }

  private async readCountryInputs(
    gameSessionId: string,
    countryCodes: readonly string[],
  ): Promise<{
    readonly macro: StockMarketMacroInput;
    readonly countries: readonly StockMarketCountryInput[];
    readonly sectors: readonly StockMarketSectorInput[];
  }> {
    const representedCountryCodes = [...new Set(countryCodes.map(normalizeKey))]
      .filter(Boolean);

    if (representedCountryCodes.length === 0) {
      return {
        macro: { gameSessionId },
        countries: [],
        sectors: [],
      };
    }

    const profileResponse = await this.client
      .from("country_profiles")
      .select("id,country_code")
      .in("country_code", representedCountryCodes)
      .eq("status", "active");

    if (profileResponse.error) {
      throw mapPersistenceError(profileResponse.error, "stock_market_state_load_failed");
    }

    const profiles = (profileResponse.data ?? []) as CountryProfileRow[];

    if (profiles.length === 0) {
      return {
        macro: { gameSessionId },
        countries: [],
        sectors: [],
      };
    }

    const profileById = new Map(
      profiles.map((profile) => [profile.id, normalizeKey(profile.country_code)]),
    );
    const snapshotResponse = await this.client
      .from("country_economic_snapshots")
      .select(COUNTRY_SNAPSHOT_SELECT)
      .eq("game_session_id", gameSessionId)
      .in("country_profile_id", profiles.map((profile) => profile.id))
      .order("snapshot_sequence", { ascending: false })
      .order("effective_at", { ascending: false });

    if (snapshotResponse.error) {
      throw mapPersistenceError(snapshotResponse.error, "stock_market_state_load_failed");
    }

    const latestSnapshots = readLatestCountrySnapshots(
      (snapshotResponse.data ?? []) as CountryEconomicSnapshotRow[],
      profileById,
    );

    if (latestSnapshots.length === 0) {
      return {
        macro: { gameSessionId },
        countries: [],
        sectors: [],
      };
    }

    return {
      macro: toStockMarketMacroInput(gameSessionId, latestSnapshots),
      countries: latestSnapshots.map(({ snapshot, countryCode }) =>
        toStockMarketCountryInput(snapshot, countryCode)
      ),
      sectors: [],
    };
  }
}

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
    gdpGrowthRate: average(snapshots, ({ snapshot }) => snapshot.gdp_growth_rate),
    inflationRate: average(snapshots, ({ snapshot }) => snapshot.inflation_rate),
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
    { readonly snapshot: CountryEconomicSnapshotRow; readonly countryCode: string }
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

function toStockMarketShockInput(row: StockMarketEventRow): StockMarketShockInput {
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

function toStockMarketRegimeInput(
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
    const numericValue = typeof rawValue === "number" || typeof rawValue === "string"
      ? Number(rawValue)
      : Number.NaN;

    if (Number.isFinite(numericValue)) {
      result[options.normalizeKeys ? normalizeKey(key) : key] = numericValue;
    }
  }

  return result;
}

function isTickInWindow(
  startsAt: number | string,
  endsAt: number | string | null | undefined,
  tickIndex: number,
): boolean {
  const startTick = toNumber(startsAt);
  const endTick = toOptionalNumber(endsAt);

  return tickIndex >= startTick && (endTick === undefined || tickIndex <= endTick);
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
    toNumber(snapshot.export_strength_index), 0);

  return round(total / (values.length * 3));
}

function toNumber(value: number | string | JsonValue | undefined | null): number {
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

function normalizeKey(value: string): string {
  return value.trim().toUpperCase();
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapPersistenceError(
  error: SupabaseRunnerQueryError,
  defaultCode: "stock_market_state_load_failed" | "stock_market_tick_apply_failed",
): StockMarketRunnerError {
  const normalizedMessage = error.message.toUpperCase();

  if (isSchemaNotAppliedError(error)) {
    return new StockMarketRunnerError(
      "stock_market_schema_not_applied",
      "Stock market runner schema is not applied.",
      500,
    );
  }

  if (normalizedMessage.includes("STOCK_TICK_ALREADY_EXISTS")) {
    return new StockMarketRunnerError(
      "stock_tick_already_exists",
      "A stock price tick already exists for this game session and tick index.",
      409,
    );
  }

  return new StockMarketRunnerError(
    defaultCode,
    defaultCode === "stock_market_tick_apply_failed"
      ? "Stock market tick could not be persisted."
      : "Stock market state could not be loaded.",
    500,
  );
}

function isSchemaNotAppliedError(error: SupabaseRunnerQueryError): boolean {
  const message = error.message.toLowerCase();

  return error.code === "42P01" ||
    error.code === "42703" ||
    message.includes("does not exist") ||
    message.includes("schema cache");
}
