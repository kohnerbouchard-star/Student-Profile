export type PlayerWorldRoute =
  | { readonly kind: "countries" }
  | { readonly kind: "country"; readonly countryIdentifier: string }
  | { readonly kind: "news" };

export interface PlayerWorldCountryReadInput {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly effectiveAtIso: string;
}

export interface PlayerWorldCountryDetailReadInput
  extends PlayerWorldCountryReadInput {
  readonly countryIdentifier: string;
}

export interface PlayerWorldNewsReadInput {
  readonly gameSessionId: string;
  readonly limit: number;
  readonly category: string | null;
}

export interface PlayerWorldCountryProfileRecord {
  readonly id: string;
  readonly countryCode: string;
  readonly countryName: string;
  readonly capitalName: string;
  readonly currencyCode: string;
  readonly mapRegion: string | null;
  readonly mapColor: string | null;
}

export interface PlayerWorldEconomicSnapshotRecord {
  readonly id: string;
  readonly gameSessionId: string;
  readonly countryProfileId: string;
  readonly snapshotSequence: number;
  readonly effectiveAt: string;
  readonly snapshotLabel: string | null;
  readonly difficultyPreset: string;
  readonly realGdpIndex: number;
  readonly gdpGrowthRate: number;
  readonly inflationRate: number;
  readonly unemploymentRate: number;
  readonly interestRate: number;
  readonly consumerConfidenceIndex: number;
  readonly businessConfidenceIndex: number;
  readonly costOfLivingIndex: number;
  readonly regionalPriceMultiplier: number;
  readonly supplyConstraintIndex: number;
  readonly importDependencyIndex: number;
  readonly taxRate: number;
  readonly subsidyRate: number;
  readonly exchangeRateIndex: number;
  readonly currencyStabilityIndex: number;
  readonly tradeBalanceIndex: number;
  readonly exportStrengthIndex: number;
  readonly marketRiskIndex: number;
  readonly politicalStabilityIndex: number;
  readonly infrastructureIndex: number;
  readonly energySecurityIndex: number;
}

export interface PlayerWorldCountryRecord {
  readonly profile: PlayerWorldCountryProfileRecord;
  readonly latestEconomicSnapshot: PlayerWorldEconomicSnapshotRecord | null;
}

export interface PlayerWorldCountryCollectionRecord {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly playerCountryProfileId: string | null;
  readonly countries: readonly PlayerWorldCountryRecord[];
}

export interface PlayerWorldCountryDetailRecord {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly playerCountryProfileId: string | null;
  readonly country: PlayerWorldCountryRecord | null;
}

export interface PlayerWorldNewsRecord {
  readonly id: string;
  readonly gameSessionId: string;
  readonly shockId: string;
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
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PlayerWorldNewsCollectionRecord {
  readonly gameSessionId: string;
  readonly news: readonly PlayerWorldNewsRecord[];
}

export interface PlayerWorldEconomicSnapshotDto {
  readonly id: string;
  readonly sequence: number;
  readonly effectiveAt: string;
  readonly label: string | null;
  readonly difficultyPreset: string;
  readonly realGdpIndex: number;
  readonly gdpGrowthRate: number;
  readonly inflationRate: number;
  readonly unemploymentRate: number;
  readonly interestRate: number;
  readonly consumerConfidenceIndex: number;
  readonly businessConfidenceIndex: number;
  readonly costOfLivingIndex: number;
  readonly regionalPriceMultiplier: number;
  readonly supplyConstraintIndex: number;
  readonly importDependencyIndex: number;
  readonly taxRate: number;
  readonly subsidyRate: number;
  readonly exchangeRateIndex: number;
  readonly currencyStabilityIndex: number;
  readonly tradeBalanceIndex: number;
  readonly exportStrengthIndex: number;
  readonly marketRiskIndex: number;
  readonly politicalStabilityIndex: number;
  readonly infrastructureIndex: number;
  readonly energySecurityIndex: number;
}

export interface PlayerWorldCountryDto {
  readonly id: string;
  readonly countryCode: string;
  readonly countryName: string;
  readonly capitalName: string;
  readonly currencyCode: string;
  readonly map: {
    readonly region: string | null;
    readonly color: string | null;
  };
  readonly isPlayerCountry: boolean;
  readonly economy: PlayerWorldEconomicSnapshotDto | null;
}

export interface PlayerWorldNewsDto {
  readonly id: string;
  readonly shockId: string;
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
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PlayerWorldCountriesResponseBody {
  readonly ok: true;
  readonly gameSession: PlayerWorldGameSessionDto;
  readonly player: PlayerWorldPlayerDto;
  readonly generatedAt: string;
  readonly playerCountryProfileId: string | null;
  readonly items: readonly PlayerWorldCountryDto[];
}

export interface PlayerWorldCountryResponseBody {
  readonly ok: true;
  readonly gameSession: PlayerWorldGameSessionDto;
  readonly player: PlayerWorldPlayerDto;
  readonly generatedAt: string;
  readonly country: PlayerWorldCountryDto;
}

export interface PlayerWorldNewsResponseBody {
  readonly ok: true;
  readonly gameSession: PlayerWorldGameSessionDto;
  readonly player: PlayerWorldPlayerDto;
  readonly generatedAt: string;
  readonly page: {
    readonly limit: number;
    readonly returned: number;
  };
  readonly items: readonly PlayerWorldNewsDto[];
}

export interface PlayerWorldGameSessionDto {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}

export interface PlayerWorldPlayerDto {
  readonly id: string;
  readonly displayName: string;
  readonly rosterLabel: string | null;
  readonly status: string;
}

export interface PlayerWorldReadRepository {
  readCountries(
    input: PlayerWorldCountryReadInput,
  ): Promise<PlayerWorldCountryCollectionRecord>;
  readCountry(
    input: PlayerWorldCountryDetailReadInput,
  ): Promise<PlayerWorldCountryDetailRecord>;
  readNews(
    input: PlayerWorldNewsReadInput,
  ): Promise<PlayerWorldNewsCollectionRecord>;
}

export class PlayerWorldReadPersistenceError extends Error {
  readonly code: "player_world_schema_not_applied" | "player_world_read_failed";

  constructor(
    code: PlayerWorldReadPersistenceError["code"],
    message: string,
  ) {
    super(message);
    this.name = "PlayerWorldReadPersistenceError";
    this.code = code;
  }
}
