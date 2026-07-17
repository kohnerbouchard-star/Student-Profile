/// <reference lib="dom" />

import {
  EdgeActivationError,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
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
  type StockMarketPlayerAssetDetailSuccessBody,
  type StockMarketPlayerAssetDto,
  type StockMarketPlayerAssetListSuccessBody,
  StockMarketPlayerAssetReadError,
  type StockMarketPlayerAssetReadRepository,
} from "../contracts/stockMarketPlayerAssetReadContracts.ts";
import { StockMarketReadError } from "../contracts/stockMarketReadContracts.ts";
import {
  StockMarketWatchlistError,
  type StockMarketWatchlistRepository,
} from "../contracts/stockMarketWatchlistContracts.ts";
import {
  SupabaseStockMarketReadRepository,
} from "../infrastructure/supabaseStockMarketReadRepository.ts";
import {
  SupabaseStockMarketWatchlistRepository,
} from "../infrastructure/supabaseStockMarketWatchlistRepository.ts";
import type {
  PlayerStockMarketAssetRoute,
} from "./playerStockMarketAssetRoutePaths.ts";

const DEFAULT_ASSET_LIST_LIMIT = 50;
const MAX_ASSET_LIST_LIMIT = 100;
const MAX_ASSET_LIST_OFFSET = 10_000;
const DEFAULT_ASSET_HISTORY_LIMIT = 200;
const MAX_ASSET_HISTORY_LIMIT = 500;

interface PlayerStockMarketAssetHttpDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: () =>
    | { readonly ok: true; readonly value: SupabaseEnv }
    | { readonly ok: false; readonly missing: readonly string[] };
  readonly hashSessionToken?: (sessionToken: string) => Promise<string>;
  readonly resolvePlayerSession?: (
    serviceClient: EdgeSupabaseClient,
    sessionTokenHash: string,
  ) => ReturnType<typeof resolveActivePlayerSession>;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => StockMarketPlayerAssetReadRepository;
  readonly createWatchlistRepository?: (
    client: EdgeSupabaseClient,
  ) => StockMarketWatchlistRepository;
}

export async function handlePlayerStockMarketAssetRequest(
  request: Request,
  route: PlayerStockMarketAssetRoute,
  dependencies: PlayerStockMarketAssetHttpDependencies,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to read player-visible stock market assets.",
      retryable: false,
    });
  }

  if (route.kind === "malformed") {
    return invalidRequestResponse(
      "Stock asset detail paths require exactly one valid UUID assetId.",
    );
  }

  if (request.headers.has("x-stock-market-runner-secret")) {
    return jsonError(400, {
      code: "stock_runner_secret_not_allowed",
      message:
        "Player market reads must not send the stock market runner secret.",
      retryable: false,
    });
  }

  try {
    const url = new URL(request.url);
    rejectClientSuppliedIdentity(url.searchParams, request.headers);
    const listQuery = route.kind === "assets"
      ? readAssetListQuery(url.searchParams)
      : null;
    const detailQuery = route.kind === "asset"
      ? readAssetDetailQuery(url.searchParams)
      : null;
    const envResult = (dependencies.readSupabaseEnv ?? readSupabaseEnv)();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const sessionToken = readPlayerSessionTokenFromRequest(request);

    if (!sessionToken) {
      return invalidPlayerSessionResponse();
    }

    const serviceClient = dependencies.createServiceClient(envResult.value);
    const sessionTokenHash = await (dependencies.hashSessionToken ?? sha256Hex)(
      sessionToken,
    );
    const sessionResult = await (dependencies.resolvePlayerSession ??
      resolveActivePlayerSession)(serviceClient, sessionTokenHash);

    if (!sessionResult.ok) {
      return jsonError(sessionResult.status, sessionResult.error);
    }

    const repository = dependencies.createRepository
      ? dependencies.createRepository(serviceClient)
      : new SupabaseStockMarketReadRepository(serviceClient as never);
    const watchlistRepository = dependencies.createWatchlistRepository
      ? dependencies.createWatchlistRepository(serviceClient)
      : new SupabaseStockMarketWatchlistRepository(serviceClient as never);
    const gameSessionId = sessionResult.session.game_session_id;
    const playerId = sessionResult.session.player_id;

    if (route.kind === "assets") {
      if (!listQuery) {
        throw invalidRequest("Asset list pagination could not be resolved.");
      }

      const result = await repository.listPlayerAssets({
        gameSessionId,
        limit: listQuery.limit,
        offset: listQuery.offset,
      });
      const watchlistedAssetIds = await watchlistRepository
        .listWatchlistedAssetIds({
          gameSessionId,
          playerId,
          assetIds: result.assets.map((asset) => asset.assetId),
        });

      return playerMarketJsonResponse<StockMarketPlayerAssetListSuccessBody>({
        ok: true,
        action: "read_assets",
        ...result,
        assets: result.assets.map((asset) =>
          toPlayerAssetDto(asset, watchlistedAssetIds.has(asset.assetId))
        ),
      });
    }

    if (!detailQuery) {
      throw invalidRequest("Asset detail history limit could not be resolved.");
    }

    const result = await repository.readPlayerAsset({
      gameSessionId,
      assetId: route.assetId,
      historyLimit: detailQuery.historyLimit,
    });
    const watchlistedAssetIds = await watchlistRepository
      .listWatchlistedAssetIds({
        gameSessionId,
        playerId,
        assetIds: [result.asset.assetId],
      });

    return playerMarketJsonResponse<StockMarketPlayerAssetDetailSuccessBody>({
      ok: true,
      action: "read_asset",
      ...result,
      asset: toPlayerAssetDto(
        result.asset,
        watchlistedAssetIds.has(result.asset.assetId),
      ),
      historyLimit: detailQuery.historyLimit,
      historyReturned: result.history.length,
    });
  } catch (error) {
    if (error instanceof StockMarketWatchlistError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: false,
      });
    }

    if (error instanceof StockMarketPlayerAssetReadError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: false,
      });
    }

    if (error instanceof StockMarketReadError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: false,
      });
    }

    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    return jsonError(500, {
      code: "player_stock_asset_read_failed",
      message: "Player-visible stock market assets could not be loaded.",
      retryable: false,
    });
  }
}

function toPlayerAssetDto(
  asset: Omit<StockMarketPlayerAssetDto, "isWatchlisted">,
  isWatchlisted: boolean,
): StockMarketPlayerAssetDto {
  return {
    ...asset,
    isWatchlisted,
  };
}

function rejectClientSuppliedIdentity(
  searchParams: URLSearchParams,
  headers: Headers,
): void {
  const forbiddenQueryFields = [
    "gameSessionId",
    "gameSessionIds",
    "playerId",
    "playerIds",
    "playerSessionId",
    "playerSessionIds",
  ];

  if (
    forbiddenQueryFields.some((fieldName) => searchParams.has(fieldName)) ||
    headers.has("x-econovaria-game-id") ||
    headers.has("x-econovaria-game-session-id") ||
    headers.has("x-player-id") ||
    headers.has("x-player-session-id") ||
    headers.has("x-player-session")
  ) {
    throw invalidRequest(
      "Player market scope is derived from x-player-session-token and must not be supplied by the client.",
    );
  }
}

function readAssetListQuery(searchParams: URLSearchParams): {
  readonly limit: number;
  readonly offset: number;
} {
  rejectUnexpectedQueryParameters(searchParams, ["limit", "offset"]);

  return {
    limit: readBoundedIntegerQuery(searchParams, "limit", {
      defaultValue: DEFAULT_ASSET_LIST_LIMIT,
      minimum: 1,
      maximum: MAX_ASSET_LIST_LIMIT,
    }),
    offset: readBoundedIntegerQuery(searchParams, "offset", {
      defaultValue: 0,
      minimum: 0,
      maximum: MAX_ASSET_LIST_OFFSET,
    }),
  };
}

function readAssetDetailQuery(searchParams: URLSearchParams): {
  readonly historyLimit: number;
} {
  rejectUnexpectedQueryParameters(searchParams, ["historyLimit"]);

  return {
    historyLimit: readBoundedIntegerQuery(searchParams, "historyLimit", {
      defaultValue: DEFAULT_ASSET_HISTORY_LIMIT,
      minimum: 1,
      maximum: MAX_ASSET_HISTORY_LIMIT,
    }),
  };
}

function rejectUnexpectedQueryParameters(
  searchParams: URLSearchParams,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  let unexpected: string | null = null;

  searchParams.forEach((_value, key) => {
    if (unexpected === null && !allowedSet.has(key)) {
      unexpected = key;
    }
  });

  if (unexpected !== null) {
    throw invalidRequest(`Unexpected query parameter: ${unexpected}.`);
  }
}

function readBoundedIntegerQuery(
  searchParams: URLSearchParams,
  fieldName: string,
  bounds: {
    readonly defaultValue: number;
    readonly minimum: number;
    readonly maximum: number;
  },
): number {
  const values = searchParams.getAll(fieldName);

  if (values.length === 0) {
    return bounds.defaultValue;
  }

  if (values.length !== 1) {
    throw invalidRequest(
      `Exactly one ${fieldName} query parameter is allowed.`,
    );
  }

  const rawValue = values[0]?.trim() ?? "";
  const value = Number(rawValue);

  if (
    !rawValue ||
    !Number.isInteger(value) ||
    value < bounds.minimum ||
    value > bounds.maximum
  ) {
    throw invalidRequest(
      `${fieldName} must be an integer from ${bounds.minimum} through ${bounds.maximum}.`,
    );
  }

  return value;
}

function invalidRequest(message: string): EdgeActivationError {
  return new EdgeActivationError(
    "invalid_player_stock_asset_request",
    message,
    400,
    false,
  );
}

function invalidRequestResponse(message: string): Response {
  return jsonError(400, {
    code: "invalid_player_stock_asset_request",
    message,
    retryable: false,
  });
}

function playerMarketJsonResponse<TBody>(body: TBody): Response {
  const response = jsonResponse<TBody>(200, body);

  response.headers.set("cache-control", "private, no-store");
  response.headers.set("vary", "authorization, x-player-session-token");

  return response;
}
