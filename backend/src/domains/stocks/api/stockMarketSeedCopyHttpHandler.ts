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
  StockMarketSeedCopyError,
  type StockMarketSeedCopyMode,
  type StockMarketSeedCopyRepository,
  type StockMarketSeedCopyRequestBody,
  type StockMarketSeedCopySuccessBody,
} from "../contracts/stockMarketSeedCopyContracts.ts";
import {
  SupabaseStockMarketSeedCopyRepository,
} from "../infrastructure/supabaseStockMarketSeedCopyRepository.ts";

declare const Deno: {
  readonly env: {
    get(name: string): string | undefined;
  };
};

interface StockMarketSeedCopyHttpDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: () =>
    | { readonly ok: true; readonly value: SupabaseEnv }
    | { readonly ok: false; readonly missing: readonly string[] };
  readonly readRunnerSecret?: () => string | undefined;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => StockMarketSeedCopyRepository;
}

export async function handleStockMarketSeedCopyRequest(
  request: Request,
  dependencies: StockMarketSeedCopyHttpDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to initialize stock market assets.",
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

    const body = await readStockMarketSeedCopyRequestBody(request);
    const serviceClient = dependencies.createServiceClient(envResult.value);
    const repository = dependencies.createRepository
      ? dependencies.createRepository(serviceClient)
      : new SupabaseStockMarketSeedCopyRepository(serviceClient as any);
    const result = await repository.initialize({
      gameSessionId: body.gameSessionId,
      mode: body.mode ?? "missing_only",
    });

    return jsonResponse<StockMarketSeedCopySuccessBody>(200, {
      ok: true,
      gameSessionId: result.gameSessionId,
      templatesAvailable: result.templatesAvailable,
      assetsBefore: result.assetsBefore,
      assetsInserted: result.assetsInserted,
      baselineTicksInserted: result.baselineTicksInserted,
      assetsAfter: result.assetsAfter,
    });
  } catch (error) {
    if (error instanceof StockMarketSeedCopyError) {
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
      code: "stock_market_seed_copy_failed",
      message: "Stock market seed copy failed.",
      retryable: false,
    });
  }
}

async function readStockMarketSeedCopyRequestBody(
  request: Request,
): Promise<StockMarketSeedCopyRequestBody> {
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
    throw invalidRequest("Stock market seed copy accepts exactly one gameSessionId per request.");
  }

  const gameSessionId = typeof value.gameSessionId === "string"
    ? value.gameSessionId.trim()
    : "";

  if (!gameSessionId) {
    throw invalidRequest("gameSessionId is required.");
  }

  return {
    gameSessionId,
    mode: readOptionalMode(value.mode),
  };
}

function readOptionalMode(value: unknown): StockMarketSeedCopyMode | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (value === "missing_only" || value === "reset_empty_only") {
    return value;
  }

  throw invalidRequest("mode must be missing_only or reset_empty_only when provided.");
}

function invalidRequest(message: string): StockMarketSeedCopyError {
  return new StockMarketSeedCopyError(
    "invalid_stock_market_seed_copy_request",
    message,
    400,
  );
}
