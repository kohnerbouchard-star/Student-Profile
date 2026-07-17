/// <reference lib="dom" />

import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import {
  EdgeActivationError,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  invalidPlayerSessionResponse,
  readPlayerSessionTokenFromRequest,
  resolveActivePlayerSession,
} from "../../players/api/playerSessionHttpHelpers.ts";
import {
  readRequestedGameSessionId,
  rejectClientSuppliedPlayerIdentity,
  requireMatchingPlayerGameSession,
} from "../../players/api/playerRequestScope.ts";
import { STOCK_MARKET_NEWS_CATEGORIES } from "../../stocks/contracts/stockMarketNewsContracts.ts";
import {
  type PlayerWorldCountriesResponseBody,
  type PlayerWorldCountryDto,
  type PlayerWorldCountryRecord,
  type PlayerWorldCountryResponseBody,
  type PlayerWorldEconomicSnapshotDto,
  type PlayerWorldGameSessionDto,
  type PlayerWorldNewsDto,
  type PlayerWorldNewsRecord,
  type PlayerWorldNewsResponseBody,
  type PlayerWorldPlayerDto,
  PlayerWorldReadPersistenceError,
  type PlayerWorldReadRepository,
  type PlayerWorldRoute,
} from "../contracts/playerWorldReadContracts.ts";
import { SupabasePlayerWorldReadRepository } from "../infrastructure/supabasePlayerWorldReadRepository.ts";

const DEFAULT_NEWS_LIMIT = 50;
const MAX_NEWS_LIMIT = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COUNTRY_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,31}$/;

export interface PlayerWorldReadHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: typeof readSupabaseEnv;
  readonly hashSessionToken?: (sessionToken: string) => Promise<string>;
  readonly resolvePlayerSession?: typeof resolveActivePlayerSession;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerWorldReadRepository;
  readonly now?: () => string;
}

export async function handlePlayerWorldReadRequest(
  request: Request,
  route: PlayerWorldRoute,
  dependencies: PlayerWorldReadHttpHandlerDependencies,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to load player world data.",
      retryable: false,
    });
  }

  if (request.headers.has("x-stock-market-runner-secret")) {
    return jsonError(400, {
      code: "stock_runner_secret_not_allowed",
      message: "Player world reads must not send a stock market runner secret.",
      retryable: false,
    });
  }

  try {
    const envResult = (dependencies.readSupabaseEnv ?? readSupabaseEnv)();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    rejectClientSuppliedPlayerIdentity(request);
    const requestedGameSessionId = readRequestedGameSessionId(request);
    const sessionToken = readPlayerSessionTokenFromRequest(request);

    if (!sessionToken) {
      return invalidPlayerSessionResponse();
    }

    const serviceClient = dependencies.createServiceClient(envResult.value);
    const tokenHash = await (dependencies.hashSessionToken ?? sha256Hex)(
      sessionToken,
    );
    const sessionResult = await (dependencies.resolvePlayerSession ??
      resolveActivePlayerSession)(serviceClient, tokenHash);

    if (!sessionResult.ok) {
      return jsonError(sessionResult.status, sessionResult.error);
    }

    requireMatchingPlayerGameSession(
      requestedGameSessionId,
      sessionResult.session.game_session_id,
    );

    const generatedAt = readGeneratedAt(dependencies.now);
    const repository = dependencies.createRepository
      ? dependencies.createRepository(serviceClient)
      : new SupabasePlayerWorldReadRepository(serviceClient as never);
    const gameSession = toGameSessionDto(sessionResult.gameSession);
    const player = toPlayerDto(sessionResult.player);

    if (route.kind === "countries") {
      const result = await repository.readCountries({
        gameSessionId: sessionResult.session.game_session_id,
        playerId: sessionResult.session.player_id,
        effectiveAtIso: generatedAt,
      });
      assertPlayerScope(result, sessionResult.session);
      assertCountryRecordsScope(
        result.countries,
        sessionResult.session.game_session_id,
      );

      return jsonResponse<PlayerWorldCountriesResponseBody>(200, {
        ok: true,
        gameSession,
        player,
        generatedAt,
        playerCountryProfileId: result.playerCountryProfileId,
        items: result.countries.map((country) =>
          toCountryDto(country, result.playerCountryProfileId)
        ),
      });
    }

    if (route.kind === "country") {
      const countryIdentifier = normalizeCountryIdentifier(
        route.countryIdentifier,
      );
      const result = await repository.readCountry({
        gameSessionId: sessionResult.session.game_session_id,
        playerId: sessionResult.session.player_id,
        effectiveAtIso: generatedAt,
        countryIdentifier,
      });
      assertPlayerScope(result, sessionResult.session);

      if (!result.country) {
        return jsonError(404, {
          code: "player_world_country_not_found",
          message: "Country was not found.",
          retryable: false,
        });
      }

      assertCountryRecordsScope(
        [result.country],
        sessionResult.session.game_session_id,
      );

      return jsonResponse<PlayerWorldCountryResponseBody>(200, {
        ok: true,
        gameSession,
        player,
        generatedAt,
        country: toCountryDto(
          result.country,
          result.playerCountryProfileId,
        ),
      });
    }

    const newsQuery = readNewsQuery(new URL(request.url).searchParams);
    const result = await repository.readNews({
      gameSessionId: sessionResult.session.game_session_id,
      ...newsQuery,
    });
    assertNewsScope(result.gameSessionId, result.news, sessionResult.session);
    const items = result.news.map(toNewsDto);

    return jsonResponse<PlayerWorldNewsResponseBody>(200, {
      ok: true,
      gameSession,
      player,
      generatedAt,
      page: {
        limit: newsQuery.limit,
        returned: items.length,
      },
      items,
    });
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    if (error instanceof PlayerWorldReadPersistenceError) {
      return jsonError(500, {
        code: error.code,
        message: error.message,
        retryable: false,
      });
    }

    return jsonError(500, {
      code: "player_world_read_failed",
      message: "Player world data could not be loaded.",
      retryable: false,
    });
  }
}

function readNewsQuery(searchParams: URLSearchParams): {
  readonly limit: number;
  readonly category: string | null;
} {
  const limitValues = searchParams.getAll("limit");

  if (limitValues.length > 1) {
    throw invalidRequest("At most one limit query parameter is allowed.");
  }

  let limit = DEFAULT_NEWS_LIMIT;

  if (limitValues.length === 1) {
    const rawLimit = limitValues[0]?.trim() ?? "";
    const parsedLimit = Number(rawLimit);

    if (
      !rawLimit ||
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > MAX_NEWS_LIMIT
    ) {
      throw invalidRequest(
        `limit must be an integer between 1 and ${MAX_NEWS_LIMIT}.`,
      );
    }

    limit = parsedLimit;
  }

  const categoryValues = searchParams.getAll("category");

  if (categoryValues.length > 1) {
    throw invalidRequest("At most one category query parameter is allowed.");
  }

  if (categoryValues.length === 0) {
    return { limit, category: null };
  }

  const category = categoryValues[0]?.trim().toLowerCase() ?? "";

  if (!(STOCK_MARKET_NEWS_CATEGORIES as readonly string[]).includes(category)) {
    throw invalidRequest("category is not a supported world news category.");
  }

  return { limit, category };
}

function normalizeCountryIdentifier(value: string): string {
  const identifier = value.trim();

  if (!identifier || identifier.includes("/") || identifier.length > 64) {
    throw invalidRequest("countryId must be a country UUID or country code.");
  }

  if (UUID_PATTERN.test(identifier)) {
    return identifier.toLowerCase();
  }

  const countryCode = identifier.toUpperCase();

  if (!COUNTRY_CODE_PATTERN.test(countryCode)) {
    throw invalidRequest("countryId must be a country UUID or country code.");
  }

  return countryCode;
}

function readGeneratedAt(now: (() => string) | undefined): string {
  const value = (now ?? (() => new Date().toISOString()))();

  if (!Number.isFinite(Date.parse(value))) {
    throw new PlayerWorldReadPersistenceError(
      "player_world_read_failed",
      "Player world data could not be loaded.",
    );
  }

  return value;
}

function assertPlayerScope(
  result: { readonly gameSessionId: string; readonly playerId: string },
  session: { readonly game_session_id: string; readonly player_id: string },
): void {
  if (
    result.gameSessionId !== session.game_session_id ||
    result.playerId !== session.player_id
  ) {
    throw scopeViolation();
  }
}

function assertCountryRecordsScope(
  countries: readonly PlayerWorldCountryRecord[],
  gameSessionId: string,
): void {
  if (
    countries.some((country) => {
      const snapshot = country.latestEconomicSnapshot;
      return snapshot !== null &&
        (snapshot.gameSessionId !== gameSessionId ||
          snapshot.countryProfileId !== country.profile.id);
    })
  ) {
    throw scopeViolation();
  }
}

function assertNewsScope(
  resultGameSessionId: string,
  news: readonly PlayerWorldNewsRecord[],
  session: { readonly game_session_id: string },
): void {
  if (
    resultGameSessionId !== session.game_session_id ||
    news.some((item) => item.gameSessionId !== session.game_session_id)
  ) {
    throw scopeViolation();
  }
}

function scopeViolation(): EdgeActivationError {
  return new EdgeActivationError(
    "player_world_scope_violation",
    "Player world data could not be loaded.",
    500,
    false,
  );
}

function invalidRequest(message: string): EdgeActivationError {
  return new EdgeActivationError(
    "invalid_player_world_request",
    message,
    400,
    false,
  );
}

function toCountryDto(
  record: PlayerWorldCountryRecord,
  playerCountryProfileId: string | null,
): PlayerWorldCountryDto {
  return {
    id: record.profile.id,
    countryCode: record.profile.countryCode,
    countryName: record.profile.countryName,
    capitalName: record.profile.capitalName,
    currencyCode: record.profile.currencyCode,
    map: {
      region: record.profile.mapRegion,
      color: record.profile.mapColor,
    },
    isPlayerCountry: record.profile.id === playerCountryProfileId,
    economy: record.latestEconomicSnapshot
      ? toEconomicSnapshotDto(record.latestEconomicSnapshot)
      : null,
  };
}

function toEconomicSnapshotDto(
  snapshot: NonNullable<PlayerWorldCountryRecord["latestEconomicSnapshot"]>,
): PlayerWorldEconomicSnapshotDto {
  return {
    id: snapshot.id,
    sequence: snapshot.snapshotSequence,
    effectiveAt: snapshot.effectiveAt,
    label: snapshot.snapshotLabel,
    difficultyPreset: snapshot.difficultyPreset,
    realGdpIndex: snapshot.realGdpIndex,
    gdpGrowthRate: snapshot.gdpGrowthRate,
    inflationRate: snapshot.inflationRate,
    unemploymentRate: snapshot.unemploymentRate,
    interestRate: snapshot.interestRate,
    consumerConfidenceIndex: snapshot.consumerConfidenceIndex,
    businessConfidenceIndex: snapshot.businessConfidenceIndex,
    costOfLivingIndex: snapshot.costOfLivingIndex,
    regionalPriceMultiplier: snapshot.regionalPriceMultiplier,
    supplyConstraintIndex: snapshot.supplyConstraintIndex,
    importDependencyIndex: snapshot.importDependencyIndex,
    taxRate: snapshot.taxRate,
    subsidyRate: snapshot.subsidyRate,
    exchangeRateIndex: snapshot.exchangeRateIndex,
    currencyStabilityIndex: snapshot.currencyStabilityIndex,
    tradeBalanceIndex: snapshot.tradeBalanceIndex,
    exportStrengthIndex: snapshot.exportStrengthIndex,
    marketRiskIndex: snapshot.marketRiskIndex,
    politicalStabilityIndex: snapshot.politicalStabilityIndex,
    infrastructureIndex: snapshot.infrastructureIndex,
    energySecurityIndex: snapshot.energySecurityIndex,
  };
}

function toNewsDto(record: PlayerWorldNewsRecord): PlayerWorldNewsDto {
  return {
    id: record.id,
    shockId: record.shockId,
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
    tick: {
      created: record.createdTick,
      expires: record.expiresTick,
    },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toGameSessionDto(value: {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}): PlayerWorldGameSessionDto {
  return {
    id: value.id,
    name: value.name,
    status: value.status,
  };
}

function toPlayerDto(value: {
  readonly id: string;
  readonly display_name: string;
  readonly roster_label?: string | null;
  readonly status: string;
}): PlayerWorldPlayerDto {
  return {
    id: value.id,
    displayName: value.display_name,
    rosterLabel: value.roster_label ?? null,
    status: value.status,
  };
}
