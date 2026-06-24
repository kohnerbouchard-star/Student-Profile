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
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => StockMarketTradingRepository;
}

interface PlayerStockMarketTradingBody {
  readonly gameSessionId: string;
  readonly playerSessionId: string;
  readonly stockAssetId: string;
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

    assertRequestedSessionMatchesResolvedSession(
      body.gameSessionId,
      body.playerSessionId,
      sessionResult,
    );

    const repository = dependencies.createRepository
      ? dependencies.createRepository(serviceClient)
      : new SupabaseStockMarketTradingRepository(serviceClient as any);
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

  rejectArrayShapedFields(value);

  return {
    gameSessionId: readRequiredString(value.gameSessionId, "gameSessionId"),
    playerSessionId: readRequiredString(
      value.playerSessionId,
      "playerSessionId",
    ),
    stockAssetId: readRequiredString(value.stockAssetId, "stockAssetId"),
    side: readOrderSide(value.side),
    quantity: readPositiveNumber(value.quantity, "quantity"),
    idempotencyKey: readRequiredString(
      value.idempotencyKey,
      "idempotencyKey",
    ),
  };
}

function rejectArrayShapedFields(value: Record<string, unknown>): void {
  if (
    Array.isArray(value.gameSessionId) ||
    Array.isArray(value.gameSessionIds) ||
    Array.isArray(value.gameSessions) ||
    Array.isArray(value.sessions) ||
    Array.isArray(value.playerSessionId) ||
    Array.isArray(value.playerSessionIds) ||
    Array.isArray(value.stockAssetId) ||
    Array.isArray(value.stockAssetIds) ||
    Array.isArray(value.idempotencyKey) ||
    Array.isArray(value.idempotencyKeys)
  ) {
    throw invalidRequest(
      "Player stock trading accepts exactly one gameSessionId, playerSessionId, stockAssetId, and idempotencyKey per request.",
    );
  }
}

function assertRequestedSessionMatchesResolvedSession(
  gameSessionId: string,
  playerSessionId: string,
  sessionResult: ResolvedPlayerSession,
): void {
  if (
    sessionResult.session.game_session_id !== gameSessionId ||
    sessionResult.session.id !== playerSessionId
  ) {
    throw new EdgeActivationError(
      "invalid_player_session_scope",
      "Requested player session does not match the authenticated player session.",
      401,
      false,
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

function invalidRequest(message: string): StockMarketTradingError {
  return new StockMarketTradingError(
    "invalid_stock_market_trading_request",
    message,
    400,
  );
}
