import {
  EdgeActivationError,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import {
  type EdgeSupabaseClient,
  type SupabaseEnv,
  readSupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  StockMarketReadError,
  type StockMarketReadRepository,
  type StockMarketReadRequestBody,
  type StockMarketReadSuccessBody,
} from "../contracts/stockMarketReadContracts.ts";
import {
  SupabaseStockMarketReadRepository,
} from "../infrastructure/supabaseStockMarketReadRepository.ts";

declare const Deno: {
  readonly env: {
    get(name: string): string | undefined;
  };
};

interface StockMarketReadHttpDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: () =>
    | { readonly ok: true; readonly value: SupabaseEnv }
    | { readonly ok: false; readonly missing: readonly string[] };
  readonly readRunnerSecret?: () => string | undefined;
  readonly createRepository?: (client: EdgeSupabaseClient) => StockMarketReadRepository;
}

export async function handleStockMarketReadRequest(
  request: Request,
  dependencies: StockMarketReadHttpDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to read stock market data.",
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

    const body = await readStockMarketReadRequestBody(request);
    const serviceClient = dependencies.createServiceClient(envResult.value);
    const repository = dependencies.createRepository
      ? dependencies.createRepository(serviceClient)
      : new SupabaseStockMarketReadRepository(serviceClient as any);
    const result = await repository.read({
      gameSessionId: body.gameSessionId,
      ticker: body.ticker,
      includeHistory: body.includeHistory ?? body.ticker !== undefined,
      historyLimit: normalizeHistoryLimit(body.historyLimit),
    });

    return jsonResponse<StockMarketReadSuccessBody>(200, {
      ok: true,
      ...result,
    });
  } catch (error) {
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
      code: "stock_market_read_failed",
      message: "Stock market read failed.",
      retryable: false,
    });
  }
}

async function readStockMarketReadRequestBody(
  request: Request,
): Promise<StockMarketReadRequestBody> {
  let value: unknown;

  try {
    value = await request.json();
  } catch (_error) {
    throw invalidRequest("Request body must be valid JSON.");
  }

  if (!isRecord(value)) {
    throw invalidRequest("Request body must be a JSON object.");
  }

  if (
    Array.isArray(value.gameSessionId) ||
    Array.isArray(value.gameSessionIds) ||
    Array.isArray(value.gameSessions) ||
    Array.isArray(value.sessions)
  ) {
    throw invalidRequest("Stock market read accepts exactly one gameSessionId per request.");
  }

  const gameSessionId = typeof value.gameSessionId === "string"
    ? value.gameSessionId.trim()
    : "";

  if (!gameSessionId) {
    throw invalidRequest("gameSessionId is required.");
  }

  return {
    gameSessionId,
    ticker: readOptionalTicker(value.ticker),
    includeHistory: readOptionalBoolean(value.includeHistory, "includeHistory"),
    historyLimit: readOptionalHistoryLimit(value.historyLimit),
  };
}

function readOptionalTicker(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const ticker = typeof value === "string" ? value.trim().toUpperCase() : "";

  if (!ticker) {
    throw invalidRequest("ticker must be a non-empty string when provided.");
  }

  return ticker;
}

function readOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw invalidRequest(`${fieldName} must be a boolean when provided.`);
  }

  return value;
}

function readOptionalHistoryLimit(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw invalidRequest("historyLimit must be a positive integer when provided.");
  }

  return value;
}

function normalizeHistoryLimit(value: number | undefined): number {
  return Math.min(value ?? 200, 1000);
}

function invalidRequest(message: string): StockMarketReadError {
  return new StockMarketReadError(
    "invalid_stock_market_read_request",
    message,
    400,
  );
}
