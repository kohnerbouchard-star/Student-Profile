import {
  EdgeActivationError,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  type StockMarketOrderSide,
  StockMarketTradingError,
  type StockMarketTradingRepository,
  type StockMarketTradingRequestBody,
  type StockMarketTradingSuccessBody,
} from "../contracts/stockMarketTradingContracts.ts";
import {
  SupabaseStockMarketTradingRepository,
} from "../infrastructure/supabaseStockMarketTradingRepository.ts";

declare const Deno: {
  readonly env: {
    get(name: string): string | undefined;
  };
};

interface StockMarketTradingHttpDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: () =>
    | { readonly ok: true; readonly value: SupabaseEnv }
    | { readonly ok: false; readonly missing: readonly string[] };
  readonly readRunnerSecret?: () => string | undefined;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => StockMarketTradingRepository;
}

export async function handleStockMarketTradingRequest(
  request: Request,
  dependencies: StockMarketTradingHttpDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST for stock market trading.",
      retryable: false,
    });
  }

  const expectedSecret = dependencies.readRunnerSecret
    ? dependencies.readRunnerSecret()
    : Deno.env.get("STOCK_MARKET_RUNNER_SECRET");

  if (!expectedSecret) {
    return jsonError(500, {
      code: "stock_market_runner_secret_not_configured",
      message: "Stock market runner secret is not configured.",
      retryable: false,
    });
  }

  if (request.headers.get("x-stock-market-runner-secret") !== expectedSecret) {
    return jsonError(401, {
      code: "unauthorized_stock_market_runner",
      message: "Stock market runner secret is missing or invalid.",
      retryable: false,
    });
  }

  try {
    const envResult = (dependencies.readSupabaseEnv ?? readSupabaseEnv)();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Supabase Edge runtime configuration is missing.",
        retryable: false,
      });
    }

    const body = await readStockMarketTradingRequestBody(request);
    const serviceClient = dependencies.createServiceClient(envResult.value);
    const repository = dependencies.createRepository
      ? dependencies.createRepository(serviceClient)
      : new SupabaseStockMarketTradingRepository(serviceClient as any);

    if (body.action === "initialize_portfolio") {
      const portfolio = await repository.initializePortfolio({
        gameSessionId: body.gameSessionId,
        playerSessionId: body.playerSessionId,
        startingCash: body.startingCash ?? 10000,
      });

      return jsonResponse<StockMarketTradingSuccessBody>(200, {
        ok: true,
        action: "initialize_portfolio",
        portfolio,
      });
    }

    const result = await repository.executeOrder({
      gameSessionId: body.gameSessionId,
      playerSessionId: body.playerSessionId,
      stockAssetId: body.stockAssetId,
      side: body.side,
      quantity: body.quantity,
      idempotencyKey: body.idempotencyKey,
    });

    return jsonResponse<StockMarketTradingSuccessBody>(200, {
      ok: true,
      action: "execute_order",
      order: result.order,
      portfolio: result.portfolio,
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
      code: "stock_market_trading_failed",
      message: "Stock market trading failed.",
      retryable: false,
    });
  }
}

async function readStockMarketTradingRequestBody(
  request: Request,
): Promise<StockMarketTradingRequestBody> {
  let value: unknown;

  try {
    value = await request.json();
  } catch (_error) {
    throw invalidRequest("Request body must be valid JSON.");
  }

  if (!isRecord(value)) {
    throw invalidRequest("Request body must be a JSON object.");
  }

  rejectMultipleSessionShape(value);

  const action = typeof value.action === "string" ? value.action.trim() : "";
  const gameSessionId = readRequiredString(
    value.gameSessionId,
    "gameSessionId",
  );
  const playerSessionId = readRequiredString(
    value.playerSessionId,
    "playerSessionId",
  );

  if (action === "initialize_portfolio") {
    return {
      action,
      gameSessionId,
      playerSessionId,
      startingCash: readOptionalStartingCash(value.startingCash),
    };
  }

  if (action === "execute_order") {
    return {
      action,
      gameSessionId,
      playerSessionId,
      stockAssetId: readRequiredString(value.stockAssetId, "stockAssetId"),
      side: readOrderSide(value.side),
      quantity: readPositiveNumber(value.quantity, "quantity"),
      idempotencyKey: readRequiredString(
        value.idempotencyKey,
        "idempotencyKey",
      ),
    };
  }

  throw invalidRequest("action must be initialize_portfolio or execute_order.");
}

function rejectMultipleSessionShape(value: Record<string, unknown>): void {
  if (
    Array.isArray(value.gameSessionId) ||
    Array.isArray(value.gameSessionIds) ||
    Array.isArray(value.gameSessions) ||
    Array.isArray(value.sessions) ||
    Array.isArray(value.playerSessionId) ||
    Array.isArray(value.playerSessionIds)
  ) {
    throw invalidRequest(
      "Stock market trading accepts exactly one gameSessionId and playerSessionId per request.",
    );
  }
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    throw invalidRequest(`${fieldName} is required.`);
  }

  return text;
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

function readOptionalStartingCash(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw invalidRequest(
      "startingCash must be a non-negative number when provided.",
    );
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
