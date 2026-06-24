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
  type StockMarketPlayerReadAction,
  StockMarketPlayerReadError,
  type StockMarketPlayerReadRepository,
  type StockMarketPlayerReadRequestBody,
  type StockMarketPlayerReadSuccessBody,
} from "../contracts/stockMarketPlayerReadContracts.ts";
import {
  SupabaseStockMarketPlayerReadRepository,
} from "../infrastructure/supabaseStockMarketPlayerReadRepository.ts";

declare const Deno: {
  readonly env: {
    get(name: string): string | undefined;
  };
};

const DEFAULT_PLAYER_READ_LIMIT = 100;
const MAX_PLAYER_READ_LIMIT = 500;

interface StockMarketPlayerReadHttpDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: () =>
    | { readonly ok: true; readonly value: SupabaseEnv }
    | { readonly ok: false; readonly missing: readonly string[] };
  readonly readRunnerSecret?: () => string | undefined;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => StockMarketPlayerReadRepository;
}

export async function handleStockMarketPlayerReadRequest(
  request: Request,
  dependencies: StockMarketPlayerReadHttpDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to read stock market player data.",
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

    const body = await readStockMarketPlayerReadRequestBody(request);
    const serviceClient = dependencies.createServiceClient(envResult.value);
    const repository = dependencies.createRepository
      ? dependencies.createRepository(serviceClient)
      : new SupabaseStockMarketPlayerReadRepository(serviceClient as any);
    const result = await repository.read({
      action: body.action,
      gameSessionId: body.gameSessionId,
      playerSessionId: body.playerSessionId,
      limit: normalizeLimit(body.limit),
    });

    return jsonResponse<StockMarketPlayerReadSuccessBody>(200, {
      ok: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof StockMarketPlayerReadError) {
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
      code: "stock_market_player_read_failed",
      message: "Stock market player data could not be read.",
      retryable: false,
    });
  }
}

async function readStockMarketPlayerReadRequestBody(
  request: Request,
): Promise<StockMarketPlayerReadRequestBody> {
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

  return {
    action: readAction(value.action),
    gameSessionId: readRequiredString(value.gameSessionId, "gameSessionId"),
    playerSessionId: readRequiredString(
      value.playerSessionId,
      "playerSessionId",
    ),
    limit: readOptionalLimit(value.limit),
  };
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
      "Stock market player read accepts exactly one gameSessionId and playerSessionId per request.",
    );
  }
}

function readAction(value: unknown): StockMarketPlayerReadAction {
  const action = typeof value === "string" ? value.trim() : "";

  if (
    action === "read_portfolio" ||
    action === "read_holdings" ||
    action === "read_orders" ||
    action === "read_trades"
  ) {
    return action;
  }

  throw invalidRequest(
    "action must be read_portfolio, read_holdings, read_orders, or read_trades.",
  );
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    throw invalidRequest(`${fieldName} is required.`);
  }

  return text;
}

function readOptionalLimit(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw invalidRequest("limit must be a positive integer when provided.");
  }

  return value;
}

function normalizeLimit(value: number | undefined): number {
  return Math.min(value ?? DEFAULT_PLAYER_READ_LIMIT, MAX_PLAYER_READ_LIMIT);
}

function invalidRequest(message: string): StockMarketPlayerReadError {
  return new StockMarketPlayerReadError(
    "invalid_stock_market_player_read_request",
    message,
    400,
  );
}
