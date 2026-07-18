export type PlayerWorldRoute =
  | { readonly kind: "countries" }
  | { readonly kind: "country"; readonly countryIdentifier: string }
  | { readonly kind: "news" };

export interface PlayerWorldNewsCursor {
  readonly createdTick: number;
  readonly publicId: string;
}

export interface PlayerWorldNewsQuery {
  readonly limit: number;
  readonly category: string | null;
  readonly cursor: PlayerWorldNewsCursor | null;
}

export interface PlayerWorldParsedRequest {
  readonly kind: PlayerWorldRoute["kind"];
  readonly countryCode?: string;
  readonly news?: PlayerWorldNewsQuery;
}

export interface PlayerWorldReadScope {
  readonly gameId: string;
  readonly playerUuid: string;
  readonly effectiveAt: string;
}

export interface PlayerWorldEconomicSnapshotRecord {
  readonly gameId: string;
  readonly countryProfileUuid: string;
  readonly sequence: number;
  readonly effectiveAt: string;
  readonly gdpGrowthRate: number;
  readonly inflationRate: number;
  readonly unemploymentRate: number;
  readonly interestRate: number;
  readonly consumerConfidenceIndex: number;
  readonly businessConfidenceIndex: number;
  readonly exchangeRateIndex: number;
  readonly marketRiskIndex: number;
  readonly politicalStabilityIndex: number;
}

export interface PlayerWorldCountryRecord {
  readonly countryProfileUuid: string;
  readonly countryCode: string;
  readonly countryName: string;
  readonly capitalName: string;
  readonly currencyCode: string;
  readonly status: "active";
  readonly flagUrl: string | null;
  readonly mapRegion: string | null;
  readonly mapColor: string | null;
  readonly snapshot: PlayerWorldEconomicSnapshotRecord;
}

export interface PlayerWorldCountryCollectionRecord {
  readonly gameId: string;
  readonly playerUuid: string;
  readonly playerCountryProfileUuid: string | null;
  readonly countries: readonly PlayerWorldCountryRecord[];
}

export interface PlayerWorldCountryDetailRecord {
  readonly gameId: string;
  readonly playerUuid: string;
  readonly playerCountryProfileUuid: string | null;
  readonly country: PlayerWorldCountryRecord | null;
}

export interface PlayerWorldNewsRecord {
  readonly gameId: string;
  readonly publicId: string;
  readonly category: string;
  readonly sentiment: string;
  readonly source: string;
  readonly scope: string;
  readonly targetKey: string | null;
  readonly headline: string;
  readonly explanation: string;
  readonly magnitude: number;
  readonly confidence: number;
  readonly volatilityImpact: number | null;
  readonly volumeImpact: number | null;
  readonly createdTick: number;
  readonly expiresTick: number | null;
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly imageUrl: string | null;
}

export interface PlayerWorldNewsCollectionRecord {
  readonly gameId: string;
  readonly news: readonly PlayerWorldNewsRecord[];
}

export interface PlayerWorldReadRepository {
  readCountries(
    input: PlayerWorldReadScope,
  ): Promise<PlayerWorldCountryCollectionRecord>;
  readCountry(
    input: PlayerWorldReadScope & { readonly countryCode: string },
  ): Promise<PlayerWorldCountryDetailRecord>;
  readNews(
    input: {
      readonly gameId: string;
      readonly limit: number;
      readonly category: string | null;
      readonly cursor: PlayerWorldNewsCursor | null;
    },
  ): Promise<PlayerWorldNewsCollectionRecord>;
}

export interface PlayerWorldEconomicSummaryDto {
  readonly sequence: number;
  readonly effectiveAt: string;
  readonly gdpGrowthRate: number;
  readonly inflationRate: number;
  readonly unemploymentRate: number;
  readonly interestRate: number;
  readonly consumerConfidenceIndex: number;
  readonly businessConfidenceIndex: number;
  readonly exchangeRateIndex: number;
  readonly marketRiskIndex: number;
  readonly politicalStabilityIndex: number;
}

export interface PlayerWorldCountryDto {
  readonly id: string;
  readonly countryCode: string;
  readonly countryName: string;
  readonly capitalName: string;
  readonly currencyCode: string;
  readonly flagUrl: string | null;
  readonly map: {
    readonly region: string | null;
    readonly color: string | null;
  };
  readonly availability: "available";
  readonly isPlayerCountry: boolean;
  readonly economy: PlayerWorldEconomicSummaryDto;
}

export interface PlayerWorldNewsDto {
  readonly id: string;
  readonly category: string;
  readonly sentiment: string;
  readonly source: string;
  readonly scope: string;
  readonly targetKey: string | null;
  readonly headline: string;
  readonly explanation: string;
  readonly impact: {
    readonly magnitude: number;
    readonly confidence: number;
    readonly volatility: number | null;
    readonly volume: number | null;
  };
  readonly tick: {
    readonly created: number;
    readonly expires: number | null;
  };
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly imageUrl: string | null;
}

export interface PlayerWorldCountriesResponseBody {
  readonly ok: true;
  readonly generatedAt: string;
  readonly availability: "available";
  readonly items: readonly PlayerWorldCountryDto[];
}

export interface PlayerWorldCountryResponseBody {
  readonly ok: true;
  readonly generatedAt: string;
  readonly availability: "available";
  readonly country: PlayerWorldCountryDto;
}

export interface PlayerWorldNewsResponseBody {
  readonly ok: true;
  readonly generatedAt: string;
  readonly availability: "available";
  readonly page: {
    readonly limit: number;
    readonly returned: number;
    readonly nextCursor: string | null;
  };
  readonly items: readonly PlayerWorldNewsDto[];
}

export class PlayerWorldReadError extends Error {
  constructor(
    readonly code:
      | "invalid_player_world_request"
      | "player_world_country_not_found"
      | "player_world_scope_violation"
      | "player_world_service_unavailable",
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PlayerWorldReadError";
  }
}

export class PlayerWorldReadPersistenceError extends Error {
  constructor(
    readonly code: "player_world_schema_not_applied" | "player_world_read_failed",
    message: string,
  ) {
    super(message);
    this.name = "PlayerWorldReadPersistenceError";
  }
}
