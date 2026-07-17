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
  type StockMarketPlayerAssetDto,
  type StockMarketPlayerAssetReadRepository,
} from "../contracts/stockMarketPlayerAssetReadContracts.ts";
import { StockMarketReadError } from "../contracts/stockMarketReadContracts.ts";
import {
  StockMarketWatchlistError,
  type StockMarketWatchlistListSuccessBody,
  type StockMarketWatchlistMutationSuccessBody,
  type StockMarketWatchlistRepository,
} from "../contracts/stockMarketWatchlistContracts.ts";
import {
  SupabaseStockMarketReadRepository,
} from "../infrastructure/supabaseStockMarketReadRepository.ts";
import {
  SupabaseStockMarketWatchlistRepository,
} from "../infrastructure/supabaseStockMarketWatchlistRepository.ts";
import type {
  PlayerStockMarketWatchlistRoute,
} from "./playerStockMarketWatchlistRoutePaths.ts";

const DEFAULT_WATCHLIST_LIMIT = 50;
const MAX_WATCHLIST_LIMIT = 100;
const MAX_WATCHLIST_OFFSET = 10_000;

interface PlayerStockMarketWatchlistHttpDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: () =>
    | { readonly ok: true; readonly value: SupabaseEnv }
    | { readonly ok: false; readonly missing: readonly string[] };
  readonly hashSessionToken?: (sessionToken: string) => Promise<string>;
  readonly resolvePlayerSession?: (
    serviceClient: EdgeSupabaseClient,
    sessionTokenHash: string,
  ) => ReturnType<typeof resolveActivePlayerSession>;
  readonly createAssetRepository?: (
    client: EdgeSupabaseClient,
  ) => StockMarketPlayerAssetReadRepository;
  readonly createWatchlistRepository?: (
    client: EdgeSupabaseClient,
  ) => StockMarketWatchlistRepository;
}

export async function handlePlayerStockMarketWatchlistRequest(
  request: Request,
  route: PlayerStockMarketWatchlistRoute,
  dependencies: PlayerStockMarketWatchlistHttpDependencies,
): Promise<Response> {
  if (route.kind === "malformed") {
    return invalidRequestResponse(
      "Watchlist item paths require exactly one valid UUID assetId.",
    );
  }

  if (route.kind === "watchlist" && request.method !== "GET") {
    return methodNotAllowed("Use GET to read the player stock watchlist.");
  }

  if (
    route.kind === "watchlist_asset" &&
    request.method !== "PUT" &&
    request.method !== "DELETE"
  ) {
    return methodNotAllowed(
      "Use PUT to add or DELETE to remove a player stock watchlist asset.",
    );
  }

  if (request.headers.has("x-stock-market-runner-secret")) {
    return jsonError(400, {
      code: "stock_runner_secret_not_allowed",
      message:
        "Player watchlist requests must not send the stock market runner secret.",
      retryable: false,
    });
  }

  try {
    const url = new URL(request.url);
    rejectClientSuppliedIdentity(url.searchParams, request.headers);
    const listQuery = route.kind === "watchlist"
      ? readWatchlistQuery(url.searchParams)
      : null;

    if (route.kind === "watchlist_asset") {
      rejectUnexpectedQueryParameters(url.searchParams, []);
      await rejectMutationBody(request);
    }

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

    const assetRepository = dependencies.createAssetRepository
      ? dependencies.createAssetRepository(serviceClient)
      : new SupabaseStockMarketReadRepository(serviceClient as never);
    const watchlistRepository = dependencies.createWatchlistRepository
      ? dependencies.createWatchlistRepository(serviceClient)
      : new SupabaseStockMarketWatchlistRepository(serviceClient as never);
    const gameSessionId = sessionResult.session.game_session_id;
    const playerId = sessionResult.session.player_id;

    if (route.kind === "watchlist") {
      if (!listQuery) {
        throw invalidRequest("Watchlist pagination could not be resolved.");
      }

      const entries = await watchlistRepository.listWatchlist({
        gameSessionId,
        playerId,
        limit: listQuery.limit,
        offset: listQuery.offset,
      });
      const assetRead = await assetRepository.readPlayerAssetsByIds({
        gameSessionId,
        assetIds: entries.assetIds,
      });
      const assetsById = new Map(
        assetRead.assets.map((asset) => [asset.assetId, asset] as const),
      );
      const assets = entries.assetIds.flatMap((assetId) => {
        const asset = assetsById.get(assetId);

        return asset ? [toPlayerAssetDto(asset)] : [];
      });

      return playerWatchlistJsonResponse<StockMarketWatchlistListSuccessBody>({
        ok: true,
        action: "read_watchlist",
        tickIndex: assetRead.tickIndex,
        assets,
        pagination: {
          ...entries.pagination,
          returned: assets.length,
        },
      });
    }

    const isWatchlisted = request.method === "PUT";
    const result = await watchlistRepository.setWatchlisted({
      gameSessionId,
      playerId,
      assetId: route.assetId,
      isWatchlisted,
    });

    return playerWatchlistJsonResponse<StockMarketWatchlistMutationSuccessBody>(
      {
        ok: true,
        action: isWatchlisted ? "add_watchlist" : "remove_watchlist",
        assetId: route.assetId,
        isWatchlisted,
        changed: result.changed,
      },
    );
  } catch (error) {
    if (error instanceof StockMarketWatchlistError) {
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
      code: "player_stock_watchlist_failed",
      message: "Player stock watchlist request failed.",
      retryable: false,
    });
  }
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
    headers.has("x-econovaria-game-session-id")
  ) {
    throw invalidRequest(
      "Player watchlist scope is derived from x-player-session-token and must not be supplied by the client.",
    );
  }
}

function readWatchlistQuery(searchParams: URLSearchParams): {
  readonly limit: number;
  readonly offset: number;
} {
  rejectUnexpectedQueryParameters(searchParams, ["limit", "offset"]);

  return {
    limit: readBoundedIntegerQuery(searchParams, "limit", {
      defaultValue: DEFAULT_WATCHLIST_LIMIT,
      minimum: 1,
      maximum: MAX_WATCHLIST_LIMIT,
    }),
    offset: readBoundedIntegerQuery(searchParams, "offset", {
      defaultValue: 0,
      minimum: 0,
      maximum: MAX_WATCHLIST_OFFSET,
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

async function rejectMutationBody(request: Request): Promise<void> {
  const body = await request.text();

  if (body.trim()) {
    throw invalidRequest("Watchlist mutations do not accept a request body.");
  }
}

function toPlayerAssetDto(
  asset: Omit<StockMarketPlayerAssetDto, "isWatchlisted">,
): StockMarketPlayerAssetDto {
  return {
    ...asset,
    isWatchlisted: true,
  };
}

function invalidRequest(message: string): EdgeActivationError {
  return new EdgeActivationError(
    "invalid_player_stock_watchlist_request",
    message,
    400,
    false,
  );
}

function invalidRequestResponse(message: string): Response {
  return jsonError(400, {
    code: "invalid_player_stock_watchlist_request",
    message,
    retryable: false,
  });
}

function methodNotAllowed(message: string): Response {
  return jsonError(405, {
    code: "method_not_allowed",
    message,
    retryable: false,
  });
}

function playerWatchlistJsonResponse<TBody>(body: TBody): Response {
  const response = jsonResponse<TBody>(200, body);

  response.headers.set("cache-control", "private, no-store");
  response.headers.set("vary", "authorization, x-player-session-token");

  return response;
}
