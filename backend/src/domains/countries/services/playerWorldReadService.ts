import {
  type PlayerWorldCountriesResponseBody,
  type PlayerWorldCountryDto,
  type PlayerWorldCountryResponseBody,
  type PlayerWorldNewsDto,
  type PlayerWorldNewsQuery,
  type PlayerWorldNewsCursor,
  type PlayerWorldReadRepository,
  type PlayerWorldReadScope,
  PlayerWorldReadError,
  PlayerWorldReadPersistenceError,
} from "../contracts/playerWorldReadContracts.ts";

export interface PlayerWorldNewsServiceResult {
  readonly generatedAt: string;
  readonly items: readonly PlayerWorldNewsDto[];
  readonly limit: number;
  readonly nextCursor: PlayerWorldNewsCursor | null;
}

export class PlayerWorldReadService {
  constructor(private readonly repository: PlayerWorldReadRepository) {}

  async listCountries(scope: PlayerWorldReadScope): Promise<PlayerWorldCountriesResponseBody> {
    try {
      const result = await this.repository.readCountries(scope);
      assertOwnScope(result.gameId, result.playerUuid, scope);
      const items = [...result.countries]
        .sort((left, right) => left.countryName.localeCompare(right.countryName) || left.countryCode.localeCompare(right.countryCode))
        .map((country) => toCountryDto(country, result.playerCountryProfileUuid, scope.gameId));

      return {
        ok: true,
        generatedAt: scope.effectiveAt,
        availability: "available",
        items,
      };
    } catch (error) {
      throw mapReadError(error);
    }
  }

  async readCountry(
    scope: PlayerWorldReadScope,
    countryCode: string,
  ): Promise<PlayerWorldCountryResponseBody> {
    try {
      const result = await this.repository.readCountry({ ...scope, countryCode });
      assertOwnScope(result.gameId, result.playerUuid, scope);
      if (!result.country) {
        throw new PlayerWorldReadError(
          "player_world_country_not_found",
          "Country is not available in the authenticated game.",
          404,
          false,
        );
      }

      return {
        ok: true,
        generatedAt: scope.effectiveAt,
        availability: "available",
        country: toCountryDto(result.country, result.playerCountryProfileUuid, scope.gameId),
      };
    } catch (error) {
      throw mapReadError(error);
    }
  }

  async listNews(
    scope: PlayerWorldReadScope,
    query: PlayerWorldNewsQuery,
  ): Promise<PlayerWorldNewsServiceResult> {
    try {
      const result = await this.repository.readNews({
        gameId: scope.gameId,
        limit: query.limit + 1,
        category: query.category,
        cursor: query.cursor,
      });
      if (result.gameId !== scope.gameId || result.news.some((item) => item.gameId !== scope.gameId)) {
        throw scopeViolation();
      }

      const ordered = [...result.news].sort((left, right) =>
        right.createdTick - left.createdTick || right.publicId.localeCompare(left.publicId)
      );
      const page = ordered.slice(0, query.limit);
      const hasMore = ordered.length > query.limit;
      const last = page.at(-1);

      return {
        generatedAt: scope.effectiveAt,
        items: page.map(toNewsDto),
        limit: query.limit,
        nextCursor: hasMore && last
          ? { createdTick: last.createdTick, publicId: last.publicId }
          : null,
      };
    } catch (error) {
      throw mapReadError(error);
    }
  }
}

function assertOwnScope(
  gameId: string,
  playerUuid: string,
  scope: PlayerWorldReadScope,
): void {
  if (gameId !== scope.gameId || playerUuid !== scope.playerUuid) throw scopeViolation();
}

function toCountryDto(
  country: Parameters<typeof assertCountryScope>[0],
  playerCountryProfileUuid: string | null,
  gameId: string,
): PlayerWorldCountryDto {
  assertCountryScope(country, gameId);
  return {
    id: country.countryCode,
    countryCode: country.countryCode,
    countryName: country.countryName,
    capitalName: country.capitalName,
    currencyCode: country.currencyCode,
    flagUrl: country.flagUrl,
    map: { region: country.mapRegion, color: country.mapColor },
    availability: "available",
    isPlayerCountry: country.countryProfileUuid === playerCountryProfileUuid,
    economy: {
      sequence: country.snapshot.sequence,
      effectiveAt: country.snapshot.effectiveAt,
      gdpGrowthRate: country.snapshot.gdpGrowthRate,
      inflationRate: country.snapshot.inflationRate,
      unemploymentRate: country.snapshot.unemploymentRate,
      interestRate: country.snapshot.interestRate,
      consumerConfidenceIndex: country.snapshot.consumerConfidenceIndex,
      businessConfidenceIndex: country.snapshot.businessConfidenceIndex,
      exchangeRateIndex: country.snapshot.exchangeRateIndex,
      marketRiskIndex: country.snapshot.marketRiskIndex,
      politicalStabilityIndex: country.snapshot.politicalStabilityIndex,
    },
  };
}

function assertCountryScope(
  country: import("../contracts/playerWorldReadContracts.ts").PlayerWorldCountryRecord,
  gameId: string,
): void {
  if (
    country.status !== "active" ||
    country.snapshot.gameId !== gameId ||
    country.snapshot.countryProfileUuid !== country.countryProfileUuid
  ) {
    throw scopeViolation();
  }
}

function toNewsDto(record: import("../contracts/playerWorldReadContracts.ts").PlayerWorldNewsRecord): PlayerWorldNewsDto {
  return {
    id: record.publicId,
    category: record.category,
    sentiment: record.sentiment,
    source: record.source,
    scope: record.scope,
    targetKey: record.targetKey,
    headline: record.headline,
    explanation: record.explanation,
    impact: {
      magnitude: record.magnitude,
      confidence: record.confidence,
      volatility: record.volatilityImpact,
      volume: record.volumeImpact,
    },
    tick: { created: record.createdTick, expires: record.expiresTick },
    publishedAt: record.publishedAt,
    updatedAt: record.updatedAt,
    imageUrl: record.imageUrl,
  };
}

function mapReadError(error: unknown): PlayerWorldReadError {
  if (error instanceof PlayerWorldReadError) return error;
  if (error instanceof PlayerWorldReadPersistenceError) {
    return new PlayerWorldReadError(
      "player_world_service_unavailable",
      "Player world data is temporarily unavailable.",
      503,
      true,
    );
  }
  throw error;
}

function scopeViolation(): PlayerWorldReadError {
  return new PlayerWorldReadError(
    "player_world_scope_violation",
    "Player world data could not be loaded.",
    500,
    false,
  );
}
