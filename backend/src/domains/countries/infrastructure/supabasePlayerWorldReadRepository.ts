import {
  type PlayerWorldCountryCollectionRecord,
  type PlayerWorldCountryDetailReadInput,
  type PlayerWorldCountryDetailRecord,
  type PlayerWorldCountryProfileRecord,
  type PlayerWorldCountryReadInput,
  type PlayerWorldCountryRecord,
  type PlayerWorldEconomicSnapshotRecord,
  type PlayerWorldNewsCollectionRecord,
  type PlayerWorldNewsReadInput,
  type PlayerWorldNewsRecord,
  PlayerWorldReadPersistenceError,
  type PlayerWorldReadRepository,
} from "../contracts/playerWorldReadContracts.ts";

interface QueryError {
  readonly message: string;
  readonly code?: string;
}

interface QueryResponse<T> {
  readonly data: T | null;
  readonly error: QueryError | null;
}

interface FilterBuilder
  extends PromiseLike<QueryResponse<readonly Record<string, unknown>[]>> {
  eq(column: string, value: unknown): FilterBuilder;
  lte(column: string, value: unknown): FilterBuilder;
  order(
    column: string,
    options?: { readonly ascending?: boolean },
  ): FilterBuilder;
  limit(count: number): FilterBuilder;
  maybeSingle(): PromiseLike<QueryResponse<Record<string, unknown>>>;
}

interface QueryBuilder {
  select(columns: string): FilterBuilder;
}

interface PlayerWorldReadClient {
  from(tableName: string): QueryBuilder;
}

interface CountryProfileRow {
  readonly id: string;
  readonly country_code: string;
  readonly country_name: string;
  readonly capital_name: string;
  readonly currency_code: string;
  readonly metadata: unknown;
}

interface PlayerCountryAssignmentRow {
  readonly game_session_id: string;
  readonly player_id: string;
  readonly country_profile_id: string;
}

interface CountryEconomicSnapshotRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly country_profile_id: string;
  readonly snapshot_sequence: number | string;
  readonly effective_at: string;
  readonly snapshot_label?: string | null;
  readonly difficulty_preset: string;
  readonly real_gdp_index: number | string;
  readonly gdp_growth_rate: number | string;
  readonly inflation_rate: number | string;
  readonly unemployment_rate: number | string;
  readonly interest_rate: number | string;
  readonly consumer_confidence_index: number | string;
  readonly business_confidence_index: number | string;
  readonly cost_of_living_index: number | string;
  readonly regional_price_multiplier: number | string;
  readonly supply_constraint_index: number | string;
  readonly import_dependency_index: number | string;
  readonly tax_rate: number | string;
  readonly subsidy_rate: number | string;
  readonly exchange_rate_index: number | string;
  readonly currency_stability_index: number | string;
  readonly trade_balance_index: number | string;
  readonly export_strength_index: number | string;
  readonly market_risk_index: number | string;
  readonly political_stability_index: number | string;
  readonly infrastructure_index: number | string;
  readonly energy_security_index: number | string;
}

interface StockMarketEventRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly shock_id: string;
  readonly category: string;
  readonly sentiment: string;
  readonly source: string;
  readonly scope: string;
  readonly target_key?: string | null;
  readonly headline: string;
  readonly explanation: string;
  readonly magnitude: number | string;
  readonly confidence: number | string;
  readonly volatility_impact?: number | string | null;
  readonly volume_impact?: number | string | null;
  readonly created_tick: number | string;
  readonly expires_tick?: number | string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

const MAX_COUNTRY_PROFILES = 50;

const COUNTRY_PROFILE_SELECT = [
  "id",
  "country_code",
  "country_name",
  "capital_name",
  "currency_code",
  "metadata",
].join(",");

const PLAYER_COUNTRY_ASSIGNMENT_SELECT = [
  "game_session_id",
  "player_id",
  "country_profile_id",
].join(",");

const ECONOMIC_SNAPSHOT_SELECT = [
  "id",
  "game_session_id",
  "country_profile_id",
  "snapshot_sequence",
  "effective_at",
  "snapshot_label",
  "difficulty_preset",
  "real_gdp_index",
  "gdp_growth_rate",
  "inflation_rate",
  "unemployment_rate",
  "interest_rate",
  "consumer_confidence_index",
  "business_confidence_index",
  "cost_of_living_index",
  "regional_price_multiplier",
  "supply_constraint_index",
  "import_dependency_index",
  "tax_rate",
  "subsidy_rate",
  "exchange_rate_index",
  "currency_stability_index",
  "trade_balance_index",
  "export_strength_index",
  "market_risk_index",
  "political_stability_index",
  "infrastructure_index",
  "energy_security_index",
].join(",");

const MARKET_NEWS_SELECT = [
  "id",
  "game_session_id",
  "shock_id",
  "category",
  "sentiment",
  "source",
  "scope",
  "target_key",
  "headline",
  "explanation",
  "magnitude",
  "confidence",
  "volatility_impact",
  "volume_impact",
  "created_tick",
  "expires_tick",
  "created_at",
  "updated_at",
].join(",");

export class SupabasePlayerWorldReadRepository
  implements PlayerWorldReadRepository {
  constructor(private readonly client: PlayerWorldReadClient) {}

  async readCountries(
    input: PlayerWorldCountryReadInput,
  ): Promise<PlayerWorldCountryCollectionRecord> {
    const [profiles, playerCountryProfileId] = await Promise.all([
      this.readActiveCountryProfiles(),
      this.readPlayerCountryProfileId(input.gameSessionId, input.playerId),
    ]);
    const countries = await Promise.all(
      profiles.map(async (profile): Promise<PlayerWorldCountryRecord> => ({
        profile,
        latestEconomicSnapshot: await this.readLatestEffectiveSnapshot(
          input.gameSessionId,
          profile.id,
          input.effectiveAtIso,
        ),
      })),
    );

    return {
      gameSessionId: input.gameSessionId,
      playerId: input.playerId,
      playerCountryProfileId,
      countries,
    };
  }

  async readCountry(
    input: PlayerWorldCountryDetailReadInput,
  ): Promise<PlayerWorldCountryDetailRecord> {
    const [profile, playerCountryProfileId] = await Promise.all([
      this.readActiveCountryProfile(input.countryIdentifier),
      this.readPlayerCountryProfileId(input.gameSessionId, input.playerId),
    ]);

    if (!profile) {
      return {
        gameSessionId: input.gameSessionId,
        playerId: input.playerId,
        playerCountryProfileId,
        country: null,
      };
    }

    return {
      gameSessionId: input.gameSessionId,
      playerId: input.playerId,
      playerCountryProfileId,
      country: {
        profile,
        latestEconomicSnapshot: await this.readLatestEffectiveSnapshot(
          input.gameSessionId,
          profile.id,
          input.effectiveAtIso,
        ),
      },
    };
  }

  async readNews(
    input: PlayerWorldNewsReadInput,
  ): Promise<PlayerWorldNewsCollectionRecord> {
    let query = this.client
      .from("stock_market_events")
      .select(MARKET_NEWS_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("visibility", "public")
      .eq("is_active", true);

    if (input.category) {
      query = query.eq("category", input.category);
    }

    const response = await query
      .order("created_tick", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(input.limit);

    if (response.error) {
      throw mapPersistenceError(response.error);
    }

    return {
      gameSessionId: input.gameSessionId,
      news: ((response.data ?? []) as unknown as readonly StockMarketEventRow[])
        .map(toNewsRecord),
    };
  }

  private async readActiveCountryProfiles(): Promise<
    readonly PlayerWorldCountryProfileRecord[]
  > {
    const response = await this.client
      .from("country_profiles")
      .select(COUNTRY_PROFILE_SELECT)
      .eq("status", "active")
      .order("country_name", { ascending: true })
      .limit(MAX_COUNTRY_PROFILES + 1);

    if (response.error) {
      throw mapPersistenceError(response.error);
    }

    const rows =
      (response.data ?? []) as unknown as readonly CountryProfileRow[];

    if (rows.length > MAX_COUNTRY_PROFILES) {
      throw readFailed();
    }

    return rows.map(toCountryProfileRecord);
  }

  private async readActiveCountryProfile(
    countryIdentifier: string,
  ): Promise<PlayerWorldCountryProfileRecord | null> {
    const lookup = parseCountryLookup(countryIdentifier);
    const response = await this.client
      .from("country_profiles")
      .select(COUNTRY_PROFILE_SELECT)
      .eq("status", "active")
      .eq(lookup.column, lookup.value)
      .limit(1)
      .maybeSingle();

    if (response.error) {
      throw mapPersistenceError(response.error);
    }

    return response.data
      ? toCountryProfileRecord(response.data as unknown as CountryProfileRow)
      : null;
  }

  private async readPlayerCountryProfileId(
    gameSessionId: string,
    playerId: string,
  ): Promise<string | null> {
    const response = await this.client
      .from("player_country_assignments")
      .select(PLAYER_COUNTRY_ASSIGNMENT_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("player_id", playerId)
      .eq("status", "active")
      .order("assigned_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (response.error) {
      throw mapPersistenceError(response.error);
    }

    const row = response.data as unknown as PlayerCountryAssignmentRow | null;

    if (!row) {
      return null;
    }

    if (row.game_session_id !== gameSessionId || row.player_id !== playerId) {
      throw readFailed();
    }

    return row.country_profile_id;
  }

  private async readLatestEffectiveSnapshot(
    gameSessionId: string,
    countryProfileId: string,
    effectiveAtIso: string,
  ): Promise<PlayerWorldEconomicSnapshotRecord | null> {
    const response = await this.client
      .from("country_economic_snapshots")
      .select(ECONOMIC_SNAPSHOT_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("country_profile_id", countryProfileId)
      .lte("effective_at", effectiveAtIso)
      .order("effective_at", { ascending: false })
      .order("snapshot_sequence", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (response.error) {
      throw mapPersistenceError(response.error);
    }

    if (!response.data) {
      return null;
    }

    const snapshot = toEconomicSnapshotRecord(
      response.data as unknown as CountryEconomicSnapshotRow,
    );

    if (
      snapshot.gameSessionId !== gameSessionId ||
      snapshot.countryProfileId !== countryProfileId
    ) {
      throw readFailed();
    }

    return snapshot;
  }
}

function parseCountryLookup(countryIdentifier: string): {
  readonly column: "id" | "country_code";
  readonly value: string;
} {
  return isUuid(countryIdentifier)
    ? { column: "id", value: countryIdentifier.toLowerCase() }
    : { column: "country_code", value: countryIdentifier.toUpperCase() };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

function toCountryProfileRecord(
  row: CountryProfileRow,
): PlayerWorldCountryProfileRecord {
  const metadata = isRecord(row.metadata) ? row.metadata : {};

  return {
    id: requireText(row.id),
    countryCode: requireText(row.country_code),
    countryName: requireText(row.country_name),
    capitalName: requireText(row.capital_name),
    currencyCode: requireText(row.currency_code),
    mapRegion: readOptionalText(metadata.mapRegion),
    mapColor: readOptionalText(metadata.mapColor),
  };
}

function toEconomicSnapshotRecord(
  row: CountryEconomicSnapshotRow,
): PlayerWorldEconomicSnapshotRecord {
  return {
    id: requireText(row.id),
    gameSessionId: requireText(row.game_session_id),
    countryProfileId: requireText(row.country_profile_id),
    snapshotSequence: toNonNegativeInteger(row.snapshot_sequence),
    effectiveAt: requireText(row.effective_at),
    snapshotLabel: readOptionalText(row.snapshot_label),
    difficultyPreset: requireText(row.difficulty_preset),
    realGdpIndex: toFiniteNumber(row.real_gdp_index),
    gdpGrowthRate: toFiniteNumber(row.gdp_growth_rate),
    inflationRate: toFiniteNumber(row.inflation_rate),
    unemploymentRate: toFiniteNumber(row.unemployment_rate),
    interestRate: toFiniteNumber(row.interest_rate),
    consumerConfidenceIndex: toFiniteNumber(row.consumer_confidence_index),
    businessConfidenceIndex: toFiniteNumber(row.business_confidence_index),
    costOfLivingIndex: toFiniteNumber(row.cost_of_living_index),
    regionalPriceMultiplier: toFiniteNumber(row.regional_price_multiplier),
    supplyConstraintIndex: toFiniteNumber(row.supply_constraint_index),
    importDependencyIndex: toFiniteNumber(row.import_dependency_index),
    taxRate: toFiniteNumber(row.tax_rate),
    subsidyRate: toFiniteNumber(row.subsidy_rate),
    exchangeRateIndex: toFiniteNumber(row.exchange_rate_index),
    currencyStabilityIndex: toFiniteNumber(row.currency_stability_index),
    tradeBalanceIndex: toFiniteNumber(row.trade_balance_index),
    exportStrengthIndex: toFiniteNumber(row.export_strength_index),
    marketRiskIndex: toFiniteNumber(row.market_risk_index),
    politicalStabilityIndex: toFiniteNumber(row.political_stability_index),
    infrastructureIndex: toFiniteNumber(row.infrastructure_index),
    energySecurityIndex: toFiniteNumber(row.energy_security_index),
  };
}

function toNewsRecord(row: StockMarketEventRow): PlayerWorldNewsRecord {
  return {
    id: requireText(row.id),
    gameSessionId: requireText(row.game_session_id),
    shockId: requireText(row.shock_id),
    category: requireText(row.category),
    sentiment: requireText(row.sentiment),
    source: requireText(row.source),
    scope: requireText(row.scope),
    targetKey: readOptionalText(row.target_key),
    headline: requireText(row.headline),
    explanation: requireText(row.explanation),
    magnitude: toFiniteNumber(row.magnitude),
    confidence: toFiniteNumber(row.confidence),
    volatilityImpact: toNullableNumber(row.volatility_impact),
    volumeImpact: toNullableNumber(row.volume_impact),
    createdTick: toNonNegativeInteger(row.created_tick),
    expiresTick: row.expires_tick === null || row.expires_tick === undefined
      ? null
      : toNonNegativeInteger(row.expires_tick),
    createdAt: requireText(row.created_at),
    updatedAt: requireText(row.updated_at),
  };
}

function requireText(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    throw readFailed();
  }

  return text;
}

function readOptionalText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function toFiniteNumber(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw readFailed();
  }

  return parsed;
}

function toNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : toFiniteNumber(value);
}

function toNonNegativeInteger(value: unknown): number {
  const parsed = toFiniteNumber(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw readFailed();
  }

  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapPersistenceError(
  error: QueryError,
): PlayerWorldReadPersistenceError {
  const message = error.message.toLowerCase();

  if (
    error.code === "42P01" ||
    error.code === "42703" ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  ) {
    return new PlayerWorldReadPersistenceError(
      "player_world_schema_not_applied",
      "Player world read schema is not applied.",
    );
  }

  return readFailed();
}

function readFailed(): PlayerWorldReadPersistenceError {
  return new PlayerWorldReadPersistenceError(
    "player_world_read_failed",
    "Player world data could not be loaded.",
  );
}
