import {
  type PlayerWorldCountryCollectionRecord,
  type PlayerWorldCountryDetailRecord,
  type PlayerWorldCountryRecord,
  type PlayerWorldEconomicSnapshotRecord,
  type PlayerWorldNewsCollectionRecord,
  type PlayerWorldNewsCursor,
  type PlayerWorldNewsRecord,
  type PlayerWorldReadRepository,
  type PlayerWorldReadScope,
  PlayerWorldReadPersistenceError,
} from "../contracts/playerWorldReadContracts.ts";

interface QueryError {
  readonly message: string;
  readonly code?: string;
}

interface QueryResponse<T> {
  readonly data: T | null;
  readonly error: QueryError | null;
}

interface FilterBuilder extends PromiseLike<QueryResponse<readonly Record<string, unknown>[]>> {
  eq(column: string, value: unknown): FilterBuilder;
  in(column: string, values: readonly unknown[]): FilterBuilder;
  lte(column: string, value: unknown): FilterBuilder;
  or(filters: string): FilterBuilder;
  order(column: string, options?: { readonly ascending?: boolean }): FilterBuilder;
  limit(count: number): FilterBuilder;
  maybeSingle(): PromiseLike<QueryResponse<Record<string, unknown>>>;
}

interface QueryBuilder {
  select(columns: string): FilterBuilder;
}

interface PlayerWorldReadClient {
  from(tableName: string): QueryBuilder;
}

const MAX_COUNTRIES = 50;
const MAX_SNAPSHOTS = 500;

const PROFILE_SELECT = [
  "id",
  "country_code",
  "country_name",
  "capital_name",
  "currency_code",
  "status",
  "metadata",
].join(",");

const SNAPSHOT_SELECT = [
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
  "exchange_rate_index",
  "market_risk_index",
  "political_stability_index",
].join(",");

const ASSIGNMENT_SELECT = "game_session_id,player_id,country_profile_id,status,assigned_at";

const NEWS_SELECT = [
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
  "metadata",
].join(",");

export class SupabasePlayerWorldReadRepository implements PlayerWorldReadRepository {
  constructor(private readonly client: PlayerWorldReadClient) {}

  async readCountries(scope: PlayerWorldReadScope): Promise<PlayerWorldCountryCollectionRecord> {
    const snapshots = await this.readLatestGameSnapshots(scope.gameId, scope.effectiveAt);
    const profileIds = [...snapshots.keys()];
    const [profiles, playerCountryProfileUuid] = await Promise.all([
      this.readVisibleProfiles(profileIds),
      this.readPlayerCountryProfileUuid(scope.gameId, scope.playerUuid),
    ]);

    const countries = profiles.flatMap((profile) => {
      const snapshot = snapshots.get(profile.countryProfileUuid);
      return snapshot ? [{ ...profile, snapshot }] : [];
    });

    return {
      gameId: scope.gameId,
      playerUuid: scope.playerUuid,
      playerCountryProfileUuid,
      countries,
    };
  }

  async readCountry(
    input: PlayerWorldReadScope & { readonly countryCode: string },
  ): Promise<PlayerWorldCountryDetailRecord> {
    const [profile, playerCountryProfileUuid] = await Promise.all([
      this.readVisibleProfile(input.countryCode),
      this.readPlayerCountryProfileUuid(input.gameId, input.playerUuid),
    ]);

    if (!profile) {
      return {
        gameId: input.gameId,
        playerUuid: input.playerUuid,
        playerCountryProfileUuid,
        country: null,
      };
    }

    const snapshot = await this.readLatestSnapshot(
      input.gameId,
      profile.countryProfileUuid,
      input.effectiveAt,
    );

    return {
      gameId: input.gameId,
      playerUuid: input.playerUuid,
      playerCountryProfileUuid,
      country: snapshot ? { ...profile, snapshot } : null,
    };
  }

  async readNews(input: {
    readonly gameId: string;
    readonly limit: number;
    readonly category: string | null;
    readonly cursor: PlayerWorldNewsCursor | null;
  }): Promise<PlayerWorldNewsCollectionRecord> {
    let query = this.client
      .from("stock_market_events")
      .select(NEWS_SELECT)
      .eq("game_session_id", input.gameId)
      .eq("visibility", "public")
      .eq("is_active", true);

    if (input.category) query = query.eq("category", input.category);
    if (input.cursor) {
      query = query.or(
        `created_tick.lt.${input.cursor.createdTick},and(created_tick.eq.${input.cursor.createdTick},shock_id.lt.${input.cursor.publicId})`,
      );
    }

    const response = await query
      .order("created_tick", { ascending: false })
      .order("shock_id", { ascending: false })
      .limit(input.limit);
    if (response.error) throw mapPersistenceError(response.error);

    return {
      gameId: input.gameId,
      news: ((response.data ?? []) as readonly Record<string, unknown>[]).map(toNewsRecord),
    };
  }

  private async readLatestGameSnapshots(
    gameId: string,
    effectiveAt: string,
  ): Promise<Map<string, PlayerWorldEconomicSnapshotRecord>> {
    const response = await this.client
      .from("country_economic_snapshots")
      .select(SNAPSHOT_SELECT)
      .eq("game_session_id", gameId)
      .lte("effective_at", effectiveAt)
      .order("country_profile_id", { ascending: true })
      .order("effective_at", { ascending: false })
      .order("snapshot_sequence", { ascending: false })
      .limit(MAX_SNAPSHOTS);
    if (response.error) throw mapPersistenceError(response.error);

    const latest = new Map<string, PlayerWorldEconomicSnapshotRecord>();
    for (const row of response.data ?? []) {
      const snapshot = toSnapshotRecord(row);
      if (snapshot.gameId !== gameId) throw readFailed();
      if (!latest.has(snapshot.countryProfileUuid)) {
        latest.set(snapshot.countryProfileUuid, snapshot);
      }
    }
    if (latest.size > MAX_COUNTRIES) throw readFailed();
    return latest;
  }

  private async readLatestSnapshot(
    gameId: string,
    countryProfileUuid: string,
    effectiveAt: string,
  ): Promise<PlayerWorldEconomicSnapshotRecord | null> {
    const response = await this.client
      .from("country_economic_snapshots")
      .select(SNAPSHOT_SELECT)
      .eq("game_session_id", gameId)
      .eq("country_profile_id", countryProfileUuid)
      .lte("effective_at", effectiveAt)
      .order("effective_at", { ascending: false })
      .order("snapshot_sequence", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (response.error) throw mapPersistenceError(response.error);
    if (!response.data) return null;

    const snapshot = toSnapshotRecord(response.data);
    if (snapshot.gameId !== gameId || snapshot.countryProfileUuid !== countryProfileUuid) {
      throw readFailed();
    }
    return snapshot;
  }

  private async readVisibleProfiles(
    profileIds: readonly string[],
  ): Promise<readonly Omit<PlayerWorldCountryRecord, "snapshot">[]> {
    if (profileIds.length === 0) return [];
    const response = await this.client
      .from("country_profiles")
      .select(PROFILE_SELECT)
      .eq("status", "active")
      .in("id", profileIds)
      .order("country_name", { ascending: true })
      .limit(MAX_COUNTRIES + 1);
    if (response.error) throw mapPersistenceError(response.error);
    const rows = response.data ?? [];
    if (rows.length > MAX_COUNTRIES) throw readFailed();
    return rows.map(toCountryProfileRecord);
  }

  private async readVisibleProfile(
    countryCode: string,
  ): Promise<Omit<PlayerWorldCountryRecord, "snapshot"> | null> {
    const response = await this.client
      .from("country_profiles")
      .select(PROFILE_SELECT)
      .eq("status", "active")
      .eq("country_code", countryCode)
      .limit(1)
      .maybeSingle();
    if (response.error) throw mapPersistenceError(response.error);
    return response.data ? toCountryProfileRecord(response.data) : null;
  }

  private async readPlayerCountryProfileUuid(
    gameId: string,
    playerUuid: string,
  ): Promise<string | null> {
    const response = await this.client
      .from("player_country_assignments")
      .select(ASSIGNMENT_SELECT)
      .eq("game_session_id", gameId)
      .eq("player_id", playerUuid)
      .eq("status", "active")
      .order("assigned_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (response.error) throw mapPersistenceError(response.error);
    if (!response.data) return null;

    if (
      requireText(response.data.game_session_id) !== gameId ||
      requireText(response.data.player_id) !== playerUuid
    ) {
      throw readFailed();
    }
    return requireText(response.data.country_profile_id);
  }
}

function toCountryProfileRecord(
  row: Record<string, unknown>,
): Omit<PlayerWorldCountryRecord, "snapshot"> {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  return {
    countryProfileUuid: requireUuid(row.id),
    countryCode: requireCountryCode(row.country_code),
    countryName: requireText(row.country_name),
    capitalName: requireText(row.capital_name),
    currencyCode: requireCurrencyCode(row.currency_code),
    status: "active",
    flagUrl: safeMediaUrl(metadata.flagUrl ?? metadata.flag_url),
    mapRegion: optionalText(metadata.mapRegion ?? metadata.map_region),
    mapColor: safeColor(metadata.mapColor ?? metadata.map_color),
  };
}

function toSnapshotRecord(row: Record<string, unknown>): PlayerWorldEconomicSnapshotRecord {
  return {
    gameId: requireUuid(row.game_session_id),
    countryProfileUuid: requireUuid(row.country_profile_id),
    sequence: requireNonNegativeInteger(row.snapshot_sequence),
    effectiveAt: requireTimestamp(row.effective_at),
    gdpGrowthRate: requireFiniteNumber(row.gdp_growth_rate),
    inflationRate: requireFiniteNumber(row.inflation_rate),
    unemploymentRate: requireFiniteNumber(row.unemployment_rate),
    interestRate: requireFiniteNumber(row.interest_rate),
    consumerConfidenceIndex: requireFiniteNumber(row.consumer_confidence_index),
    businessConfidenceIndex: requireFiniteNumber(row.business_confidence_index),
    exchangeRateIndex: requireFiniteNumber(row.exchange_rate_index),
    marketRiskIndex: requireFiniteNumber(row.market_risk_index),
    politicalStabilityIndex: requireFiniteNumber(row.political_stability_index),
  };
}

function toNewsRecord(row: Record<string, unknown>): PlayerWorldNewsRecord {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  return {
    gameId: requireUuid(row.game_session_id),
    publicId: requirePublicId(row.shock_id),
    category: requireText(row.category),
    sentiment: requireText(row.sentiment),
    source: requireText(row.source),
    scope: requireText(row.scope),
    targetKey: optionalText(row.target_key),
    headline: requireText(row.headline),
    explanation: requireText(row.explanation),
    magnitude: requireFiniteNumber(row.magnitude),
    confidence: requireFiniteNumber(row.confidence),
    volatilityImpact: optionalFiniteNumber(row.volatility_impact),
    volumeImpact: optionalFiniteNumber(row.volume_impact),
    createdTick: requireNonNegativeInteger(row.created_tick),
    expiresTick: optionalNonNegativeInteger(row.expires_tick),
    publishedAt: requireTimestamp(row.created_at),
    updatedAt: requireTimestamp(row.updated_at),
    imageUrl: safeMediaUrl(metadata.imageUrl ?? metadata.image_url),
  };
}

function mapPersistenceError(error: QueryError): PlayerWorldReadPersistenceError {
  return new PlayerWorldReadPersistenceError(
    error.code === "42P01" ? "player_world_schema_not_applied" : "player_world_read_failed",
    "Player world data could not be read.",
  );
}

function readFailed(): PlayerWorldReadPersistenceError {
  return new PlayerWorldReadPersistenceError(
    "player_world_read_failed",
    "Player world data could not be read.",
  );
}

function requireText(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw readFailed();
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requireUuid(value: unknown): string {
  const text = requireText(value).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)) {
    throw readFailed();
  }
  return text;
}

function requireCountryCode(value: unknown): string {
  const text = requireText(value).toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{2,31}$/.test(text)) throw readFailed();
  return text;
}

function requireCurrencyCode(value: unknown): string {
  const text = requireText(value).toUpperCase();
  if (!/^[A-Z]{3,8}$/.test(text)) throw readFailed();
  return text;
}

function requirePublicId(value: unknown): string {
  const text = requireText(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(text)) throw readFailed();
  return text;
}

function requireTimestamp(value: unknown): string {
  const text = requireText(value);
  if (!Number.isFinite(Date.parse(text))) throw readFailed();
  return text;
}

function requireFiniteNumber(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw readFailed();
  return number;
}

function optionalFiniteNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : requireFiniteNumber(value);
}

function requireNonNegativeInteger(value: unknown): number {
  const number = requireFiniteNumber(value);
  if (!Number.isSafeInteger(number) || number < 0) throw readFailed();
  return number;
}

function optionalNonNegativeInteger(value: unknown): number | null {
  return value === null || value === undefined ? null : requireNonNegativeInteger(value);
}

function safeMediaUrl(value: unknown): string | null {
  const text = optionalText(value);
  if (!text) return null;
  if (text.startsWith("/")) return text.slice(0, 500);
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString().slice(0, 500) : null;
  } catch {
    return null;
  }
}

function safeColor(value: unknown): string | null {
  const text = optionalText(value);
  return text && /^#[0-9a-f]{6}$/i.test(text) ? text.toUpperCase() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
