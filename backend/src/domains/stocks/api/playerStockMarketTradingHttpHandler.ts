import {
  EdgeActivationError,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
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
  type PlayerSafeStockMarketTradingExecuteSuccessBody,
  type StockMarketOrderSide,
  StockMarketTradingError,
  type StockMarketTradingRepository,
  type StockMarketTradingSuccessBody,
} from "../contracts/stockMarketTradingContracts.ts";
import {
  SupabaseStockMarketTradingRepository,
} from "../infrastructure/supabaseStockMarketTradingRepository.ts";

interface PlayerStockMarketTradingHttpDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: () =>
    | { readonly ok: true; readonly value: SupabaseEnv }
    | { readonly ok: false; readonly missing: readonly string[] };
  readonly hashSessionToken?: (sessionToken: string) => Promise<string>;
  readonly resolvePlayerSession?: (
    serviceClient: EdgeSupabaseClient,
    sessionTokenHash: string,
  ) => ReturnType<typeof resolveActivePlayerSession>;
  readonly resolveStockAssetByTicker?: (
    client: EdgeSupabaseClient,
    gameSessionId: string,
    ticker: string,
  ) => Promise<ResolvedStockAsset>;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => StockMarketTradingRepository;
}

interface PlayerStockMarketTradingBody {
  readonly gameSessionId: string | null;
  readonly stockAssetId: string | null;
  readonly ticker: string | null;
  readonly expectedPrice: number | null;
  readonly side: StockMarketOrderSide;
  readonly quantity: number;
  readonly idempotencyKey: string;
}

interface ResolvedPlayerSession {
  readonly session: {
    readonly id: string;
    readonly game_session_id: string;
    readonly player_id: string;
  };
}

interface ResolvedStockAsset {
  readonly stockAssetId: string;
  readonly ticker: string;
  readonly currentPrice: number;
}

export async function handlePlayerStockMarketTradingRequest(
  request: Request,
  dependencies: PlayerStockMarketTradingHttpDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to execute player stock orders.",
      retryable: false,
    });
  }

  if (request.headers.has("x-stock-market-runner-secret")) {
    return jsonError(400, {
      code: "stock_runner_secret_not_allowed",
      message: "Player stock trading must not send the stock market runner secret.",
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

    const sessionToken = readPlayerSessionTokenFromRequest(request);

    if (!sessionToken) {
      return invalidPlayerSessionResponse();
    }

    const body = await readPlayerStockMarketTradingBody(request);
    const serviceClient = dependencies.createServiceClient(envResult.value);
    const sessionTokenHash = await (dependencies.hashSessionToken ?? sha256Hex)(
      sessionToken,
    );
    const sessionResult = await (dependencies.resolvePlayerSession ??
      resolveActivePlayerSession)(serviceClient, sessionTokenHash);

    if (!sessionResult.ok) {
      return jsonError(sessionResult.status, sessionResult.error);
    }

    const publicTickerRequest = body.ticker !== null;
    const gameSessionId = body.gameSessionId ??
      sessionResult.session.game_session_id;

    if (body.gameSessionId) {
      assertRequestedSessionMatchesResolvedSession(
        body.gameSessionId,
        sessionResult,
      );
    }

    let stockAssetId = body.stockAssetId;
    let resolvedTicker = body.ticker;

    if (publicTickerRequest) {
      const asset = await (dependencies.resolveStockAssetByTicker ??
        resolveStockAssetByTicker)(
          serviceClient,
          gameSessionId,
          body.ticker as string,
        );
      assertExpectedPriceMatches(body.expectedPrice, asset.currentPrice);
      stockAssetId = asset.stockAssetId;
      resolvedTicker = asset.ticker;
    }

    if (!stockAssetId) {
      throw invalidRequest("stockAssetId or ticker is required.");
    }

    const repository = dependencies.createRepository
      ? dependencies.createRepository(serviceClient)
      : new SupabaseStockMarketTradingRepository(serviceClient as any);
    const result = await repository.executeOrder({
      gameSessionId,
      playerSessionId: sessionResult.session.id,
      stockAssetId,
      side: body.side,
      quantity: body.quantity,
      idempotencyKey: body.idempotencyKey,
    });

    if (publicTickerRequest) {
      return jsonResponse<PlayerSafeStockMarketTradingExecuteSuccessBody>(200, {
        ok: true,
        action: "execute_order",
        order: {
          ticker: resolvedTicker ?? result.order.ticker,
          side: result.order.side,
          quantity: result.order.quantity,
          executionPrice: result.order.executionPrice,
          grossValue: result.order.grossValue,
          status: result.order.status,
          rejectionReason: result.order.rejectionReason,
        },
        cash: result.cash,
        holding: result.holding,
      });
    }

    return jsonResponse<StockMarketTradingSuccessBody>(200, {
      ok: true,
      action: "execute_order",
      order: result.order,
      cash: result.cash,
      holding: result.holding,
    });
  } catch (error) {
    if (error instanceof StockMarketTradingError) {
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
      code: "player_stock_trading_failed",
      message: "Player stock order could not be completed.",
      retryable: false,
    });
  }
}

async function readPlayerStockMarketTradingBody(
  request: Request,
): Promise<PlayerStockMarketTradingBody> {
  let value: unknown;

  try {
    value = await request.json();
  } catch (_error) {
    throw invalidRequest("Request body must be valid JSON.");
  }

  if (!isRecord(value)) {
    throw invalidRequest("Request body must be a JSON object.");
  }

  rejectBodySuppliedPlayerSessionFields(value);
  rejectArrayShapedFields(value);

  const ticker = readOptionalTicker(value.ticker);
  const stockAssetId = readOptionalString(value.stockAssetId);

  if (ticker && stockAssetId) {
    throw invalidRequest("Send ticker, not stockAssetId, for the public player order boundary.");
  }

  if (!ticker && !stockAssetId) {
    throw invalidRequest("ticker or stockAssetId is required.");
  }

  const gameSessionId = readOptionalString(value.gameSessionId);

  if (!ticker && !gameSessionId) {
    throw invalidRequest("gameSessionId is required for the legacy stockAssetId boundary.");
  }

  return {
    gameSessionId,
    stockAssetId,
    ticker,
    expectedPrice: ticker
      ? readPositiveNumber(value.expectedPrice, "expectedPrice")
      : null,
    side: readOrderSide(value.side),
    quantity: readPositiveNumber(value.quantity, "quantity"),
    idempotencyKey: readRequiredString(
      value.idempotencyKey,
      "idempotencyKey",
    ),
  };
}

function rejectBodySuppliedPlayerSessionFields(
  value: Record<string, unknown>,
): void {
  if (
    "playerSessionId" in value ||
    "playerSessionIds" in value ||
    "playerId" in value ||
    "playerIds" in value
  ) {
    throw invalidRequest(
      "Player identity must not be sent; player stock trading derives it from x-player-session-token.",
    );
  }
}

function rejectArrayShapedFields(value: Record<string, unknown>): void {
  if (
    Array.isArray(value.gameSessionId) ||
    Array.isArray(value.gameSessionIds) ||
    Array.isArray(value.gameSessions) ||
    Array.isArray(value.sessions) ||
    Array.isArray(value.stockAssetId) ||
    Array.isArray(value.stockAssetIds) ||
    Array.isArray(value.ticker) ||
    Array.isArray(value.tickers) ||
    Array.isArray(value.expectedPrice) ||
    Array.isArray(value.idempotencyKey) ||
    Array.isArray(value.idempotencyKeys)
  ) {
    throw invalidRequest(
      "Player stock trading accepts exactly one asset, expectedPrice, and idempotencyKey per request.",
    );
  }
}

function assertRequestedSessionMatchesResolvedSession(
  gameSessionId: string,
  sessionResult: ResolvedPlayerSession,
): void {
  if (sessionResult.session.game_session_id !== gameSessionId) {
    throw new EdgeActivationError(
      "invalid_player_session_scope",
      "Requested game session does not match the authenticated player session.",
      401,
      false,
    );
  }
}

function assertExpectedPriceMatches(
  expectedPrice: number | null,
  currentPrice: number,
): void {
  if (
    expectedPrice === null ||
    Math.abs(expectedPrice - currentPrice) > 0.0001
  ) {
    throw new StockMarketTradingError(
      "stale_stock_price",
      "The reviewed stock price is stale. Refresh the market before confirming the order.",
      409,
    );
  }
}

async function resolveStockAssetByTicker(
  client: EdgeSupabaseClient,
  gameSessionId: string,
  ticker: string,
): Promise<ResolvedStockAsset> {
  const response = await (client as any)
    .from("game_session_stock_assets")
    .select("id,ticker,current_price")
    .eq("game_session_id", gameSessionId)
    .eq("ticker", ticker)
    .eq("is_active", true)
    .maybeSingle();

  if (response.error) {
    const message = String(response.error.message ?? "").toLowerCase();
    if (
      response.error.code === "42P01" ||
      response.error.code === "42703" ||
      message.includes("does not exist") ||
      message.includes("schema cache")
    ) {
      throw new StockMarketTradingError(
        "stock_market_trading_schema_not_applied",
        "Stock market trading schema is not applied.",
        500,
      );
    }
    throw new StockMarketTradingError(
      "stock_market_trading_failed",
      "Stock market asset resolution failed.",
      500,
    );
  }

  const row = response.data;
  if (!row?.id) {
    throw new StockMarketTradingError(
      "stock_asset_not_found",
      "Stock asset could not be found in this game session.",
      404,
    );
  }

  const currentPrice = Number(row.current_price);
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    throw new StockMarketTradingError(
      "invalid_stock_market_trading_state",
      "Stock asset price is unavailable for trading.",
      409,
    );
  }

  return {
    stockAssetId: String(row.id),
    ticker: normalizeTicker(String(row.ticker ?? ticker)),
    currentPrice,
  };
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = readOptionalString(value);

  if (!text) {
    throw invalidRequest(`${fieldName} is required.`);
  }

  return text;
}

function readOptionalString(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function readOptionalTicker(value: unknown): string | null {
  const text = readOptionalString(value);
  if (!text) return null;
  const ticker = normalizeTicker(text);
  if (!/^[A-Z0-9][A-Z0-9.-]{0,15}$/.test(ticker)) {
    throw invalidRequest("ticker must be a valid public market ticker.");
  }
  return ticker;
}

function normalizeTicker(value: string): string {
  return value.trim().toUpperCase();
}

function readOrderSide(value: unknown): StockMarketOrderSide {
  const side = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (side === "buy" || side === "sell") {
    return side;
  }

  throw invalidRequest("side must be buy or sell.");
}

function readPositiveNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw invalidRequest(`${fieldName} must be a positive number.`);
  }

  return value;
}

function invalidRequest(message: string): StockMarketTradingError {
  return new StockMarketTradingError(
    "invalid_stock_market_trading_request",
    message,
    400,
  );
}
