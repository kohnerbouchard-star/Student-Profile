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
  readonly ticker: string;
  readonly expectedPrice: number;
  readonly side: StockMarketOrderSide;
  readonly quantity: number;
  readonly idempotencyKey: string;
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

    const asset = await (dependencies.resolveStockAssetByTicker ??
      resolveStockAssetByTicker)(
        serviceClient,
        sessionResult.session.game_session_id,
        body.ticker,
      );
    assertExpectedPriceMatches(body.expectedPrice, asset.currentPrice);

    const repository = dependencies.createRepository
      ? dependencies.createRepository(serviceClient)
      : new SupabaseStockMarketTradingRepository(serviceClient as any);
    const result = await repository.executeOrder({
      gameSessionId: sessionResult.session.game_session_id,
      playerSessionId: sessionResult.session.id,
      stockAssetId: asset.stockAssetId,
      side: body.side,
      quantity: body.quantity,
      idempotencyKey: body.idempotencyKey,
    });

    return jsonResponse<PlayerSafeStockMarketTradingExecuteSuccessBody>(200, {
      ok: true,
      action: "execute_order",
      order: {
        ticker: asset.ticker,
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

  rejectPrivateScopeFields(value);
  rejectArrayShapedFields(value);

  return {
    ticker: readTicker(value.ticker),
    expectedPrice: readPositiveNumber(value.expectedPrice, "expectedPrice"),
    side: readOrderSide(value.side),
    quantity: readPositiveInteger(value.quantity, "quantity"),
    idempotencyKey: readRequiredString(
      value.idempotencyKey,
      "idempotencyKey",
    ),
  };
}

function rejectPrivateScopeFields(value: Record<string, unknown>): void {
  const forbidden = [
    "gameSessionId",
    "gameSessionIds",
    "playerSessionId",
    "playerSessionIds",
    "playerId",
    "playerIds",
    "stockAssetId",
    "stockAssetIds",
  ];

  if (forbidden.some((field) => field in value)) {
    throw invalidRequest(
      "Player stock trading derives game, player, and stock ownership scope server-side from the session token and public ticker.",
    );
  }
}

function rejectArrayShapedFields(value: Record<string, unknown>): void {
  if (
    Array.isArray(value.ticker) ||
    Array.isArray(value.tickers) ||
    Array.isArray(value.expectedPrice) ||
    Array.isArray(value.idempotencyKey) ||
    Array.isArray(value.idempotencyKeys)
  ) {
    throw invalidRequest(
      "Player stock trading accepts exactly one ticker, expectedPrice, and idempotencyKey per request.",
    );
  }
}

function assertExpectedPriceMatches(
  expectedPrice: number,
  currentPrice: number,
): void {
  if (Math.abs(expectedPrice - currentPrice) > 0.0001) {
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
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw invalidRequest(`${fieldName} is required.`);
  return text;
}

function readTicker(value: unknown): string {
  const ticker = normalizeTicker(readRequiredString(value, "ticker"));
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
  if (side === "buy" || side === "sell") return side;
  throw invalidRequest("side must be buy or sell.");
}

function readPositiveNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw invalidRequest(`${fieldName} must be a positive number.`);
  }
  return value;
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  const number = readPositiveNumber(value, fieldName);
  if (!Number.isInteger(number)) {
    throw invalidRequest(`${fieldName} must be a positive integer.`);
  }
  return number;
}

function invalidRequest(message: string): StockMarketTradingError {
  return new StockMarketTradingError(
    "invalid_stock_market_trading_request",
    message,
    400,
  );
}
