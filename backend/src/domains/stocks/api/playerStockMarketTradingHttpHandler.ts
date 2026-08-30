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
  type PlayerSafeStockMarketBuyQuoteSuccessBody,
  type PlayerSafeStockMarketBuySettlementSuccessBody,
  type PlayerSafeStockMarketSellSettlementSuccessBody,
  StockMarketTradingError,
  type PlayerStockMarketTradingRepository,
} from "../contracts/stockMarketTradingContracts.ts";
import {
  SupabaseStockMarketTradingRepository,
} from "../infrastructure/supabaseStockMarketTradingRepository.ts";
import { readPlayerStockMarketTradingBody } from "./playerStockMarketTradingRequest.ts";

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
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerStockMarketTradingRepository;
}

export async function handlePlayerStockMarketTradingRequest(
  request: Request,
  dependencies: PlayerStockMarketTradingHttpDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST for player Stock quote and settlement operations.",
      retryable: false,
    });
  }
  if (new URL(request.url).search) {
    return jsonError(400, {
      code: "invalid_stock_market_trading_request",
      message: "Player Stock trading does not accept query-string scope.",
      retryable: false,
    });
  }
  if (request.headers.has("x-stock-market-runner-secret")) {
    return jsonError(400, {
      code: "stock_runner_secret_not_allowed",
      message: "Player Stock trading must not send the Stock market runner secret.",
      retryable: false,
    });
  }

  try {
    const envResult = (dependencies.readSupabaseEnv ?? readSupabaseEnv)();
    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Player API runtime configuration is incomplete.",
        retryable: false,
      });
    }
    const sessionToken = readPlayerSessionTokenFromRequest(request);
    if (!sessionToken) return invalidPlayerSessionResponse();

    const serviceClient = dependencies.createServiceClient(envResult.value);
    const sessionTokenHash = await (dependencies.hashSessionToken ?? sha256Hex)(
      sessionToken,
    );
    const sessionResult = await (dependencies.resolvePlayerSession ??
      resolveActivePlayerSession)(serviceClient, sessionTokenHash);
    if (!sessionResult.ok) return jsonError(sessionResult.status, sessionResult.error);

    const body = await readPlayerStockMarketTradingBody(request);
    const repository = dependencies.createRepository
      ? dependencies.createRepository(serviceClient)
      : new SupabaseStockMarketTradingRepository(serviceClient as any);
    const scope = {
      gameSessionId: sessionResult.session.game_session_id,
      playerId: sessionResult.session.player_id,
    };

    if (body.action === "create_buy_quote") {
      const quote = await repository.createBuyQuote({
        ...scope,
        ticker: body.ticker,
        quantity: body.quantity,
        expectedPrice: body.expectedPrice,
        expectedTickIndex: body.expectedTickIndex,
        allocations: body.allocations,
        idempotencyKey: body.idempotencyKey,
      });
      return privateJsonResponse<PlayerSafeStockMarketBuyQuoteSuccessBody>(
        201,
        { ok: true, action: body.action, quote },
      );
    }
    if (body.action === "buy_now") {
      const quote = await repository.createBuyQuote({
        ...scope,
        ticker: body.ticker,
        quantity: body.quantity,
        expectedPrice: body.expectedPrice,
        expectedTickIndex: body.expectedTickIndex,
        allocations: body.allocations,
        idempotencyKey: body.idempotencyKey,
      });
      const settlement = await repository.settleBuyQuote({
        ...scope,
        quoteKey: quote.quoteKey,
        idempotencyKey: body.idempotencyKey,
      });
      return privateJsonResponse(200, {
        ok: true as const,
        action: body.action,
        quote,
        settlement,
      });
    }
    if (body.action === "settle_buy_quote") {
      const settlement = await repository.settleBuyQuote({
        ...scope,
        quoteKey: body.quoteKey,
        idempotencyKey: body.idempotencyKey,
      });
      return privateJsonResponse<PlayerSafeStockMarketBuySettlementSuccessBody>(
        200,
        { ok: true, action: body.action, settlement },
      );
    }
    const settlement = await repository.settleSell({
      ...scope,
      ticker: body.ticker,
      quantity: body.quantity,
      expectedPrice: body.expectedPrice,
      expectedTickIndex: body.expectedTickIndex,
      destinationAccountKey: body.destinationAccountKey,
      idempotencyKey: body.idempotencyKey,
    });
    return privateJsonResponse<PlayerSafeStockMarketSellSettlementSuccessBody>(
      200,
      { ok: true, action: body.action, settlement },
    );
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
      message: "Player Stock trading could not be completed.",
      retryable: false,
    });
  }
}

function privateJsonResponse<T>(status: number, body: T): Response {
  const response = jsonResponse<T>(status, body);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  return response;
}
